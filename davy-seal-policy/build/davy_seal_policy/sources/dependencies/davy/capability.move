/// Davy Protocol — Capability System
///
/// Two-tier capability model for protocol administration and
/// delegated intent execution.
///
/// ## Capabilities (V1)
///   - `AdminCap` — Created once at module publish. Gates all cap minting.
///   - `ExecutorCap` — Required for intent execution. Mintable, transferable, revocable.
///
/// ## PartialFillCap (V2 Gated Fill Policy)
///   Used with FILL_POLICY_PARTIAL_GATED (2) offers. Holders of a
///   PartialFillCap can perform partial fills on gated offers via
///   `offer::fill_partial_gated()`.
///
/// ## RevocationRegistry (V2 Security Upgrade)
///   Shared object holding revoked cap IDs. Admin can revoke compromised
///   ExecutorCaps or PartialFillCaps without needing the object itself.
///   Intent execution checks this registry before proceeding.
///
/// ## Minting Flow
///   Deployment → AdminCap → Deployer
///   AdminCap holder → mint_executor_cap() → ExecutorCap → Bot/DAO/Relayer
module davy::capability {
    use davy::errors;
    use davy::events;

    // ===== Structs =====

    /// Admin capability — created once at module publish via init().
    /// Holder can mint and destroy ExecutorCaps and PartialFillCaps.
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Executor capability — required for intent execution.
    /// Minted by AdminCap holder, transferable, revocable.
    public struct ExecutorCap has key, store {
        id: UID,
        /// Human-readable label (e.g. b"market_maker_1")
        label: vector<u8>,
        /// Address of the AdminCap holder who minted this cap
        minted_by: address,
    }

    /// Partial fill capability — required for V2 gated fill policy.
    /// Holders can call `offer::fill_partial_gated()` on offers with
    /// fill_policy == FILL_POLICY_PARTIAL_GATED (2).
    public struct PartialFillCap has key, store {
        id: UID,
        /// Human-readable label
        label: vector<u8>,
        /// Address of the AdminCap holder who minted this cap
        minted_by: address,
    }

    /// On-chain registry of revoked capability IDs. (Fix #4)
    /// Shared object — admin writes, intent execution reads.
    /// Call create_revocation_registry() once after upgrade to instantiate.
    public struct RevocationRegistry has key, store {
        id: UID,
        /// Revoked ExecutorCap IDs
        revoked_executor_caps: vector<ID>,
        /// Revoked PartialFillCap IDs
        revoked_partial_fill_caps: vector<ID>,
    }

    // ===== Init =====

    /// Module initializer — creates AdminCap and transfers to deployer.
    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap { id: object::new(ctx) };
        let cap_id = object::id(&admin_cap);
        let owner = tx_context::sender(ctx);
        events::emit_admin_cap_created(cap_id, owner);
        transfer::public_transfer(admin_cap, owner);
    }

    // ===== Mint Functions =====

    /// Mint a new ExecutorCap and transfer to recipient.
    public fun mint_executor_cap(
        _admin: &AdminCap,
        label: vector<u8>,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        assert!(vector::length(&label) > 0, errors::empty_label());
        let minted_by = tx_context::sender(ctx);
        let cap = ExecutorCap {
            id: object::new(ctx),
            label: copy label,
            minted_by,
        };
        let cap_id = object::id(&cap);
        events::emit_executor_cap_minted(cap_id, recipient, label, minted_by);
        transfer::public_transfer(cap, recipient);
    }

    /// Mint a new PartialFillCap and transfer to recipient.
    public fun mint_partial_fill_cap(
        _admin: &AdminCap,
        label: vector<u8>,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        assert!(vector::length(&label) > 0, errors::empty_label());
        let minted_by = tx_context::sender(ctx);
        let cap = PartialFillCap {
            id: object::new(ctx),
            label: copy label,
            minted_by,
        };
        let cap_id = object::id(&cap);
        events::emit_partial_fill_cap_minted(cap_id, recipient, label, minted_by);
        transfer::public_transfer(cap, recipient);
    }

    // ===== Destroy Functions (Revocation by Holder) =====

    /// Destroy an ExecutorCap — effectively revoking it.
    /// Callable by the cap holder. For admin revocation, use revoke_executor_cap_by_id.
    public fun destroy_executor_cap(cap: ExecutorCap) {
        let ExecutorCap { id, label: _, minted_by: _ } = cap;
        events::emit_executor_cap_destroyed(object::uid_to_inner(&id));
        object::delete(id);
    }

    /// Destroy a PartialFillCap — effectively revoking it.
    public fun destroy_partial_fill_cap(cap: PartialFillCap) {
        let PartialFillCap { id, label: _, minted_by: _ } = cap;
        events::emit_partial_fill_cap_destroyed(object::uid_to_inner(&id));
        object::delete(id);
    }

    // ===== Transfer Functions =====

    /// Transfer an ExecutorCap to a new owner.
    public fun transfer_executor_cap(cap: ExecutorCap, recipient: address) {
        transfer::public_transfer(cap, recipient);
    }

    /// Transfer the AdminCap to a new owner.
    /// ⚠️ Use with extreme caution — this hands over minting authority.
    public fun transfer_admin_cap(cap: AdminCap, recipient: address) {
        transfer::public_transfer(cap, recipient);
    }

    /// Transfer a PartialFillCap to a new owner.
    public fun transfer_partial_fill_cap(cap: PartialFillCap, recipient: address) {
        transfer::public_transfer(cap, recipient);
    }

    // ===== Revocation Registry (Fix #4) =====

    /// Create the shared RevocationRegistry. Call once after upgrade.
    /// Admin-gated to prevent unauthorized creation.
    public fun create_revocation_registry(
        _admin: &AdminCap,
        ctx: &mut TxContext,
    ) {
        let registry = RevocationRegistry {
            id: object::new(ctx),
            revoked_executor_caps: vector::empty(),
            revoked_partial_fill_caps: vector::empty(),
        };
        transfer::public_share_object(registry);
    }

    /// Admin revokes an ExecutorCap by ID. The cap object still exists but
    /// intent execution (v2) will reject it.
    public fun revoke_executor_cap_by_id(
        _admin: &AdminCap,
        registry: &mut RevocationRegistry,
        cap_id: ID,
    ) {
        // Prevent duplicate entries
        let mut i = 0;
        let len = vector::length(&registry.revoked_executor_caps);
        while (i < len) {
            assert!(
                *vector::borrow(&registry.revoked_executor_caps, i) != cap_id,
                errors::cap_already_revoked(),
            );
            i = i + 1;
        };
        vector::push_back(&mut registry.revoked_executor_caps, cap_id);
    }

    /// Admin revokes a PartialFillCap by ID.
    public fun revoke_partial_fill_cap_by_id(
        _admin: &AdminCap,
        registry: &mut RevocationRegistry,
        cap_id: ID,
    ) {
        let mut i = 0;
        let len = vector::length(&registry.revoked_partial_fill_caps);
        while (i < len) {
            assert!(
                *vector::borrow(&registry.revoked_partial_fill_caps, i) != cap_id,
                errors::partial_cap_already_revoked(),
            );
            i = i + 1;
        };
        vector::push_back(&mut registry.revoked_partial_fill_caps, cap_id);
    }

    /// Admin un-revokes an ExecutorCap (in case of mistake).
    public fun unrevoke_executor_cap(
        _admin: &AdminCap,
        registry: &mut RevocationRegistry,
        cap_id: ID,
    ) {
        let len = vector::length(&registry.revoked_executor_caps);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(&registry.revoked_executor_caps, i) == cap_id) {
                vector::swap_remove(&mut registry.revoked_executor_caps, i);
                return
            };
            i = i + 1;
        };
        abort errors::revocation_not_found()
    }

    /// Admin un-revokes a PartialFillCap.
    public fun unrevoke_partial_fill_cap(
        _admin: &AdminCap,
        registry: &mut RevocationRegistry,
        cap_id: ID,
    ) {
        let len = vector::length(&registry.revoked_partial_fill_caps);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(&registry.revoked_partial_fill_caps, i) == cap_id) {
                vector::swap_remove(&mut registry.revoked_partial_fill_caps, i);
                return
            };
            i = i + 1;
        };
        abort errors::revocation_not_found()
    }

    /// Check if an ExecutorCap ID is revoked.
    public fun is_executor_cap_revoked(
        registry: &RevocationRegistry,
        cap_id: ID,
    ): bool {
        let mut i = 0;
        let len = vector::length(&registry.revoked_executor_caps);
        while (i < len) {
            if (*vector::borrow(&registry.revoked_executor_caps, i) == cap_id) {
                return true
            };
            i = i + 1;
        };
        false
    }

    /// Check if a PartialFillCap ID is revoked.
    public fun is_partial_fill_cap_revoked(
        registry: &RevocationRegistry,
        cap_id: ID,
    ): bool {
        let mut i = 0;
        let len = vector::length(&registry.revoked_partial_fill_caps);
        while (i < len) {
            if (*vector::borrow(&registry.revoked_partial_fill_caps, i) == cap_id) {
                return true
            };
            i = i + 1;
        };
        false
    }

    // ===== View Functions =====

    /// Returns the label of an ExecutorCap.
    public fun executor_cap_label(cap: &ExecutorCap): &vector<u8> {
        &cap.label
    }

    /// Returns the address that minted this ExecutorCap.
    public fun executor_cap_minted_by(cap: &ExecutorCap): address {
        cap.minted_by
    }

    /// Returns the label of a PartialFillCap.
    public fun partial_fill_cap_label(cap: &PartialFillCap): &vector<u8> {
        &cap.label
    }

    /// Returns the address that minted this PartialFillCap.
    public fun partial_fill_cap_minted_by(cap: &PartialFillCap): address {
        cap.minted_by
    }

    // ===== Test-Only =====

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
