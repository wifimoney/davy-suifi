/// Davy Protocol — Execution Intent Module
///
/// Intents are escrowed, conditional execution requests. They allow Takers to
/// express "I want X amount of ReceiveAsset, and I'm willing to pay between
/// min_price and max_price of PayAsset."
///
/// Execution is delegated to authorized entities (ExecutorCap).
module davy::intent {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};

    use davy::offer::{Self, LiquidityOffer};
    use davy::capability::{ExecutorCap};
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
        events::emit_intent_submitted(
            intent_id,
            creator,
            type_name::get<ReceiveAsset>(),
            type_name::get<PayAsset>(),
            receive_amount,
            payment_amount,  // max_pay_amount (conceptually)
            payment_amount,  // escrowed_amount (actual balance)
            min_price,
            max_price,
            expiry,
        );

        transfer::public_share_object(intent);
    }

    /// Execute an intent against a specific offer.
    /// Requires ExecutorCap (authorized bot/DAO).
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
        
        // Price check: Offer's current price (min_price) must be within Intent bounds
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

        // Perform the fill (low-level primitives)
        let (receipt, payment_coin) = if (fill_amount == offer::remaining_amount(offer)) {
            offer::fill_full(offer, payment_coin, clock, ctx)
        } else {
            offer::fill_partial(offer, fill_amount, payment_coin, clock, ctx)
        };

        // Settle manually to ensure assets go to intent creator, not executor
        let (offer_coin, _, _, _, _) = offer::unpack_receipt(receipt, ctx);
        transfer::public_transfer(offer_coin, intent.creator);
        transfer::public_transfer(payment_coin, offer::maker(offer));

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
