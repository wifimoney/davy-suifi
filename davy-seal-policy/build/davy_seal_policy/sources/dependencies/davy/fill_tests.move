#[test_only]
module davy::fill_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};

    use davy::offer::{Self, LiquidityOffer};
    use davy::capability::{Self, AdminCap, PartialFillCap};

    // ===== Test coin types =====
    public struct SUI has drop {}
    public struct USDC has drop {}

    // ===== Helpers =====

    fun mint_coin<T: drop>(_witness: T, amount: u64, ctx: &mut TxContext): Coin<T> {
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

    /// Create a gated partial offer: 1 SUI, price 1–2 USDC/SUI, expiry 5000, min_fill 100, policy=2
    fun create_gated_offer(scenario: &mut Scenario, clock: &Clock) {
        ts::next_tx(scenario, @0xA);
        let ctx = ts::ctx(scenario);
        let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
        offer::create<SUI, USDC>(
            offer_coin,
            1_000_000_000,  // min_price
            2_000_000_000,  // max_price
            5000,           // expiry
            2,              // partial gated
            100_000_000,    // min_fill: 0.1 SUI
            clock,
            ctx,
        );
    }

    /// Mint a PartialFillCap for testing
    fun setup_partial_fill_cap(scenario: &mut Scenario) {
        ts::next_tx(scenario, @0xA);
        capability::init_for_testing(ts::ctx(scenario));
        ts::next_tx(scenario, @0xA);
        let admin_cap = ts::take_from_sender<AdminCap>(scenario);
        capability::mint_partial_fill_cap(&admin_cap, b"test_gated", @0xB, ts::ctx(scenario));
        ts::return_to_sender(scenario, admin_cap);
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
                offer::unpack_receipt(receipt, ctx);

            assert!(fill_amount == 1_000_000_000, 0);
            assert!(payment_amount == 1_000_000_000, 1);
            assert!(price == 1_000_000_000, 2); // 1:1
            assert!(is_full == true, 3);
            assert!(coin::value(&offer_coin) == 1_000_000_000, 4);

            // Manual routing
            transfer::public_transfer(offer_coin, @0xB);
            transfer::public_transfer(payment_coin, @0xA);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 4. Price too low
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 107, location = davy::offer)]
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
    #[expected_failure(abort_code = 108, location = davy::offer)]
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
    #[expected_failure(abort_code = 105, location = davy::offer)]
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
    #[expected_failure(abort_code = 110, location = davy::offer)]
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
    #[expected_failure(abort_code = 111, location = davy::offer)]
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
    #[expected_failure(abort_code = 112, location = davy::offer)]
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
    #[expected_failure(abort_code = 113, location = davy::offer)]
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
    #[expected_failure(abort_code = 106, location = davy::offer)]
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

    // =========================================================
    // 17. Gated partial fill — happy path with PartialFillCap
    // =========================================================

    #[test]
    fun test_fill_partial_gated_happy_path() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        setup_partial_fill_cap(&mut scenario);
        create_gated_offer(&mut scenario, &clock);

        // Taker @0xB fills 0.5 SUI with 0.75 USDC (price = 1.5e9), using cap
        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let cap = ts::take_from_sender<PartialFillCap>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 750_000_000, ctx);

            offer::fill_partial_gated_and_settle(
                &mut offer, 500_000_000, payment, &cap, &clock, ctx,
            );

            assert!(offer::status(&offer) == offer::status_partially_filled(), 0);
            assert!(offer::remaining_amount(&offer) == 500_000_000, 1);
            assert!(offer::total_filled(&offer) == 500_000_000, 2);
            assert!(offer::fill_count(&offer) == 1, 3);

            ts::return_to_sender(&scenario, cap);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 18. Standard fill_partial on gated offer should abort
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 110, location = davy::offer)]
    fun test_fill_partial_on_gated_offer_aborts() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_gated_offer(&mut scenario, &clock);

        // Taker @0xB tries standard fill_partial on gated offer — should fail
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
    // 19. Gated fill without cap aborts (wrong policy check)
    // =========================================================

    #[test]
    #[expected_failure(abort_code = 119, location = davy::offer)]
    fun test_fill_partial_gated_without_cap_aborts() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        setup_partial_fill_cap(&mut scenario);
        // Create a regular partial offer (policy=1), NOT gated
        create_partial_offer(&mut scenario, &clock);

        // Taker @0xB tries gated fill on non-gated offer — should fail with 119
        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let cap = ts::take_from_sender<PartialFillCap>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 750_000_000, ctx);

            offer::fill_partial_gated_and_settle(
                &mut offer, 500_000_000, payment, &cap, &clock, ctx,
            );

            ts::return_to_sender(&scenario, cap);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // =========================================================
    // 20. Full fills still work on gated offers
    // =========================================================

    #[test]
    fun test_fill_full_on_gated_offer_works() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);
        create_gated_offer(&mut scenario, &clock);

        // Taker @0xB does a full fill — no cap needed for full fills
        ts::next_tx(&mut scenario, @0xB);
        {
            let mut offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let payment = mint_coin(USDC {}, 1_500_000_000, ctx);

            offer::fill_full_and_settle(&mut offer, payment, &clock, ctx);

            assert!(offer::status(&offer) == offer::status_filled(), 0);
            assert!(offer::remaining_amount(&offer) == 0, 1);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
