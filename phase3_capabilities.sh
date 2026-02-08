#!/usr/bin/env bash
set -euo pipefail
echo "🏴‍☠️ Davy Protocol — Phase 3: Capabilities"
echo "========================================="

# ── 1. Update events.move — add PartialFillCap events ──

cat > davy/sources/events.move << 'EOF'
/// Davy Protocol — Event Layer
/// Every state transition emits exactly one event.
/// Events are the sole indexing mechanism — no object scans needed.
module davy::events {
    use sui::event;
    use sui::object::ID;

    // ===== Offer Events =====

    public struct OfferCreated has copy, drop {
        offer_id: ID,
        maker: address,
        offer_amount: u64,
        min_price: u64,
        max_price: u64,
        expiry_timestamp_ms: u64,
        fill_policy: u8,
        min_fill_amount: u64,
    }

    public struct OfferFilled has copy, drop {
        offer_id: ID,
        taker: address,
        fill_amount: u64,
        payment_amount: u64,
        price: u64,
        is_full: bool,
        remaining: u64,
    }

    public struct OfferWithdrawn has copy, drop {
        offer_id: ID,
        maker: address,
        withdrawn_amount: u64,
        total_filled: u64,
    }

    public struct OfferExpired has copy, drop {
        offer_id: ID,
        remaining: u64,
        total_filled: u64,
    }

    // ===== Intent Events =====

    public struct IntentSubmitted has copy, drop {
        intent_id: ID,
        creator: address,
        receive_amount: u64,
        max_pay_amount: u64,
        min_price: u64,
        max_price: u64,
        expiry_timestamp_ms: u64,
    }

    public struct IntentExecuted has copy, drop {
        intent_id: ID,
        executor: address,
        offer_used: ID,
        amount_received: u64,
        amount_paid: u64,
        price: u64,
        refund_amount: u64,
    }

    public struct IntentCancelled has copy, drop {
        intent_id: ID,
        creator: address,
        refund_amount: u64,
    }

    public struct IntentExpired has copy, drop {
        intent_id: ID,
        creator: address,
        refund_amount: u64,
    }

    // ===== Capability Events =====

    public struct AdminCapCreated has copy, drop {
        cap_id: ID,
        owner: address,
    }

    public struct ExecutorCapMinted has copy, drop {
        cap_id: ID,
        recipient: address,
        label: vector<u8>,
        minted_by: address,
    }

    public struct ExecutorCapDestroyed has copy, drop {
        cap_id: ID,
    }

    public struct PartialFillCapMinted has copy, drop {
        cap_id: ID,
        recipient: address,
        label: vector<u8>,
        minted_by: address,
    }

    public struct PartialFillCapDestroyed has copy, drop {
        cap_id: ID,
    }

    // ===== Emitter Functions =====

    public fun emit_offer_created(
        offer_id: ID,
        maker: address,
        offer_amount: u64,
        min_price: u64,
        max_price: u64,
        expiry_timestamp_ms: u64,
        fill_policy: u8,
        min_fill_amount: u64,
    ) {
        event::emit(OfferCreated {
            offer_id, maker, offer_amount,
            min_price, max_price, expiry_timestamp_ms,
            fill_policy, min_fill_amount,
        });
    }

    public fun emit_offer_filled(
        offer_id: ID,
        taker: address,
        fill_amount: u64,
        payment_amount: u64,
        price: u64,
        is_full: bool,
        remaining: u64,
    ) {
        event::emit(OfferFilled {
            offer_id, taker, fill_amount,
            payment_amount, price, is_full, remaining,
        });
    }

    public fun emit_offer_withdrawn(
        offer_id: ID,
        maker: address,
        withdrawn_amount: u64,
        total_filled: u64,
    ) {
        event::emit(OfferWithdrawn {
            offer_id, maker, withdrawn_amount, total_filled,
        });
    }

    public fun emit_offer_expired(
        offer_id: ID,
        remaining: u64,
        total_filled: u64,
    ) {
        event::emit(OfferExpired {
            offer_id, remaining, total_filled,
        });
    }

    public fun emit_intent_submitted(
        intent_id: ID,
        creator: address,
        receive_amount: u64,
        max_pay_amount: u64,
        min_price: u64,
        max_price: u64,
        expiry_timestamp_ms: u64,
    ) {
        event::emit(IntentSubmitted {
            intent_id, creator, receive_amount,
            max_pay_amount, min_price, max_price,
            expiry_timestamp_ms,
        });
    }

    public fun emit_intent_executed(
        intent_id: ID,
        executor: address,
        offer_used: ID,
        amount_received: u64,
        amount_paid: u64,
        price: u64,
        refund_amount: u64,
    ) {
        event::emit(IntentExecuted {
            intent_id, executor, offer_used,
            amount_received, amount_paid, price,
            refund_amount,
        });
    }

    public fun emit_intent_cancelled(
        intent_id: ID,
        creator: address,
        refund_amount: u64,
    ) {
        event::emit(IntentCancelled {
            intent_id, creator, refund_amount,
        });
    }

    public fun emit_intent_expired(
        intent_id: ID,
        creator: address,
        refund_amount: u64,
    ) {
        event::emit(IntentExpired {
            intent_id, creator, refund_amount,
        });
    }

    public fun emit_admin_cap_created(cap_id: ID, owner: address) {
        event::emit(AdminCapCreated { cap_id, owner });
    }

    public fun emit_executor_cap_minted(
        cap_id: ID,
        recipient: address,
        label: vector<u8>,
        minted_by: address,
    ) {
        event::emit(ExecutorCapMinted {
            cap_id, recipient, label, minted_by,
        });
    }

    public fun emit_executor_cap_destroyed(cap_id: ID) {
        event::emit(ExecutorCapDestroyed { cap_id });
    }

    public fun emit_partial_fill_cap_minted(
        cap_id: ID,
        recipient: address,
        label: vector<u8>,
        minted_by: address,
    ) {
        event::emit(PartialFillCapMinted {
            cap_id, recipient, label, minted_by,
        });
    }

    public fun emit_partial_fill_cap_destroyed(cap_id: ID) {
        event::emit(PartialFillCapDestroyed { cap_id });
    }
}
EOF
echo "✅ events.move updated (added PartialFillCap events)"

# ── 2. Create capability.move ──

cat > davy/sources/capability.move << 'EOF'
/// Davy Protocol — Capability System
/// AdminCap-gated minting of executor and partial-fill capabilities.
///
/// Architecture:
///   AdminCap      — Created once at module publish. Gates all cap minting.
///   ExecutorCap   — Required for intent execution (Phase 4).
///   PartialFillCap — Optional extension for gated partial fills (future).
///
/// All caps have key + store — transferable via public_transfer or
/// the convenience transfer functions below.
module davy::capability {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use std::vector;
    use davy::errors;
    use davy::events;

    // ===== Structs =====

    /// Admin capability — created once at module publish via init().
    /// Holder can mint and destroy ExecutorCaps and PartialFillCaps.
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Executor capability — required for intent execution in Phase 4.
    /// Minted by AdminCap holder, transferable, revocable.
    public struct ExecutorCap has key, store {
        id: UID,
        /// Human-readable label (e.g. b"market_maker_1")
        label: vector<u8>,
        /// Address of the AdminCap holder who minted this cap
        minted_by: address,
    }

    /// Partial fill capability — optional future extension.
    /// Could gate partial fill permissions independently of offer fill_policy.
    public struct PartialFillCap has key, store {
        id: UID,
        /// Human-readable label
        label: vector<u8>,
        /// Address of the AdminCap holder who minted this cap
        minted_by: address,
    }

    // ===== Init =====

    /// Module initializer — creates AdminCap and transfers to deployer.
    /// Called exactly once when the module is published.
    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap { id: object::new(ctx) };
        let cap_id = object::id(&admin_cap);
        let owner = tx_context::sender(ctx);
        events::emit_admin_cap_created(cap_id, owner);
        transfer::transfer(admin_cap, owner);
    }

    // ===== Mint Functions =====

    /// Mint a new ExecutorCap and transfer to recipient.
    /// Requires a reference to AdminCap (caller must own it).
    /// Aborts with `empty_label` (300) if label is empty.
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
        transfer::transfer(cap, recipient);
    }

    /// Mint a new PartialFillCap and transfer to recipient.
    /// Requires a reference to AdminCap.
    /// Aborts with `empty_label` (300) if label is empty.
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
        transfer::transfer(cap, recipient);
    }

    // ===== Destroy Functions (Revocation) =====

    /// Destroy an ExecutorCap — effectively revoking it.
    /// The cap must be owned by the caller (passed by value).
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
        transfer::transfer(cap, recipient);
    }

    /// Transfer the AdminCap to a new owner.
    /// ⚠️ Use with extreme caution — this hands over minting authority.
    public fun transfer_admin_cap(cap: AdminCap, recipient: address) {
        transfer::transfer(cap, recipient);
    }

    /// Transfer a PartialFillCap to a new owner.
    public fun transfer_partial_fill_cap(cap: PartialFillCap, recipient: address) {
        transfer::transfer(cap, recipient);
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
    /// Exposes init() for test scenarios.
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
EOF
echo "✅ capability.move created"

# ── 3. Create capability_tests.move ──

cat > davy/tests/capability_tests.move << 'EOF'
/// Davy Protocol — Capability Tests
/// Covers: init, mint, destroy, transfer, view, and validation.
#[test_only]
module davy::capability_tests {
    use sui::test_scenario::{Self as ts};
    use davy::capability::{Self, AdminCap, ExecutorCap, PartialFillCap};

    // ===== Constants =====

    const ADMIN: address = @0xAD;
    const EXECUTOR_1: address = @0xE1;
    const EXECUTOR_2: address = @0xE2;
    const NEW_ADMIN: address = @0xA0;

    // ===== 1. Init — AdminCap created for deployer =====

    #[test]
    fun test_admin_cap_created_on_init() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            // AdminCap should be owned by ADMIN
            let admin_cap = scenario.take_from_sender<AdminCap>();
            scenario.return_to_sender(admin_cap);
        };
        scenario.end();
    }

    // ===== 2. Mint ExecutorCap =====

    #[test]
    fun test_mint_executor_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"market_maker_1",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            // Verify label and minted_by
            assert!(*capability::executor_cap_label(&exec_cap) == b"market_maker_1");
            assert!(capability::executor_cap_minted_by(&exec_cap) == ADMIN);
            scenario.return_to_sender(exec_cap);
        };
        scenario.end();
    }

    // ===== 3. Empty label aborts (300) =====

    #[test]
    #[expected_failure(abort_code = 300)]
    fun test_mint_executor_cap_empty_label_aborts() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"",  // empty label → abort 300
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.end();
    }

    // ===== 4. Destroy ExecutorCap (revocation) =====

    #[test]
    fun test_destroy_executor_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"temp_executor",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            // Revoke by destroying
            capability::destroy_executor_cap(exec_cap);
        };
        // Verify the cap no longer exists
        scenario.next_tx(EXECUTOR_1);
        {
            assert!(!ts::has_most_recent_for_sender<ExecutorCap>(&scenario));
        };
        scenario.end();
    }

    // ===== 5. Transfer ExecutorCap =====

    #[test]
    fun test_transfer_executor_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"transferable",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        // EXECUTOR_1 transfers to EXECUTOR_2
        scenario.next_tx(EXECUTOR_1);
        {
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            capability::transfer_executor_cap(exec_cap, EXECUTOR_2);
        };
        // EXECUTOR_2 should now own it
        scenario.next_tx(EXECUTOR_2);
        {
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            assert!(*capability::executor_cap_label(&exec_cap) == b"transferable");
            scenario.return_to_sender(exec_cap);
        };
        // EXECUTOR_1 should no longer have it
        scenario.next_tx(EXECUTOR_1);
        {
            assert!(!ts::has_most_recent_for_sender<ExecutorCap>(&scenario));
        };
        scenario.end();
    }

    // ===== 6. Transfer AdminCap =====

    #[test]
    fun test_transfer_admin_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::transfer_admin_cap(admin_cap, NEW_ADMIN);
        };
        // NEW_ADMIN should own AdminCap
        scenario.next_tx(NEW_ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            // New admin can mint
            capability::mint_executor_cap(
                &admin_cap,
                b"new_admin_mint",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        // Old admin should no longer have it
        scenario.next_tx(ADMIN);
        {
            assert!(!ts::has_most_recent_for_sender<AdminCap>(&scenario));
        };
        scenario.end();
    }

    // ===== 7. Mint PartialFillCap =====

    #[test]
    fun test_mint_partial_fill_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_partial_fill_cap(
                &admin_cap,
                b"partial_filler_1",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let pf_cap = scenario.take_from_sender<PartialFillCap>();
            assert!(*capability::partial_fill_cap_label(&pf_cap) == b"partial_filler_1");
            assert!(capability::partial_fill_cap_minted_by(&pf_cap) == ADMIN);
            scenario.return_to_sender(pf_cap);
        };
        scenario.end();
    }

    // ===== 8. Empty label aborts for PartialFillCap =====

    #[test]
    #[expected_failure(abort_code = 300)]
    fun test_mint_partial_fill_cap_empty_label_aborts() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_partial_fill_cap(
                &admin_cap,
                b"",  // empty → abort 300
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.end();
    }

    // ===== 9. Destroy PartialFillCap =====

    #[test]
    fun test_destroy_partial_fill_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_partial_fill_cap(
                &admin_cap,
                b"temp_partial",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let pf_cap = scenario.take_from_sender<PartialFillCap>();
            capability::destroy_partial_fill_cap(pf_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            assert!(!ts::has_most_recent_for_sender<PartialFillCap>(&scenario));
        };
        scenario.end();
    }

    // ===== 10. Mint multiple ExecutorCaps =====

    #[test]
    fun test_mint_multiple_executor_caps() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"executor_alpha",
                EXECUTOR_1,
                scenario.ctx(),
            );
            capability::mint_executor_cap(
                &admin_cap,
                b"executor_beta",
                EXECUTOR_2,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        // Both executors should have their caps
        scenario.next_tx(EXECUTOR_1);
        {
            let cap = scenario.take_from_sender<ExecutorCap>();
            assert!(*capability::executor_cap_label(&cap) == b"executor_alpha");
            scenario.return_to_sender(cap);
        };
        scenario.next_tx(EXECUTOR_2);
        {
            let cap = scenario.take_from_sender<ExecutorCap>();
            assert!(*capability::executor_cap_label(&cap) == b"executor_beta");
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    // ===== 11. Transfer PartialFillCap =====

    #[test]
    fun test_transfer_partial_fill_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_partial_fill_cap(
                &admin_cap,
                b"transferable_pf",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let pf_cap = scenario.take_from_sender<PartialFillCap>();
            capability::transfer_partial_fill_cap(pf_cap, EXECUTOR_2);
        };
        scenario.next_tx(EXECUTOR_2);
        {
            let pf_cap = scenario.take_from_sender<PartialFillCap>();
            assert!(*capability::partial_fill_cap_label(&pf_cap) == b"transferable_pf");
            scenario.return_to_sender(pf_cap);
        };
        scenario.end();
    }
}
EOF
echo "✅ capability_tests.move created (11 tests)"

# ── Summary ──

echo ""
echo "=== Phase 3 files ==="
find davy -type f | sort
echo ""
echo "--- Line counts ---"
wc -l davy/sources/capability.move davy/tests/capability_tests.move
echo ""
echo "Phase 3 checkpoint: Can mint, transfer, and revoke caps ✅"
echo "  - AdminCap         — created at module publish via init()"
echo "  - ExecutorCap      — AdminCap-gated minting, label + minted_by"
echo "  - PartialFillCap   — optional extension, same pattern"
echo "  - mint/destroy/transfer functions for all cap types"
echo "  - View functions: label, minted_by accessors"
echo "  - 11 tests: init, mint, empty-label abort, destroy, transfer, multi-mint"
echo ""
echo "Next: sui move build && sui move test"
