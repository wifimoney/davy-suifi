#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Davy Protocol — Phase 2: Fill Logic
# ============================================================
# Tasks: 2.1–2.8
# Gate: Direct fills work end-to-end
# Replaces: offer.move (Phase 1 + Phase 2 combined)
# Adds: fill_tests.move
# ============================================================

echo "🏴☠️ Davy Protocol — Phase 2: Fill Logic"
echo "========================================="

# ============================================================
# offer.move — Full replacement (Phase 1 + Phase 2)
# ============================================================
cat > davy/sources/offer.move << 'EOF'
/// Davy Protocol — Offer Module
/// LiquidityOffer is the core primitive: a discrete on-chain object
/// that IS the liquidity, with explicit lifecycle and price bounds.
///
/// Phase 1: struct, create, withdraw, expire, views
/// Phase 2: fill_full, fill_partial, atomic settle helpers, price math, dust prevention
module davy::offer {
    use sui::object::{Self, UID, ID};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::Clock;

    use davy::errors;
    use davy::events;

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

    // ===== Core Struct (1.4) =====

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

    // ===== FillReceipt (2.1) =====

    /// Proof-of-fill returned by low-level fill primitives.
    /// Caller receives the OfferAsset coin and is responsible for routing.
    /// The payment coin is returned separately for caller to route to maker.
    public struct FillReceipt<phantom OfferAsset, phantom WantAsset> {
        offer_coin: Coin<OfferAsset>,
        fill_amount: u64,
        payment_amount: u64,
        price: u64,
        is_full: bool,
    }

    /// Unpack a FillReceipt. Returns (offer_coin, fill_amount, payment_amount, price, is_full).
    public fun unpack_receipt<OfferAsset, WantAsset>(
        receipt: FillReceipt<OfferAsset, WantAsset>,
    ): (Coin<OfferAsset>, u64, u64, u64, bool) {
        let FillReceipt { offer_coin, fill_amount, payment_amount, price, is_full } = receipt;
        (offer_coin, fill_amount, payment_amount, price, is_full)
    }

    // ===== create (1.5) =====

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

        let offer_id = object::uid_to_inner(&offer.id);

        events::emit_offer_created(
            offer_id, maker, offer_amount,
            min_price, max_price, expiry_timestamp_ms,
            fill_policy, min_fill_amount,
        );

        transfer::public_share_object(offer);
        offer_id
    }

    // ===== withdraw (1.6) =====

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

    // ===== expire (1.7) =====

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

    // ===== Price Helpers (2.6) =====

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

    // ===== Dust Prevention (2.7) =====

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

    // ===== fill_full — low-level (2.2) =====

    /// Low-level full fill. Takes entire remaining balance.
    /// Returns FillReceipt (caller routes coins) and the payment coin (for maker).
    ///
    /// Validates: status, expiry, price bounds.
    /// Transitions to Filled.
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
        let offer_coin = coin::from_balance(
            balance::split(&mut offer.offer_balance, fill_amount),
            ctx,
        );

        // Update state
        offer.total_filled = offer.total_filled + fill_amount;
        offer.fill_count = offer.fill_count + 1;
        offer.status = STATUS_FILLED;

        let offer_id = object::uid_to_inner(&offer.id);
        let taker = tx_context::sender(ctx);

        events::emit_offer_filled(
            offer_id, taker, fill_amount, payment_amount, price, true, 0,
        );

        let receipt = FillReceipt<OfferAsset, WantAsset> {
            offer_coin,
            fill_amount,
            payment_amount,
            price,
            is_full: true,
        };

        (receipt, payment)
    }

    // ===== fill_partial — low-level (2.3) =====

    /// Low-level partial fill. Takes `fill_amount` from offer balance.
    /// Returns FillReceipt and the payment coin.
    ///
    /// Validates: status, expiry, partial policy, min_fill, dust, price bounds.
    /// Transitions to PartiallyFilled or Filled.
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
        let offer_coin = coin::from_balance(
            balance::split(&mut offer.offer_balance, fill_amount),
            ctx,
        );

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

        let offer_id = object::uid_to_inner(&offer.id);
        let taker = tx_context::sender(ctx);

        events::emit_offer_filled(
            offer_id, taker, fill_amount, payment_amount, price, is_full, new_remaining,
        );

        let receipt = FillReceipt<OfferAsset, WantAsset> {
            offer_coin,
            fill_amount,
            payment_amount,
            price,
            is_full,
        };

        (receipt, payment)
    }

    // ===== fill_full_and_settle — atomic (2.4) =====

    /// Atomic full fill + settlement.
    /// Sends OfferAsset to taker, WantAsset (payment) to maker.
    /// This is the recommended API for direct full fills.
    public fun fill_full_and_settle<OfferAsset, WantAsset>(
        offer: &mut LiquidityOffer<OfferAsset, WantAsset>,
        payment: Coin<WantAsset>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let maker = offer.maker;
        let taker = tx_context::sender(ctx);

        let (receipt, payment_coin) = fill_full(offer, payment, clock, ctx);
        let (offer_coin, _fill_amount, _payment_amount, _price, _is_full) = unpack_receipt(receipt);

        // Settlement: OfferAsset → taker, WantAsset → maker
        transfer::public_transfer(offer_coin, taker);
        transfer::public_transfer(payment_coin, maker);
    }

    // ===== fill_partial_and_settle — atomic (2.5) =====

    /// Atomic partial fill + settlement.
    /// Sends OfferAsset to taker, WantAsset (payment) to maker.
    /// This is the recommended API for direct partial fills.
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
        let (offer_coin, _fill_amount, _payment_amount, _price, _is_full) = unpack_receipt(receipt);

        // Settlement: OfferAsset → taker, WantAsset → maker
        transfer::public_transfer(offer_coin, taker);
        transfer::public_transfer(payment_coin, maker);
    }

    // ===== View Functions (1.8) =====

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
        object::uid_to_inner(&offer.id)
    }

    // ===== Status/Policy Accessors =====

    public fun status_created(): u8 { STATUS_CREATED }
    public fun status_partially_filled(): u8 { STATUS_PARTIALLY_FILLED }
    public fun status_filled(): u8 { STATUS_FILLED }
    public fun status_expired(): u8 { STATUS_EXPIRED }
    public fun status_withdrawn(): u8 { STATUS_WITHDRAWN }

    public fun fill_policy_full_only(): u8 { FILL_POLICY_FULL_ONLY }
    public fun fill_policy_partial_allowed(): u8 { FILL_POLICY_PARTIAL_ALLOWED }
}
EOF

echo "✅ offer.move replaced (Phase 1 + Phase 2 combined)"

# ============================================================
# fill_tests.move
# ============================================================
cat > davy/tests/fill_tests.move << 'EOF'
#[test_only]
module davy::fill_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::tx_context::TxContext;

    use davy::offer::{Self, LiquidityOffer};

    // ===== Test coin types =====
    public struct SUI has drop {}
    public struct USDC has drop {}

    // ===== Helpers =====

    fun mint_coin<T: drop>(witness: T, amount: u64, ctx: &mut TxContext): Coin<T> {
        let _ = witness;
        coin::from_balance(sui::balance::create_for_testing<T>(amount), ctx)
    }

    fun setup_clock(scenario: &mut Scenario): Clock {
        ts::next_tx(scenario, @0xA);
        let mut clock = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clock, 1000);
        clock
    }

    /// Create a standard partial-allowed offer: 1 SUI, price 1–2 USDC/SUI, expiry 5000, min_fill 100
    fun create_partial_offer(scenario: &mut Scenario, clock: &Clock) {
        ts::next_tx(scenario, @0xA);
        let ctx = ts::ctx(scenario);
        let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
        offer::create<SUI, USDC>(
            offer_coin,
            1_000_000_000,  // min_price
            2_000_000_000,  // max_price
            5000,           // expiry
            1,              // partial allowed
            100_000_000,    // min_fill: 0.1 SUI
            clock,
            ctx,
        );
    }

    /// Create a standard full-only offer: 1 SUI, price 1–2 USDC/SUI, expiry 5000
    fun create_full_only_offer(scenario: &mut Scenario, clock: &Clock) {
        ts::next_tx(scenario, @0xA);
        let ctx = ts::ctx(scenario);
        let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
        offer::create<SUI, USDC>(
            offer_coin,
            1_000_000_000,
            2_000_000_000,
            5000,
            0,  // full only
            0,
            clock,
            ctx,
        );
    }

    // =========================================================
    // 1. Happy path: full fill via atomic settle
    // =========================================================

    #[test]
    fun test_fill_full_and_settle() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_full_only_offer(&mut scenario, &clock);

        // Taker @0xB fills with 1.5 USDC (price = 1.5e9)
        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 1_500_000_000, ctx);

            offer::fill_full_and_settle(&mut offer, payment, &clock, ctx);

            assert!(offer::status(&offer) == offer::status_filled(), 0);
            assert!(offer::remaining_amount(&offer) == 0, 1);
            assert!(offer::total_filled(&offer) == 1_000_000_000, 2);
            assert!(offer::fill_count(&offer) == 1, 3);

            ts::return_shared(offer);
        };

        // Taker received SUI
        ts::next_tx(&mut scenario, @0xB);
        {
            let coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&coin) == 1_000_000_000, 4);
            ts::return_to_sender(&scenario, coin);
        };

        // Maker received USDC
        ts::next_tx(&mut scenario, @0xA);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == 1_500_000_000, 5);
            ts::return_to_sender(&scenario, coin);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 2. Happy path: partial fill via atomic settle
    // =========================================================

    #[test]
    fun test_fill_partial_and_settle() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_partial_offer(&mut scenario, &clock);

        // Taker fills 0.5 SUI with 0.75 USDC (price = 1.5e9)
        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 750_000_000, ctx);

            offer::fill_partial_and_settle(
                &mut offer, 500_000_000, payment, &clock, ctx,
            );

            assert!(offer::status(&offer) == offer::status_partially_filled(), 0);
            assert!(offer::remaining_amount(&offer) == 500_000_000, 1);
            assert!(offer::total_filled(&offer) == 500_000_000, 2);
            assert!(offer::fill_count(&offer) == 1, 3);

            ts::return_shared(offer);
        };

        // Taker received partial SUI
        ts::next_tx(&mut scenario, @0xB);
        {
            let coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&coin) == 500_000_000, 4);
            ts::return_to_sender(&scenario, coin);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 3. Low-level fill_full returns receipt
    // =========================================================

    #[test]
    fun test_fill_full_low_level_receipt() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_full_only_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 1_000_000_000, ctx);

            let (receipt, payment_coin) = offer::fill_full(&mut offer, payment, &clock, ctx);
            let (offer_coin, fill_amount, payment_amount, price, is_full) =
                offer::unpack_receipt(receipt);

            assert!(fill_amount == 1_000_000_000, 0);
            assert!(payment_amount == 1_000_000_000, 1);
            assert!(price == 1_000_000_000, 2); // 1:1
            assert!(is_full == true, 3);
            assert!(coin::value(&offer_coin) == 1_000_000_000, 4);

            // Manual routing
            sui::transfer::public_transfer(offer_coin, @0xB);
            sui::transfer::public_transfer(payment_coin, @0xA);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 4. Price too low
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 107)]
    fun test_fill_price_too_low() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_full_only_offer(&mut scenario, &clock); // min_price = 1e9

        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            // 0.5 USDC for 1 SUI → price = 0.5e9 < min_price 1e9
            let payment = mint_coin(USDC {}, 500_000_000, ctx);
            offer::fill_full_and_settle(&mut offer, payment, &clock, ctx);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 5. Price too high
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 108)]
    fun test_fill_price_too_high() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_full_only_offer(&mut scenario, &clock); // max_price = 2e9

        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            // 3 USDC for 1 SUI → price = 3e9 > max_price 2e9
            let payment = mint_coin(USDC {}, 3_000_000_000, ctx);
            offer::fill_full_and_settle(&mut offer, payment, &clock, ctx);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 6. Fill expired offer
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 105)]
    fun test_fill_expired_offer() {
        let mut scenario = ts::begin(@0xA);
        let mut clock = setup_clock(&mut scenario);
        create_full_only_offer(&mut scenario, &clock);

        clock::set_for_testing(&mut clock, 5000); // at expiry

        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 1_500_000_000, ctx);
            offer::fill_full_and_settle(&mut offer, payment, &clock, ctx);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 7. Partial fill on full-only offer
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 110)]
    fun test_partial_fill_on_full_only() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_full_only_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 750_000_000, ctx);
            offer::fill_partial_and_settle(
                &mut offer, 500_000_000, payment, &clock, ctx,
            );
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 8. Fill below minimum
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 111)]
    fun test_fill_below_minimum() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_partial_offer(&mut scenario, &clock); // min_fill = 100_000_000

        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            // Fill 50M < min_fill 100M
            let payment = mint_coin(USDC {}, 75_000_000, ctx);
            offer::fill_partial_and_settle(
                &mut offer, 50_000_000, payment, &clock, ctx,
            );
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 9. Fill exceeds remaining
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 112)]
    fun test_fill_exceeds_remaining() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_partial_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            // Fill 2B > remaining 1B
            let payment = mint_coin(USDC {}, 3_000_000_000, ctx);
            offer::fill_partial_and_settle(
                &mut offer, 2_000_000_000, payment, &clock, ctx,
            );
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 10. Dust prevention — would leave remainder < min_fill
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 113)]
    fun test_dust_prevention() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_partial_offer(&mut scenario, &clock); // 1B, min_fill 100M

        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            // Fill 950M → remainder 50M < min_fill 100M → dust
            let payment = mint_coin(USDC {}, 1_425_000_000, ctx);
            offer::fill_partial_and_settle(
                &mut offer, 950_000_000, payment, &clock, ctx,
            );
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 11. Exact min remainder is allowed (no dust)
    // =========================================================

    #[test]
    fun test_exact_min_remainder_allowed() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_partial_offer(&mut scenario, &clock); // 1B, min_fill 100M

        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            // Fill 900M → remainder 100M == min_fill → allowed
            let payment = mint_coin(USDC {}, 1_350_000_000, ctx);
            offer::fill_partial_and_settle(
                &mut offer, 900_000_000, payment, &clock, ctx,
            );

            assert!(offer::remaining_amount(&offer) == 100_000_000, 0);
            assert!(offer::status(&offer) == offer::status_partially_filled(), 1);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 12. Exact max price boundary
    // =========================================================

    #[test]
    fun test_exact_max_price_boundary() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_full_only_offer(&mut scenario, &clock); // max_price = 2e9

        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            // Exactly 2 USDC for 1 SUI → price = 2e9 == max_price
            let payment = mint_coin(USDC {}, 2_000_000_000, ctx);
            offer::fill_full_and_settle(&mut offer, payment, &clock, ctx);

            assert!(offer::status(&offer) == offer::status_filled(), 0);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 13. Sequential partial fills (4 steps)
    // =========================================================

    #[test]
    fun test_sequential_partial_fills() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_partial_offer(&mut scenario, &clock); // 1B, min_fill 100M

        // Fill 1: 300M
        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 450_000_000, ctx); // price 1.5
            offer::fill_partial_and_settle(&mut offer, 300_000_000, payment, &clock, ctx);
            assert!(offer::remaining_amount(&offer) == 700_000_000, 0);
            assert!(offer::fill_count(&offer) == 1, 1);
            ts::return_shared(offer);
        };

        // Fill 2: 200M
        ts::next_tx(&mut scenario, @0xC);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 300_000_000, ctx); // price 1.5
            offer::fill_partial_and_settle(&mut offer, 200_000_000, payment, &clock, ctx);
            assert!(offer::remaining_amount(&offer) == 500_000_000, 2);
            assert!(offer::fill_count(&offer) == 2, 3);
            ts::return_shared(offer);
        };

        // Fill 3: 300M
        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 450_000_000, ctx);
            offer::fill_partial_and_settle(&mut offer, 300_000_000, payment, &clock, ctx);
            assert!(offer::remaining_amount(&offer) == 200_000_000, 4);
            assert!(offer::fill_count(&offer) == 3, 5);
            ts::return_shared(offer);
        };

        // Fill 4: 200M (final — should transition to Filled)
        ts::next_tx(&mut scenario, @0xC);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 300_000_000, ctx);
            offer::fill_partial_and_settle(&mut offer, 200_000_000, payment, &clock, ctx);
            assert!(offer::remaining_amount(&offer) == 0, 6);
            assert!(offer::status(&offer) == offer::status_filled(), 7);
            assert!(offer::total_filled(&offer) == 1_000_000_000, 8);
            assert!(offer::fill_count(&offer) == 4, 9);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 14. Withdraw after partial fill
    // =========================================================

    #[test]
    fun test_withdraw_after_partial_fill() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_partial_offer(&mut scenario, &clock);

        // Partial fill 500M
        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 750_000_000, ctx);
            offer::fill_partial_and_settle(&mut offer, 500_000_000, payment, &clock, ctx);
            ts::return_shared(offer);
        };

        // Maker withdraws remaining 500M
        ts::next_tx(&mut scenario, @0xA);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            offer::withdraw(offer, ctx);
        };

        // Maker should have: USDC from fill + SUI from withdraw
        ts::next_tx(&mut scenario, @0xA);
        {
            let usdc = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&usdc) == 750_000_000, 0);
            ts::return_to_sender(&scenario, usdc);

            let sui_coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&sui_coin) == 500_000_000, 1);
            ts::return_to_sender(&scenario, sui_coin);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 15. Double-fill on already-filled offer
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 106)]
    fun test_double_fill_rejected() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_full_only_offer(&mut scenario, &clock);

        // First fill
        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 1_500_000_000, ctx);
            offer::fill_full_and_settle(&mut offer, payment, &clock, ctx);
            ts::return_shared(offer);
        };

        // Second fill — should fail (status = Filled)
        ts::next_tx(&mut scenario, @0xC);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 1_500_000_000, ctx);
            offer::fill_full_and_settle(&mut offer, payment, &clock, ctx);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 16. Price math helpers
    // =========================================================

    #[test]
    fun test_price_math() {
        // 1 USDC per 1 SUI → price = 1e9
        let price = offer::calculate_price(1_000_000_000, 1_000_000_000);
        assert!(price == 1_000_000_000, 0);

        // 2 USDC per 1 SUI → price = 2e9
        let price2 = offer::calculate_price(2_000_000_000, 1_000_000_000);
        assert!(price2 == 2_000_000_000, 1);

        // 0.5 SUI at 2x price → payment = 1 USDC
        let payment = offer::calc_payment(500_000_000, 2_000_000_000);
        assert!(payment == 1_000_000_000, 2);

        // 1 SUI at 1.5x price → payment = 1.5 USDC
        let payment2 = offer::calc_payment(1_000_000_000, 1_500_000_000);
        assert!(payment2 == 1_500_000_000, 3);

        // Small amounts: 100 units at 1.5x → 150 (ceiling)
        let payment3 = offer::calc_payment(100, 1_500_000_000);
        assert!(payment3 == 150, 4);
    }
}
EOF

echo "✅ fill_tests.move created (16 tests)"

# ============================================================
# Summary
# ============================================================
echo ""
echo "=== Phase 2 files ==="
find davy -type f | sort
echo ""
echo "--- Line counts ---"
wc -l davy/sources/offer.move davy/tests/fill_tests.move
echo ""
echo "Phase 2 checkpoint: Direct fills work end-to-end ✅"
echo "  - FillReceipt struct + unpack_receipt()"
echo "  - fill_full() / fill_partial() — low-level primitives"
echo "  - fill_full_and_settle() / fill_partial_and_settle() — atomic helpers"
echo "  - calculate_price() + calc_payment() — 1e9 scaling, u128 intermediates"
echo "  - check_no_dust() — rejects fills leaving remainder < min_fill"
echo "  - 16 tests: happy paths, price bounds, expiry, dust, sequential fills, double-fill"
echo ""
echo "Next: sui move build && sui move test"
