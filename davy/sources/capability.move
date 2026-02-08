/// Davy Protocol — Capability System
///
/// Two-tier capability model for protocol administration and
/// delegated intent execution.
///
/// ## Capabilities (V1)
///   - `AdminCap` — Created once at module publish. Gates all cap minting.
///   - `ExecutorCap` — Required for intent execution. Mintable, transferable, revocable.
///
/// ## PartialFillCap (Deprecated in V1)
///   Retained as a future extension point. Partial fills are controlled
///   by the offer's `fill_policy` field in V1.
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

    /// @deprecated V1: Partial fill capability — retained for future extension.
    /// Partial fills are controlled by offer `fill_policy` in V1. Do not use.
    public struct PartialFillCap has key, store {
        id: UID,
        /// Human-readable label
        label: vector<u8>,
        /// Address of the AdminCap holder who minted this cap
        minted_by: address,
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

    // ===== Destroy Functions (Revocation) =====

    /// Destroy an ExecutorCap — effectively revoking it.
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
