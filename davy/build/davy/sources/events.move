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
