/// Davy Protocol — Execution Intent Module
///
/// Intents are escrowed, conditional execution requests. They allow Takers to
/// express "I want X amount of ReceiveAsset, and I'm willing to pay between
/// min_price and max_price of PayAsset."
///
/// Execution is delegated to authorized entities (ExecutorCap).
///
/// ## V2 Functions (Security Upgrade)
///   - execute_against_offer_v2: explicit price parameter, revocation check
///   - execute_against_gated_offer: supports FILL_POLICY_PARTIAL_GATED offers
module davy::intent {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};

    use davy::offer::{Self, LiquidityOffer};
    use davy::capability::{Self, ExecutorCap, RevocationRegistry};
    use davy::errors;
    use davy::events;
    use std::type_name;

    // ===== Constants =====

    const STATUS_PENDING: u8 = 0;
    const STATUS_EXECUTED: u8 = 1;
    const STATUS_CANCELLED: u8 = 2;
    const STATUS_EXPIRED: u8 = 3;

    // ===== Structs =====

    /// Represents an intent to acquire assets under specific price conditions.
    public struct ExecutionIntent<phantom ReceiveAsset, phantom PayAsset> has key, store {
        id: UID,
        creator: address,
        /// Amount of ReceiveAsset (OfferAsset) the taker wants.
        receive_amount: u64,
        /// Escrowed PayAsset (WantAsset).
        escrow: Balance<PayAsset>,
        /// Initial amount escrowed (for refund calculation).
        max_pay_amount: u64,
        /// Minimum price (Pay per 1 Receive).
        min_price: u64,
        /// Maximum price (Pay per 1 Receive).
        max_price: u64,
        /// Expiry timestamp (ms).
        expiry_timestamp_ms: u64,
        /// Current lifecycle status.
        status: u8,
    }

    // ===== Public Functions =====

    /// Create a new price-bounded intent.
    public fun create_price_bounded<ReceiveAsset, PayAsset>(
        receive_amount: u64,
        payment: Coin<PayAsset>,
        min_price: u64,
        max_price: u64,
        expiry: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(receive_amount > 0, errors::zero_receive_amount());
        let payment_amount = coin::value(&payment);
        assert!(payment_amount > 0, errors::zero_escrow_amount());
        assert!(expiry > clock::timestamp_ms(clock), errors::expired_on_create_intent());

        let creator = tx_context::sender(ctx);
        let intent = ExecutionIntent<ReceiveAsset, PayAsset> {
            id: object::new(ctx),
            creator,
            receive_amount,
            escrow: coin::into_balance(payment),
            max_pay_amount: payment_amount,
            min_price,
            max_price,
            expiry_timestamp_ms: expiry,
            status: STATUS_PENDING,
        };

        let intent_id = object::uid_to_inner(&intent.id);
        events::emit_intent_submitted_v2(
            intent_id,
            creator,
            type_name::get<ReceiveAsset>(),
            type_name::get<PayAsset>(),
            receive_amount,
            payment_amount,
            payment_amount,
            min_price,
            max_price,
            expiry,
        );

        transfer::public_share_object(intent);
    }

    /// Execute an intent against a specific offer.
    /// ⚠️ DEPRECATED: Use execute_against_offer_v2 for explicit price control.
    /// This function always fills at offer's min_price (worst rate for maker).
    /// Requires ExecutorCap (authorized bot/DAO).
    ///
    /// NOTE (v2 upgrade): Payment is now auto-settled to maker inside
    /// fill_full/fill_partial. The returned payment coin is zero-value.
    public fun execute_against_offer<ReceiveAsset, PayAsset>(
        intent: &mut ExecutionIntent<ReceiveAsset, PayAsset>,
        offer: &mut LiquidityOffer<ReceiveAsset, PayAsset>,
        _exec_cap: &ExecutorCap,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // 1. Validation: Intent status & expiry
        assert!(intent.status == STATUS_PENDING, errors::intent_not_pending());
        assert!(clock::timestamp_ms(clock) < intent.expiry_timestamp_ms, errors::intent_expired());

        // 2. Validation: Offer availability & price
        assert!(offer::is_fillable(offer, clock), errors::offer_not_fillable());
        let (offer_min_price, _offer_max_price) = offer::price_bounds(offer);
        
        // ⚠️ DEPRECATED: Always fills at offer's min_price (worst rate for maker).
        // Use execute_against_offer_v2 with explicit price instead.
        assert!(offer_min_price >= intent.min_price, errors::price_mismatch());
        assert!(offer_min_price <= intent.max_price, errors::price_mismatch());

        // 3. Validation: Liquidity & Escrow
        let fill_amount = intent.receive_amount;
        assert!(offer::remaining_amount(offer) >= fill_amount, errors::insufficient_liquidity());
        
        let payment_required = offer::calc_payment(fill_amount, offer_min_price);
        assert!(balance::value(&intent.escrow) >= payment_required, errors::insufficient_escrowed());

        // 4. Execution: Split payment and fill offer
        let payment_balance = balance::split(&mut intent.escrow, payment_required);
        let payment_coin = coin::from_balance(payment_balance, ctx);

        // Fill (payment auto-settles to maker; returned coin is zero-value)
        let (receipt, zero_payment) = if (fill_amount == offer::remaining_amount(offer)) {
            offer::fill_full(offer, payment_coin, clock, ctx)
        } else {
            offer::fill_partial(offer, fill_amount, payment_coin, clock, ctx)
        };

        // Settle: OfferAsset → intent creator
        let (offer_coin, _, _, _, _) = offer::unpack_receipt(receipt, ctx);
        transfer::public_transfer(offer_coin, intent.creator);
        // Destroy zero-value payment coin (payment already sent to maker in fill)
        coin::destroy_zero(zero_payment);

        // 5. Cleanup: Transition intent status
        intent.status = STATUS_EXECUTED;

        // 6. Distribution: Refund remaining escrow to creator
        let refund_amount = balance::value(&intent.escrow);
        if (refund_amount > 0) {
            let refund_balance = balance::withdraw_all(&mut intent.escrow);
            transfer::public_transfer(coin::from_balance(refund_balance, ctx), intent.creator);
        };

        let intent_id = object::uid_to_inner(&intent.id);
        events::emit_intent_executed(
            intent_id,
            tx_context::sender(ctx),
            object::id(offer),
            fill_amount,
            payment_required,
            offer_min_price,
            refund_amount,
        );
    }

    // ===== V2: Explicit Price + Revocation Check (Fix #3, #4) =====

    /// Execute an intent against a specific offer with explicit price.
    /// V2: Executor specifies price, validated against both offer AND intent bounds.
    /// Checks RevocationRegistry to reject revoked ExecutorCaps.
    public fun execute_against_offer_v2<ReceiveAsset, PayAsset>(
        intent: &mut ExecutionIntent<ReceiveAsset, PayAsset>,
        offer: &mut LiquidityOffer<ReceiveAsset, PayAsset>,
        exec_cap: &ExecutorCap,
        registry: &RevocationRegistry,
        execution_price: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Revocation check (Fix #4)
        assert!(
            !capability::is_executor_cap_revoked(registry, object::id(exec_cap)),
            errors::revoked_cap(),
        );

        // 1. Validation: Intent status & expiry
        assert!(intent.status == STATUS_PENDING, errors::intent_not_pending());
        assert!(clock::timestamp_ms(clock) < intent.expiry_timestamp_ms, errors::intent_expired());

        // 2. Validation: Offer availability
        assert!(offer::is_fillable(offer, clock), errors::offer_not_fillable());

        // 3. Validation: Price within BOTH offer and intent bounds (Fix #3)
        let (offer_min_price, offer_max_price) = offer::price_bounds(offer);
        assert!(execution_price >= offer_min_price, errors::price_mismatch());
        assert!(execution_price <= offer_max_price, errors::price_mismatch());
        assert!(execution_price >= intent.min_price, errors::price_mismatch());
        assert!(execution_price <= intent.max_price, errors::price_mismatch());

        // 4. Validation: Liquidity & Escrow
        let fill_amount = intent.receive_amount;
        assert!(offer::remaining_amount(offer) >= fill_amount, errors::insufficient_liquidity());

        let payment_required = offer::calc_payment(fill_amount, execution_price);
        assert!(balance::value(&intent.escrow) >= payment_required, errors::insufficient_escrowed());

        // 5. Execution: Split payment and fill offer
        let payment_balance = balance::split(&mut intent.escrow, payment_required);
        let payment_coin = coin::from_balance(payment_balance, ctx);

        // Fill (payment auto-settles to maker; returned coin is zero-value)
        let (receipt, zero_payment) = if (fill_amount == offer::remaining_amount(offer)) {
            offer::fill_full(offer, payment_coin, clock, ctx)
        } else {
            offer::fill_partial(offer, fill_amount, payment_coin, clock, ctx)
        };

        // Settle: OfferAsset → intent creator
        let (offer_coin, _, _, _, _) = offer::unpack_receipt(receipt, ctx);
        transfer::public_transfer(offer_coin, intent.creator);
        coin::destroy_zero(zero_payment);

        // 6. Cleanup
        intent.status = STATUS_EXECUTED;

        // 7. Refund remaining escrow
        let refund_amount = balance::value(&intent.escrow);
        if (refund_amount > 0) {
            let refund_balance = balance::withdraw_all(&mut intent.escrow);
            transfer::public_transfer(coin::from_balance(refund_balance, ctx), intent.creator);
        };

        let intent_id = object::uid_to_inner(&intent.id);
        events::emit_intent_executed(
            intent_id,
            tx_context::sender(ctx),
            object::id(offer),
            fill_amount,
            payment_required,
            execution_price,
            refund_amount,
        );
    }

    // ===== V2: Gated Offer Execution (Fix #5) =====

    /// Execute an intent against a gated-partial offer.
    /// Requires both ExecutorCap (for intent execution) and PartialFillCap
    /// (for gated partial fills on the offer).
    /// Checks RevocationRegistry for both caps.
    public fun execute_against_gated_offer<ReceiveAsset, PayAsset>(
        intent: &mut ExecutionIntent<ReceiveAsset, PayAsset>,
        offer: &mut LiquidityOffer<ReceiveAsset, PayAsset>,
        exec_cap: &ExecutorCap,
        partial_cap: &davy::capability::PartialFillCap,
        registry: &RevocationRegistry,
        execution_price: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Revocation checks (Fix #4)
        assert!(
            !capability::is_executor_cap_revoked(registry, object::id(exec_cap)),
            errors::revoked_cap(),
        );
        assert!(
            !capability::is_partial_fill_cap_revoked(registry, object::id(partial_cap)),
            errors::revoked_cap(),
        );

        // 1. Validation: Intent status & expiry
        assert!(intent.status == STATUS_PENDING, errors::intent_not_pending());
        assert!(clock::timestamp_ms(clock) < intent.expiry_timestamp_ms, errors::intent_expired());

        // 2. Validation: Offer availability
        assert!(offer::is_fillable(offer, clock), errors::offer_not_fillable());

        // 3. Validation: Price within BOTH offer and intent bounds
        let (offer_min_price, offer_max_price) = offer::price_bounds(offer);
        assert!(execution_price >= offer_min_price, errors::price_mismatch());
        assert!(execution_price <= offer_max_price, errors::price_mismatch());
        assert!(execution_price >= intent.min_price, errors::price_mismatch());
        assert!(execution_price <= intent.max_price, errors::price_mismatch());

        // 4. Validation: Liquidity & Escrow
        let fill_amount = intent.receive_amount;
        assert!(offer::remaining_amount(offer) >= fill_amount, errors::insufficient_liquidity());

        let payment_required = offer::calc_payment(fill_amount, execution_price);
        assert!(balance::value(&intent.escrow) >= payment_required, errors::insufficient_escrowed());

        // 5. Execution: Split payment and fill offer
        let payment_balance = balance::split(&mut intent.escrow, payment_required);
        let payment_coin = coin::from_balance(payment_balance, ctx);

        // Use gated fill for partial, regular fill_full for exact full
        let (receipt, zero_payment) = if (fill_amount == offer::remaining_amount(offer)) {
            offer::fill_full(offer, payment_coin, clock, ctx)
        } else {
            offer::fill_partial_gated(offer, fill_amount, payment_coin, partial_cap, clock, ctx)
        };

        // Settle: OfferAsset → intent creator
        let (offer_coin, _, _, _, _) = offer::unpack_receipt(receipt, ctx);
        transfer::public_transfer(offer_coin, intent.creator);
        coin::destroy_zero(zero_payment);

        // 6. Cleanup
        intent.status = STATUS_EXECUTED;

        // 7. Refund remaining escrow
        let refund_amount = balance::value(&intent.escrow);
        if (refund_amount > 0) {
            let refund_balance = balance::withdraw_all(&mut intent.escrow);
            transfer::public_transfer(coin::from_balance(refund_balance, ctx), intent.creator);
        };

        let intent_id = object::uid_to_inner(&intent.id);
        events::emit_intent_executed(
            intent_id,
            tx_context::sender(ctx),
            object::id(offer),
            fill_amount,
            payment_required,
            execution_price,
            refund_amount,
        );
    }

    /// Cancel intent and return escrowed funds.
    public fun cancel<ReceiveAsset, PayAsset>(
        intent: &mut ExecutionIntent<ReceiveAsset, PayAsset>,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == intent.creator, errors::not_creator());
        assert!(intent.status == STATUS_PENDING, errors::intent_not_pending());

        intent.status = STATUS_CANCELLED;
        let refund_amount = balance::value(&intent.escrow);
        let refund_balance = balance::withdraw_all(&mut intent.escrow);
        
        transfer::public_transfer(coin::from_balance(refund_balance, ctx), intent.creator);

        let intent_id = object::uid_to_inner(&intent.id);
        events::emit_intent_cancelled(intent_id, intent.creator, refund_amount);
    }

    /// Expire intent after timestamp. Permissionless.
    public fun expire_intent<ReceiveAsset, PayAsset>(
        intent: &mut ExecutionIntent<ReceiveAsset, PayAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(clock::timestamp_ms(clock) >= intent.expiry_timestamp_ms, errors::not_yet_expired_intent());
        assert!(intent.status == STATUS_PENDING, errors::intent_not_pending());

        intent.status = STATUS_EXPIRED;
        let refund_amount = balance::value(&intent.escrow);
        let refund_balance = balance::withdraw_all(&mut intent.escrow);
        
        transfer::public_transfer(coin::from_balance(refund_balance, ctx), intent.creator);

        let intent_id = object::uid_to_inner(&intent.id);
        events::emit_intent_expired(intent_id, intent.creator, refund_amount);
    }

    // ===== View Functions =====

    public fun creator<R, P>(intent: &ExecutionIntent<R, P>): address { intent.creator }
    public fun receive_amount<R, P>(intent: &ExecutionIntent<R, P>): u64 { intent.receive_amount }
    public fun escrowed_amount<R, P>(intent: &ExecutionIntent<R, P>): u64 { balance::value(&intent.escrow) }
    public fun max_pay_amount<R, P>(intent: &ExecutionIntent<R, P>): u64 { intent.max_pay_amount }
    public fun intent_status<R, P>(intent: &ExecutionIntent<R, P>): u8 { intent.status }
    public fun intent_price_bounds<R, P>(intent: &ExecutionIntent<R, P>): (u64, u64) { 
        (intent.min_price, intent.max_price) 
    }

    public fun status_pending(): u8 { STATUS_PENDING }
    public fun status_executed(): u8 { STATUS_EXECUTED }
    public fun status_cancelled(): u8 { STATUS_CANCELLED }
    public fun status_expired(): u8 { STATUS_EXPIRED }
}
