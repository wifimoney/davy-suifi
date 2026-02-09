/// Davy Protocol — Quote Function Tests (Phase 7)
///
/// Validates that quote_pay_amount and quote_fill_amount produce results
/// identical to actual fill settlement math. The core invariant:
///   quote_pay_amount(offer, N, price) == payment in fill_*_and_settle(offer, N, price)
///
/// Rounding rules:
///   quote_pay_amount  → ceiling (taker never under-pays)
///   quote_fill_amount → floor   (taker never over-receives)
#[test_only]
module davy::quote_tests {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self};
    use sui::clock::{Self, Clock};
    use sui::balance;

    use davy::offer::{Self, LiquidityOffer};
    use davy::errors;

    // ===== Test addresses =====
    const MAKER: address = @0x1;
    const TAKER: address = @0x2;

    // ===== Test coins =====
    public struct SUI has drop {}
    public struct USDC has drop {}

    // ===== Helpers =====

    /// Standard offer: 10 SUI, price 1.5–3.0 USDC/SUI, partial allowed, min fill 1 SUI
    fun create_standard_offer(scenario: &mut ts::Scenario, clock: &Clock) {
        ts::next_tx(scenario, MAKER);
        {
            let coin = coin::mint_for_testing<SUI>(10_000_000_000, ts::ctx(scenario)); // 10 SUI
            offer::create<SUI, USDC>(
                coin,
                1_500_000_000,  // min_price: 1.5 USDC/SUI
                3_000_000_000,  // max_price: 3.0 USDC/SUI
                1,              // fill_policy: partial allowed
                1_000_000_000,  // min_fill: 1 SUI
                clock::timestamp_ms(clock) + 3_600_000, // 1hr
                clock,
                ts::ctx(scenario),
            );
        };
    }

    // =========================================================================
    // 1. quote_pay_amount: basic correctness
    // =========================================================================

    #[test]
    /// Quote for full fill at 2.0 price: 10 SUI × 2.0 = 20 USDC
    fun test_quote_pay_full_fill() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            let payment = offer::quote_pay_amount(&offer, 10_000_000_000, 2_000_000_000);
            assert!(payment == 20_000_000_000, 0); // 10 × 2.0 = 20

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Quote for partial fill: 3 SUI at 2.0 = 6 USDC
    fun test_quote_pay_partial_fill() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            let payment = offer::quote_pay_amount(&offer, 3_000_000_000, 2_000_000_000);
            assert!(payment == 6_000_000_000, 0); // 3 × 2.0 = 6

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Quote rounding: ceiling division never under-charges.
    /// 1 unit at price 1_500_000_001 → ceil(1 × 1_500_000_001 / 1e9) = 2 (not 1)
    fun test_quote_pay_ceiling_rounding() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        // Create offer with wide price bounds to allow this price
        ts::next_tx(&mut scenario, MAKER);
        {
            let coin = coin::mint_for_testing<SUI>(10_000_000_000, ts::ctx(&mut scenario));
            offer::create<SUI, USDC>(
                coin,
                1_000_000_000,  // min: 1.0
                5_000_000_000,  // max: 5.0
                1,              // partial
                1,              // min_fill: 1 unit (tiny)
                clock::timestamp_ms(&clock) + 3_600_000,
                &clock,
                ts::ctx(&mut scenario),
            );
        };

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            // 1 unit at price 1_500_000_001 (just above 1.5)
            // Exact: 1 × 1_500_000_001 / 1_000_000_000 = 1.500000001
            // Ceiling: 2
            let payment = offer::quote_pay_amount(&offer, 1, 1_500_000_001);
            assert!(payment == 2, 0);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================================
    // 2. quote_fill_amount: basic correctness
    // =========================================================================

    #[test]
    /// Budget of 20 USDC at price 2.0 → 10 SUI (full remaining)
    fun test_quote_fill_exact_budget() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            let fill = offer::quote_fill_amount(&offer, 20_000_000_000, 2_000_000_000);
            assert!(fill == 10_000_000_000, 0); // 20 / 2.0 = 10 (clamped to remaining)

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Budget of 6 USDC at price 2.0 → 3 SUI
    fun test_quote_fill_partial_budget() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            let fill = offer::quote_fill_amount(&offer, 6_000_000_000, 2_000_000_000);
            assert!(fill == 3_000_000_000, 0); // 6 / 2.0 = 3

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Budget exceeds offer → clamped to remaining
    fun test_quote_fill_clamps_to_remaining() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            // 100 USDC at 2.0 → would be 50 SUI but only 10 available
            let fill = offer::quote_fill_amount(&offer, 100_000_000_000, 2_000_000_000);
            assert!(fill == 10_000_000_000, 0); // clamped to 10

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Floor rounding: never over-promises.
    /// Budget 1 at price 3_000_000_000 (3.0) → floor(1 × 1e9 / 3e9) = 0
    fun test_quote_fill_floor_rounding() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            // 1 unit of USDC at price 3.0 → floor(1e9 / 3e9) = 0
            let fill = offer::quote_fill_amount(&offer, 1, 3_000_000_000);
            assert!(fill == 0, 0); // too small to buy anything

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================================
    // 3. Consistency: quote_pay_amount ↔ quote_fill_amount
    // =========================================================================

    #[test]
    /// Round-trip consistency: quote_fill_amount then quote_pay_amount
    /// should produce payment ≤ original budget (due to floor then ceil)
    fun test_quote_roundtrip_consistency() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            let budget: u64 = 7_500_000_000; // 7.5 USDC
            let price: u64 = 2_000_000_000;  // 2.0

            // Step 1: how much can I get?
            let fill = offer::quote_fill_amount(&offer, budget, price);
            // 7.5 / 2.0 = 3.75 → floor = 3.75e9 → 3_750_000_000

            // Step 2: what does that cost?
            if (fill > 0) {
                let cost = offer::quote_pay_amount(&offer, fill, price);
                // cost should be ≤ budget (we floored the fill, then ceiled the payment)
                assert!(cost <= budget, 0);
            };

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================================
    // 4. Validation: quote_pay_amount respects offer constraints
    // =========================================================================

    #[test]
    #[expected_failure(abort_code = 107, location = davy::errors)] // EPRICE_TOO_LOW
    /// Price below min_price → abort
    fun test_quote_pay_price_too_low() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            // min_price is 1.5, try 1.0
            let _payment = offer::quote_pay_amount(&offer, 1_000_000_000, 1_000_000_000);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 108, location = davy::errors)] // EPRICE_TOO_HIGH
    /// Price above max_price → abort
    fun test_quote_pay_price_too_high() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            // max_price is 3.0, try 4.0
            let _payment = offer::quote_pay_amount(&offer, 1_000_000_000, 4_000_000_000);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 110, location = davy::errors)] // EPARTIAL_FILL_NOT_ALLOWED
    /// Partial fill on full-only offer → abort
    fun test_quote_pay_partial_on_full_only() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        // Create FULL-ONLY offer
        ts::next_tx(&mut scenario, MAKER);
        {
            let coin = coin::mint_for_testing<SUI>(10_000_000_000, ts::ctx(&mut scenario));
            offer::create<SUI, USDC>(
                coin,
                1_500_000_000,
                3_000_000_000,
                0,              // fill_policy: FULL ONLY
                1_000_000_000,
                clock::timestamp_ms(&clock) + 3_600_000,
                &clock,
                ts::ctx(&mut scenario),
            );
        };

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            // Try partial fill: 5 SUI on a 10 SUI full-only offer
            let _payment = offer::quote_pay_amount(&offer, 5_000_000_000, 2_000_000_000);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 113, location = davy::errors)] // EWOULD_LEAVE_DUST
    /// Dust prevention: fill would leave remainder < min_fill_amount
    fun test_quote_pay_dust_prevention() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            // 10 SUI offer, min_fill 1 SUI. Fill 9.5 → leaves 0.5 (dust)
            let _payment = offer::quote_pay_amount(&offer, 9_500_000_000, 2_000_000_000);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================================
    // 5. quote_pay_amount matches actual fill settlement
    // =========================================================================

    #[test]
    /// THE KEY INVARIANT: quoted payment == actual settlement payment
    /// Create offer → quote → fill → compare amounts
    fun test_quote_matches_actual_fill() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        let fill_amount: u64 = 3_000_000_000; // 3 SUI
        let price: u64 = 2_000_000_000; // 2.0

        // Step 1: Quote
        ts::next_tx(&mut scenario, TAKER);
        let quoted_payment;
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            quoted_payment = offer::quote_pay_amount(&offer, fill_amount, price);
            ts::return_shared(offer);
        };

        // Step 2: Actual fill with exactly quoted payment
        ts::next_tx(&mut scenario, TAKER);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let payment_coin = coin::mint_for_testing<USDC>(quoted_payment, ts::ctx(&mut scenario));

            // This should succeed — the quote is exact
            offer::fill_partial_and_settle(
                &mut offer,
                fill_amount,
                payment_coin,
                &clock,
                ts::ctx(&mut scenario),
            );

            // Verify remaining
            assert!(offer::remaining_amount(&offer) == 7_000_000_000, 0);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================================
    // 6. Edge cases
    // =========================================================================

    #[test]
    /// Min price boundary: quote at exactly min_price succeeds
    fun test_quote_at_min_price() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            // Quote at exactly min_price (1.5)
            let payment = offer::quote_pay_amount(&offer, 10_000_000_000, 1_500_000_000);
            // 10 × 1.5 = 15
            assert!(payment == 15_000_000_000, 0);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    /// Max price boundary: quote at exactly max_price succeeds
    fun test_quote_at_max_price() {
        let mut scenario = ts::begin(MAKER);
        let clock = clock::create_for_testing(ts::ctx(&mut scenario));

        create_standard_offer(&mut scenario, &clock);

        ts::next_tx(&mut scenario, TAKER);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            // Quote at exactly max_price (3.0)
            let payment = offer::quote_pay_amount(&offer, 10_000_000_000, 3_000_000_000);
            // 10 × 3.0 = 30
            assert!(payment == 30_000_000_000, 0);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
