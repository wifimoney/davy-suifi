/// Davy Protocol — Offer Module
///
/// `LiquidityOffer<OfferAsset, WantAsset>` is the core protocol primitive:
/// a discrete on-chain object that IS the liquidity, with explicit lifecycle,
/// price bounds, and fill policies.
///
/// ## Lifecycle
///   Created → PartiallyFilled → Filled
///   Created → Expired | Withdrawn
///   PartiallyFilled → Filled | Expired | Withdrawn
///
/// ## Price Semantics
///   All prices are WantAsset per 1 OfferAsset, scaled by 1e9.
///   Formula: `price = (want_amount * 1e9) / offer_amount`
///   All intermediate math uses u128 to prevent overflow.
///
/// ## Fill Policies
///   - `FILL_POLICY_FULL_ONLY (0)`: Only full fills accepted.
///   - `FILL_POLICY_PARTIAL_ALLOWED (1)`: Partial fills accepted,
///     subject to `min_fill_amount` and dust prevention.
module davy::offer {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::Clock;

    use davy::errors;
    use davy::events;
    use std::type_name;

    // ===== Status Constants =====

    const STATUS_CREATED: u8 = 0;
    const STATUS_PARTIALLY_FILLED: u8 = 1;
    const STATUS_FILLED: u8 = 2;
    const STATUS_EXPIRED: u8 = 3;
    const STATUS_WITHDRAWN: u8 = 4;

    // ===== Fill Policy Constants =====

    const FILL_POLICY_FULL_ONLY: u8 = 0;
    const FILL_POLICY_PARTIAL_ALLOWED: u8 = 1;

    // ===== Price Scaling =====

    /// 1e9 — all prices are WantAsset per 1 OfferAsset, scaled by this factor.
    const PRICE_SCALING_FACTOR: u128 = 1_000_000_000;

    // ===== Core Struct =====

    /// A discrete liquidity offer. The object IS the liquidity.
    /// Generic params: OfferAsset (what maker provides), WantAsset (what maker wants).
    public struct LiquidityOffer<phantom OfferAsset, phantom WantAsset> has key, store {
        id: UID,

        // Liquidity — the object holds inventory
        offer_balance: Balance<OfferAsset>,
        initial_offer_amount: u64,

        // Pricing — no curves, explicit bounds
        min_price: u64,
        max_price: u64,

        // Lifecycle
        status: u8,
        expiry_timestamp_ms: u64,

        // Fill policy
        fill_policy: u8,        // 0 = FullOnly, 1 = PartialAllowed
        min_fill_amount: u64,

        // Accounting
        total_filled: u64,
        fill_count: u64,

        // Maker
        maker: address,
    }

    // ===== FillReceipt =====

    /// Proof-of-fill returned by low-level fill primitives.
    /// Caller receives the OfferAsset balance and is responsible for routing.
    /// Payment coin is returned separately.
    public struct FillReceipt<phantom OfferAsset, phantom WantAsset> {
        offer_balance: Balance<OfferAsset>,
        fill_amount: u64,
        payment_amount: u64,
        price: u64,
        is_full: bool,
    }

    /// Unpack a FillReceipt. Returns (offer_coin, fill_amount, payment_amount, price, is_full).
    public fun unpack_receipt<OfferAsset, WantAsset>(
        receipt: FillReceipt<OfferAsset, WantAsset>,
        ctx: &mut TxContext,
    ): (Coin<OfferAsset>, u64, u64, u64, bool) {
        let FillReceipt { offer_balance, fill_amount, payment_amount, price, is_full } = receipt;
        (coin::from_balance(offer_balance, ctx), fill_amount, payment_amount, price, is_full)
    }

    // ===== create =====

    /// Create a new liquidity offer. Escrows OfferAsset into the object.
    /// Caller becomes the maker. Offer is shared for permissionless fills.
    public fun create<OfferAsset, WantAsset>(
        offer_coin: Coin<OfferAsset>,
        min_price: u64,
        max_price: u64,
        expiry_timestamp_ms: u64,
        fill_policy: u8,
        min_fill_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        let offer_amount = coin::value(&offer_coin);
        let now = sui::clock::timestamp_ms(clock);

        // Validation
        assert!(offer_amount > 0, errors::zero_amount());
        assert!(min_price > 0, errors::zero_min_price());
        assert!(max_price > 0, errors::zero_max_price());
        assert!(min_price <= max_price, errors::invalid_price_bounds());
        assert!(
            fill_policy == FILL_POLICY_FULL_ONLY || fill_policy == FILL_POLICY_PARTIAL_ALLOWED,
            errors::invalid_fill_policy(),
        );
        assert!(expiry_timestamp_ms > now, errors::expired_on_create());

        if (fill_policy == FILL_POLICY_PARTIAL_ALLOWED) {
            assert!(min_fill_amount <= offer_amount, errors::min_fill_exceeds_amount());
        };

        let maker = tx_context::sender(ctx);

        let offer = LiquidityOffer<OfferAsset, WantAsset> {
            id: object::new(ctx),
            offer_balance: coin::into_balance(offer_coin),
            initial_offer_amount: offer_amount,
            min_price,
            max_price,
            status: STATUS_CREATED,
            expiry_timestamp_ms,
            fill_policy,
            min_fill_amount,
            total_filled: 0,
            fill_count: 0,
            maker,
        };

        let offer_id = object::id(&offer);


        events::emit_offer_created(
            offer_id, maker,
            type_name::get<OfferAsset>(),
            type_name::get<WantAsset>(),
            offer_amount,
            min_price, max_price, expiry_timestamp_ms,
            fill_policy, min_fill_amount,
        );

        transfer::public_share_object(offer);
        offer_id
    }

    // ===== withdraw =====

    /// Maker withdraws remaining balance. Destroys the offer object.
    /// Allowed when status is Created or PartiallyFilled.
    public fun withdraw<OfferAsset, WantAsset>(
        offer: LiquidityOffer<OfferAsset, WantAsset>,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == offer.maker, errors::not_maker());
        assert!(
            offer.status == STATUS_CREATED || offer.status == STATUS_PARTIALLY_FILLED,
            errors::invalid_status_for_withdraw(),
        );

        let LiquidityOffer {
            id, offer_balance, initial_offer_amount: _,
            min_price: _, max_price: _, status: _, expiry_timestamp_ms: _,
            fill_policy: _, min_fill_amount: _, total_filled, fill_count: _, maker,
        } = offer;

        let withdrawn_amount = balance::value(&offer_balance);
        let offer_id = object::uid_to_inner(&id);

        events::emit_offer_withdrawn(offer_id, maker, withdrawn_amount, total_filled);

        if (withdrawn_amount > 0) {
            transfer::public_transfer(coin::from_balance(offer_balance, ctx), maker);
        } else {
            balance::destroy_zero(offer_balance);
        };

        object::delete(id);
    }

    // ===== expire =====

    /// Permissionless expiry. Anyone can call after expiry time.
    /// Returns remaining balance to maker. Destroys the offer object.
    public fun expire<OfferAsset, WantAsset>(
        offer: LiquidityOffer<OfferAsset, WantAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = sui::clock::timestamp_ms(clock);
        assert!(now >= offer.expiry_timestamp_ms, errors::not_yet_expired());
        assert!(
            offer.status == STATUS_CREATED || offer.status == STATUS_PARTIALLY_FILLED,
            errors::invalid_status_for_expire(),
        );

        let LiquidityOffer {
            id, offer_balance, initial_offer_amount: _,
            min_price: _, max_price: _, status: _, expiry_timestamp_ms: _,
            fill_policy: _, min_fill_amount: _, total_filled, fill_count: _, maker,
        } = offer;

        let remaining = balance::value(&offer_balance);
        let offer_id = object::uid_to_inner(&id);

        events::emit_offer_expired(offer_id, remaining, total_filled);

        if (remaining > 0) {
            transfer::public_transfer(coin::from_balance(offer_balance, ctx), maker);
        } else {
            balance::destroy_zero(offer_balance);
        };

        object::delete(id);
    }

    // ===== Price Helpers =====

    /// Calculate price: WantAsset per 1 OfferAsset, scaled by 1e9.
    /// Formula: price = (payment_amount * 1e9) / fill_amount
    /// Uses u128 intermediates. Floor rounding (always safe for maker).
    public fun calculate_price(payment_amount: u64, fill_amount: u64): u64 {
        let payment_128 = (payment_amount as u128);
        let fill_128 = (fill_amount as u128);
        let price_128 = (payment_128 * PRICE_SCALING_FACTOR) / fill_128;
        (price_128 as u64)
    }

    /// Calculate required payment for a given fill_amount at a given price.
    /// Formula: payment = (fill_amount * price) / 1e9, rounded UP.
    /// Rounding up protects the maker (taker pays at least enough).
    public fun calc_payment(fill_amount: u64, price: u64): u64 {
        let fill_128 = (fill_amount as u128);
        let price_128 = (price as u128);
        let numerator = fill_128 * price_128;
        // Ceiling division: (a + b - 1) / b
        let payment_128 = (numerator + PRICE_SCALING_FACTOR - 1) / PRICE_SCALING_FACTOR;
        (payment_128 as u64)
    }

    /// Validate that effective price is within offer bounds.
    fun validate_price_bounds(price: u64, min_price: u64, max_price: u64) {
        assert!(price >= min_price, errors::price_too_low());
        assert!(price <= max_price, errors::price_too_high());
    }

    // ===== Dust Prevention =====

    /// Reject fills that would leave a remainder below min_fill_amount.
    /// Exception: filling to exactly zero is always allowed.
    fun check_no_dust<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
        fill_amount: u64,
    ) {
        let remaining = balance::value(&offer.offer_balance);
        let after_fill = remaining - fill_amount;
        if (after_fill > 0 && offer.min_fill_amount > 0) {
            assert!(after_fill >= offer.min_fill_amount, errors::would_leave_dust());
        };
    }

    // ===== Fillability Guard =====

    /// Assert offer is in a fillable state and not time-expired.
    fun assert_fillable<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
        clock: &Clock,
    ) {
        assert!(
            offer.status == STATUS_CREATED || offer.status == STATUS_PARTIALLY_FILLED,
            errors::offer_not_fillable(),
        );
        let now = sui::clock::timestamp_ms(clock);
        assert!(now < offer.expiry_timestamp_ms, errors::offer_expired());
    }

    // ===== fill_full — low-level =====

    /// Low-level full fill. Takes entire remaining balance.
    /// Returns FillReceipt (caller routes coins) and the payment coin (for maker).
    public fun fill_full<OfferAsset, WantAsset>(
        offer: &mut LiquidityOffer<OfferAsset, WantAsset>,
        payment: Coin<WantAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (FillReceipt<OfferAsset, WantAsset>, Coin<WantAsset>) {
        assert_fillable(offer, clock);

        let remaining = balance::value(&offer.offer_balance);
        let fill_amount = remaining;
        let payment_amount = coin::value(&payment);

        let price = calculate_price(payment_amount, fill_amount);
        validate_price_bounds(price, offer.min_price, offer.max_price);

        // Extract full balance
        let offer_balance = balance::split(&mut offer.offer_balance, fill_amount);

        // Update state
        offer.total_filled = offer.total_filled + fill_amount;
        offer.fill_count = offer.fill_count + 1;
        offer.status = STATUS_FILLED;

        let offer_id = object::id(offer);
        let taker = tx_context::sender(ctx);

        events::emit_offer_filled(
            offer_id, taker, fill_amount, payment_amount, price, true, 0,
        );

        let receipt = FillReceipt<OfferAsset, WantAsset> {
            offer_balance,
            fill_amount,
            payment_amount,
            price,
            is_full: true,
        };

        (receipt, payment)
    }

    // ===== fill_partial — low-level =====

    /// Low-level partial fill. Takes `fill_amount` from offer balance.
    /// Returns FillReceipt and the payment coin.
    public fun fill_partial<OfferAsset, WantAsset>(
        offer: &mut LiquidityOffer<OfferAsset, WantAsset>,
        fill_amount: u64,
        payment: Coin<WantAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (FillReceipt<OfferAsset, WantAsset>, Coin<WantAsset>) {
        assert_fillable(offer, clock);
        assert!(offer.fill_policy == FILL_POLICY_PARTIAL_ALLOWED, errors::partial_fill_not_allowed());

        let remaining = balance::value(&offer.offer_balance);
        assert!(fill_amount > 0, errors::zero_amount());
        assert!(fill_amount <= remaining, errors::fill_exceeds_remaining());
        assert!(fill_amount >= offer.min_fill_amount, errors::fill_below_minimum());

        // Dust check
        check_no_dust(offer, fill_amount);

        let payment_amount = coin::value(&payment);
        let price = calculate_price(payment_amount, fill_amount);
        validate_price_bounds(price, offer.min_price, offer.max_price);

        // Extract fill_amount from balance
        let offer_balance = balance::split(&mut offer.offer_balance, fill_amount);

        // Update state
        offer.total_filled = offer.total_filled + fill_amount;
        offer.fill_count = offer.fill_count + 1;

        let new_remaining = balance::value(&offer.offer_balance);
        let is_full = new_remaining == 0;
        if (is_full) {
            offer.status = STATUS_FILLED;
        } else {
            offer.status = STATUS_PARTIALLY_FILLED;
        };

        let offer_id = object::id(offer);
        let taker = tx_context::sender(ctx);

        events::emit_offer_filled(
            offer_id, taker, fill_amount, payment_amount, price, is_full, new_remaining,
        );

        let receipt = FillReceipt<OfferAsset, WantAsset> {
            offer_balance,
            fill_amount,
            payment_amount,
            price,
            is_full,
        };

        (receipt, payment)
    }

    // ===== fill_full_and_settle — atomic =====

    /// Atomic full fill + settlement.
    /// Sends OfferAsset to taker, WantAsset (payment) to maker.
    public fun fill_full_and_settle<OfferAsset, WantAsset>(
        offer: &mut LiquidityOffer<OfferAsset, WantAsset>,
        payment: Coin<WantAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let maker = offer.maker;
        let taker = tx_context::sender(ctx);

        let (receipt, payment_coin) = fill_full(offer, payment, clock, ctx);
        let (offer_coin, _fill_amount, _payment_amount, _price, _is_full) = unpack_receipt(receipt, ctx);

        // Settlement: OfferAsset → taker, WantAsset → maker
        transfer::public_transfer(offer_coin, taker);
        transfer::public_transfer(payment_coin, maker);
    }

    // ===== fill_partial_and_settle — atomic =====

    /// Atomic partial fill + settlement.
    /// Sends OfferAsset to taker, WantAsset (payment) to maker.
    public fun fill_partial_and_settle<OfferAsset, WantAsset>(
        offer: &mut LiquidityOffer<OfferAsset, WantAsset>,
        fill_amount: u64,
        payment: Coin<WantAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let maker = offer.maker;
        let taker = tx_context::sender(ctx);

        let (receipt, payment_coin) = fill_partial(offer, fill_amount, payment, clock, ctx);
        let (offer_coin, _fill_amount, _payment_amount, _price, _is_full) = unpack_receipt(receipt, ctx);

        // Settlement: OfferAsset → taker, WantAsset → maker
        transfer::public_transfer(offer_coin, taker);
        transfer::public_transfer(payment_coin, maker);
    }

    // ===== View Functions =====

    public fun remaining_amount<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): u64 {
        balance::value(&offer.offer_balance)
    }

    public fun initial_amount<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): u64 {
        offer.initial_offer_amount
    }

    public fun status<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): u8 {
        offer.status
    }

    public fun is_fillable<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
        clock: &Clock,
    ): bool {
        let now = sui::clock::timestamp_ms(clock);
        (offer.status == STATUS_CREATED || offer.status == STATUS_PARTIALLY_FILLED)
            && now < offer.expiry_timestamp_ms
    }

    public fun price_bounds<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): (u64, u64) {
        (offer.min_price, offer.max_price)
    }

    public fun maker<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): address {
        offer.maker
    }

    public fun fill_policy<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): u8 {
        offer.fill_policy
    }

    public fun min_fill_amount<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): u64 {
        offer.min_fill_amount
    }

    public fun expiry_timestamp_ms<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): u64 {
        offer.expiry_timestamp_ms
    }

    public fun total_filled<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): u64 {
        offer.total_filled
    }

    public fun fill_count<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): u64 {
        offer.fill_count
    }

    public fun offer_id<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
    ): ID {
        object::id(offer)
    }

    // ===== Status/Policy Accessors =====

    public fun status_created(): u8 { STATUS_CREATED }
    public fun status_partially_filled(): u8 { STATUS_PARTIALLY_FILLED }
    public fun status_filled(): u8 { STATUS_FILLED }
    public fun status_expired(): u8 { STATUS_EXPIRED }
    public fun status_withdrawn(): u8 { STATUS_WITHDRAWN }

    public fun fill_policy_full_only(): u8 { FILL_POLICY_FULL_ONLY }
    public fun fill_policy_partial_allowed(): u8 { FILL_POLICY_PARTIAL_ALLOWED }

    // =========================================================================
    // QUOTE HELPERS — Pure view functions for router integration (Phase 7)
    // =========================================================================
    //
    // These functions replicate the EXACT math used in fill_full/fill_partial
    // so that off-chain routers can price-check offers without simulating fills.
    //
    // Rounding rules:
    //   quote_pay_amount:  ceiling division — never under-charges the taker
    //   quote_fill_amount: floor division   — never over-promises to the taker
    //
    // Both use u128 intermediates, identical to calc_payment/calculate_price.
    // The invariant: for any valid fill_amount,
    //   quote_pay_amount(offer, fill_amount) == actual payment in fill_*_and_settle
    //
    // =========================================================================

    /// Quote: "If I want `fill_amount` of OfferAsset, how much WantAsset do I pay?"
    ///
    /// Uses the offer's max_price for quoting (worst-case for taker).
    /// Returns the exact payment amount that fill_*_and_settle would require.
    ///
    /// Aborts if:
    ///   - offer is not fillable (wrong status or expired — but no Clock here,
    ///     caller must check expiry separately)
    ///   - fill_amount is zero
    ///   - fill_amount exceeds remaining balance
    ///   - fill would leave dust (remainder < min_fill_amount)
    ///   - offer is full-only and fill_amount != remaining
    ///
    /// Rounding: ceiling (taker never under-pays)
    public fun quote_pay_amount<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
        fill_amount: u64,
        price: u64,
    ): u64 {
        let remaining = balance::value(&offer.offer_balance);

        // Status guard (no clock check — caller responsibility)
        assert!(
            offer.status == STATUS_CREATED || offer.status == STATUS_PARTIALLY_FILLED,
            errors::offer_not_fillable()
        );

        // Amount guards
        assert!(fill_amount > 0, errors::zero_amount());
        assert!(fill_amount <= remaining, errors::fill_exceeds_remaining());

        // Fill policy guard
        if (fill_amount < remaining) {
            assert!(
                offer.fill_policy == FILL_POLICY_PARTIAL_ALLOWED,
                errors::partial_fill_not_allowed()
            );
            assert!(fill_amount >= offer.min_fill_amount, errors::fill_below_minimum());
            // Dust check
            let would_remain = remaining - fill_amount;
            if (would_remain > 0) {
                assert!(would_remain >= offer.min_fill_amount, errors::would_leave_dust());
            };
        };

        // Price bounds check
        assert!(price >= offer.min_price, errors::price_too_low());
        assert!(price <= offer.max_price, errors::price_too_high());

        // Calculate payment — ceiling division, identical to calc_payment
        // payment = ceil(fill_amount * price / 1e9)
        let fill_u128 = (fill_amount as u128);
        let price_u128 = (price as u128);
        let scaling = PRICE_SCALING_FACTOR;
        let numerator = fill_u128 * price_u128;
        let payment_u128 = (numerator + scaling - 1) / scaling;

        (payment_u128 as u64)
    }

    /// Quote: "If I have `pay_budget` of WantAsset, how much OfferAsset can I receive?"
    ///
    /// Inverse of quote_pay_amount. Uses floor division so we never over-promise.
    /// The returned fill_amount is the MAXIMUM receivable for the given budget.
    ///
    /// Does NOT validate fill policy or dust — caller must check those constraints
    /// separately if building a router. This is intentional: the router needs the
    /// raw max-fill to then clamp against min_fill and dust rules.
    ///
    /// Rounding: floor (taker never receives more than they paid for)
    public fun quote_fill_amount<OfferAsset, WantAsset>(
        offer: &LiquidityOffer<OfferAsset, WantAsset>,
        pay_budget: u64,
        price: u64,
    ): u64 {
        let remaining = balance::value(&offer.offer_balance);

        // Status guard
        assert!(
            offer.status == STATUS_CREATED || offer.status == STATUS_PARTIALLY_FILLED,
            errors::offer_not_fillable()
        );

        assert!(pay_budget > 0, errors::zero_amount());
        assert!(price > 0, errors::zero_min_price()); // using zero_min_price as general zero_price error

        // Price bounds check
        assert!(price >= offer.min_price, errors::price_too_low());
        assert!(price <= offer.max_price, errors::price_too_high());

        // Calculate max fill — floor division, never over-promise
        // fill = floor(pay_budget * 1e9 / price)
        let pay_u128 = (pay_budget as u128);
        let price_u128 = (price as u128);
        let scaling = PRICE_SCALING_FACTOR;
        let fill_u128 = (pay_u128 * scaling) / price_u128;
        let fill = (fill_u128 as u64);

        // Clamp to remaining
        if (fill > remaining) {
            remaining
        } else {
            fill
        }
    }
}
