/// Davy Protocol — Seal Access Policy
///
/// On-chain gatekeeper evaluated by Seal key servers (via dry-run PTB)
/// to decide whether to release decryption keys.
///
/// SEPARATE PACKAGE from Davy core so it can be upgraded independently.
///
/// ## How Seal Evaluates This
///
/// 1. Client encrypts data with identity [ThisPkgId][inner_id_bytes]
///    using a Seal key server's IBE master public key.
///
/// 2. To decrypt, requester builds a PTB calling our `seal_approve`
///    with the inner_id bytes + proof objects (ExecutorCap / allowlist).
///    Key server dry-runs this PTB on a full node.
///
/// 3. If seal_approve returns (no abort) → key server releases the
///    derived decryption key. If it aborts → access denied.
///
/// ## Two Policies
///
/// - `seal_approve`           : ExecutorCap-gated (encrypted intents, anti-MEV)
/// - `seal_approve_allowlist` : Address-gated (private offers, dark pool)
///
/// ## Identity Schemes
///
/// - Encrypted intents:  inner_id = bcs::to_bytes(intent_id)   — 32 bytes
/// - Private offers:     inner_id = bcs::to_bytes(offer_id)    — 32 bytes
///
/// ## Seal Best Practices
///
/// - `entry fun` (non-public) per Seal docs for upgrade safety
/// - Identity bytes fully consumed (no trailing garbage)
/// - Versioned shared object pattern for the allowlist
///
module davy_seal_policy::seal_policy {
    use sui::bcs::{Self, BCS};
    use davy::capability::ExecutorCap;

    // ===== Errors =====

    /// Identity bytes are malformed (wrong length or trailing data).
    const EInvalidIdentity: u64 = 0;

    /// Caller is not on the allowlist for this private offer.
    const ENotOnAllowlist: u64 = 1;

    /// Allowlist version mismatch (stale object after package upgrade).
    const EWrongVersion: u64 = 2;

    // ===== Constants =====

    /// Bump on upgrade to invalidate stale shared objects.
    const CURRENT_VERSION: u64 = 1;

    // ===== Structs =====

    /// Per-offer allowlist for private/dark-pool offers (Task 10.4).
    /// Shared object so Seal key servers can read it during dry-run.
    /// Follows Seal's versioned shared object pattern.
    public struct PrivateOfferAllowlist has key, store {
        id: UID,
        version: u64,
        /// The offer whose encrypted terms this allowlist gates.
        offer_id: address,
        /// The maker who created this allowlist.
        maker: address,
        /// Addresses authorized to decrypt this offer's terms.
        allowed_addresses: vector<address>,
    }

    // =========================================================
    // POLICY 1 — ExecutorCap-gated (Encrypted Intents)
    // =========================================================
    //
    // Identity: [ThisPkgId][bcs::to_bytes(intent_id)]
    //
    // The key server PTB passes &ExecutorCap as an argument.
    // If the caller doesn't own one, the PTB fails at the
    // framework level before this function even runs.
    // Move's type system IS the access check.

    entry fun seal_approve(id: vector<u8>, _cap: &ExecutorCap) {
        // Deserialize: expect exactly 32 bytes (one Sui address).
        let mut prepared: BCS = bcs::new(id);
        let _intent_id = prepared.peel_address();

        // No trailing garbage allowed.
        let leftovers = prepared.into_remainder_bytes();
        assert!(leftovers.is_empty(), EInvalidIdentity);

        // If we reach here: cap is valid (type system), id is valid.
        // Key server releases the decryption key.
    }

    // =========================================================
    // POLICY 2 — Allowlist-gated (Private Offers)
    // =========================================================
    //
    // Identity: [ThisPkgId][bcs::to_bytes(offer_id)]
    //
    // The key server PTB passes the shared PrivateOfferAllowlist.
    // tx_context sender is checked against the allowlist.

    entry fun seal_approve_allowlist(
        id: vector<u8>,
        allowlist: &PrivateOfferAllowlist,
        ctx: &TxContext,
    ) {
        assert!(allowlist.version == CURRENT_VERSION, EWrongVersion);

        // Deserialize and validate identity bytes.
        let mut prepared: BCS = bcs::new(id);
        let offer_id = prepared.peel_address();
        let leftovers = prepared.into_remainder_bytes();
        assert!(leftovers.is_empty(), EInvalidIdentity);

        // Allowlist must be for THIS offer.
        assert!(allowlist.offer_id == offer_id, EInvalidIdentity);

        // Check sender is on the allowlist.
        let sender = tx_context::sender(ctx);
        let len = vector::length(&allowlist.allowed_addresses);
        let mut i = 0;
        let mut found = false;
        while (i < len) {
            if (*vector::borrow(&allowlist.allowed_addresses, i) == sender) {
                found = true;
                break
            };
            i = i + 1;
        };
        assert!(found, ENotOnAllowlist);
    }

    // =========================================================
    // Allowlist Management
    // =========================================================

    /// Create and share an allowlist for a private offer.
    public fun create_and_share_allowlist(
        offer_id: address,
        allowed_addresses: vector<address>,
        ctx: &mut TxContext,
    ) {
        let allowlist = PrivateOfferAllowlist {
            id: object::new(ctx),
            version: CURRENT_VERSION,
            offer_id,
            maker: tx_context::sender(ctx),
            allowed_addresses,
        };
        transfer::public_share_object(allowlist);
    }

    /// Add an address. Maker-only.
    public fun add_to_allowlist(
        allowlist: &mut PrivateOfferAllowlist,
        addr: address,
        ctx: &TxContext,
    ) {
        assert!(allowlist.maker == tx_context::sender(ctx), ENotOnAllowlist);
        assert!(allowlist.version == CURRENT_VERSION, EWrongVersion);
        // Deduplicate
        let len = vector::length(&allowlist.allowed_addresses);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(&allowlist.allowed_addresses, i) == addr) { return };
            i = i + 1;
        };
        vector::push_back(&mut allowlist.allowed_addresses, addr);
    }

    /// Remove an address. Maker-only.
    public fun remove_from_allowlist(
        allowlist: &mut PrivateOfferAllowlist,
        addr: address,
        ctx: &TxContext,
    ) {
        assert!(allowlist.maker == tx_context::sender(ctx), ENotOnAllowlist);
        assert!(allowlist.version == CURRENT_VERSION, EWrongVersion);
        let len = vector::length(&allowlist.allowed_addresses);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(&allowlist.allowed_addresses, i) == addr) {
                vector::swap_remove(&mut allowlist.allowed_addresses, i);
                return
            };
            i = i + 1;
        };
    }

    // ===== View Functions =====

    public fun allowlist_offer_id(a: &PrivateOfferAllowlist): address { a.offer_id }
    public fun allowlist_maker(a: &PrivateOfferAllowlist): address { a.maker }
    public fun allowlist_addresses(a: &PrivateOfferAllowlist): &vector<address> { &a.allowed_addresses }

    public fun is_allowed(a: &PrivateOfferAllowlist, addr: address): bool {
        let len = vector::length(&a.allowed_addresses);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(&a.allowed_addresses, i) == addr) { return true };
            i = i + 1;
        };
        false
    }

    // ===== Test-Only Wrappers =====
    // entry funs can't be called directly from other modules in tests,
    // so we expose public wrappers gated behind #[test_only].

    #[test_only]
    public fun seal_approve_for_testing(id: vector<u8>, cap: &ExecutorCap) {
        seal_approve(id, cap);
    }

    #[test_only]
    public fun seal_approve_allowlist_for_testing(
        id: vector<u8>,
        allowlist: &PrivateOfferAllowlist,
        ctx: &TxContext,
    ) {
        seal_approve_allowlist(id, allowlist, ctx);
    }

    #[test_only]
    public fun destroy_allowlist_for_testing(allowlist: PrivateOfferAllowlist) {
        let PrivateOfferAllowlist { id, version: _, offer_id: _, maker: _, allowed_addresses: _ } = allowlist;
        object::delete(id);
    }
}
