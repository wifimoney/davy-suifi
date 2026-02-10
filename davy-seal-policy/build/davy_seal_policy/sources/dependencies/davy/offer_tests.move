#[test_only]
module davy::offer_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    // use sui::test_utils;

    use davy::offer::{Self, LiquidityOffer};

    // ===== Test coin types =====
    public struct SUI has drop {}
    public struct USDC has drop {}

    // ===== Helpers =====

    fun mint_coin<T: drop>(_witness: T, amount: u64, ctx: &mut TxContext): Coin<T> {
        coin::from_balance(
            sui::balance::create_for_testing<T>(amount),
            ctx,
        )
    }

    fun setup_clock(scenario: &mut Scenario): Clock {
        ts::next_tx(scenario, @0xA);
        let mut clock = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clock, 1000); // t=1000ms
        clock
    }

    // ===== 1. Happy path: create offer =====

    #[test]
    fun test_create_offer_happy_path() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);

            offer::create<SUI, USDC>(
                offer_coin,
                1_000_000_000,  // min_price: 1 USDC per SUI
                2_000_000_000,  // max_price: 2 USDC per SUI
                5000,           // expiry: t=5000ms
                0,              // fill_policy: FullOnly
                0,              // min_fill: 0
                &clock,
                ctx,
            );
        };

        // Verify offer was shared
        ts::next_tx(&mut scenario, @0xA);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            assert!(offer::remaining_amount(&offer) == 1_000_000_000, 0);
            assert!(offer::initial_amount(&offer) == 1_000_000_000, 1);
            assert!(offer::status(&offer) == offer::status_created(), 2);
            assert!(offer::maker(&offer) == @0xA, 3);
            assert!(offer::fill_policy(&offer) == offer::fill_policy_full_only(), 4);
            assert!(offer::total_filled(&offer) == 0, 5);
            assert!(offer::fill_count(&offer) == 0, 6);
            assert!(offer::is_fillable(&offer, &clock), 7);

            let (min_p, max_p) = offer::price_bounds(&offer);
            assert!(min_p == 1_000_000_000, 8);
            assert!(max_p == 2_000_000_000, 9);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 2. Create offer with partial fill policy =====

    #[test]
    fun test_create_offer_partial_policy() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);

            offer::create<SUI, USDC>(
                offer_coin,
                500_000_000,
                3_000_000_000,
                5000,
                1,                  // PartialAllowed
                100_000_000,        // min_fill: 0.1 SUI
                &clock,
                ctx,
            );
        };

        ts::next_tx(&mut scenario, @0xA);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            assert!(offer::fill_policy(&offer) == offer::fill_policy_partial_allowed(), 0);
            assert!(offer::min_fill_amount(&offer) == 100_000_000, 1);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 3. Error: zero amount =====

    #[test]
    #[expected_failure(abort_code = 100, location = davy::offer)]
    fun test_create_zero_amount() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 0, ctx);
            offer::create<SUI, USDC>(
                offer_coin, 1_000_000_000, 2_000_000_000, 5000, 0, 0, &clock, ctx,
            );
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 4. Error: zero min_price =====

    #[test]
    #[expected_failure(abort_code = 101, location = davy::offer)]
    fun test_create_zero_min_price() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin, 0, 2_000_000_000, 5000, 0, 0, &clock, ctx,
            );
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 5. Error: invalid price bounds (min > max) =====

    #[test]
    #[expected_failure(abort_code = 103, location = davy::offer)]
    fun test_create_invalid_price_bounds() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin,
                3_000_000_000,  // min > max
                2_000_000_000,
                5000, 0, 0, &clock, ctx,
            );
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 6. Error: expired on create =====

    #[test]
    #[expected_failure(abort_code = 109, location = davy::offer)]
    fun test_create_expired_on_create() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin,
                1_000_000_000, 2_000_000_000,
                500,    // expiry in the past (clock is at 1000)
                0, 0, &clock, ctx,
            );
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 7. Error: invalid fill policy =====

    #[test]
    #[expected_failure(abort_code = 104, location = davy::offer)]
    fun test_create_invalid_fill_policy() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin,
                1_000_000_000, 2_000_000_000, 5000,
                3,  // invalid policy (0, 1, 2 are valid)
                0, &clock, ctx,
            );
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 8. Error: min_fill exceeds amount =====

    #[test]
    #[expected_failure(abort_code = 118, location = davy::offer)]
    fun test_create_min_fill_exceeds_amount() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin,
                1_000_000_000, 2_000_000_000, 5000,
                1,                  // partial allowed
                2_000_000_000,      // min_fill > offer amount
                &clock, ctx,
            );
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 9. Happy path: withdraw from Created =====

    #[test]
    fun test_withdraw_from_created() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        // Create
        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin, 1_000_000_000, 2_000_000_000, 5000, 0, 0, &clock, ctx,
            );
        };

        // Withdraw
        ts::next_tx(&mut scenario, @0xA);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            offer::withdraw(offer, ctx);
        };

        // Verify maker received funds back
        ts::next_tx(&mut scenario, @0xA);
        {
            let coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&coin) == 1_000_000_000, 0);
            ts::return_to_sender(&scenario, coin);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 10. Error: withdraw by non-maker =====

    #[test]
    #[expected_failure(abort_code = 114, location = davy::offer)]
    fun test_withdraw_not_maker() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        // Create as @0xA
        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin, 1_000_000_000, 2_000_000_000, 5000, 0, 0, &clock, ctx,
            );
        };

        // Withdraw as @0xB — should fail
        ts::next_tx(&mut scenario, @0xB);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            offer::withdraw(offer, ctx);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 11. Happy path: expire after time passes =====

    #[test]
    fun test_expire_after_expiry() {
        let mut scenario = ts::begin(@0xA);
        let mut clock = setup_clock(&mut scenario);

        // Create with expiry at t=5000
        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin, 1_000_000_000, 2_000_000_000, 5000, 0, 0, &clock, ctx,
            );
        };

        // Advance clock past expiry
        clock::set_for_testing(&mut clock, 5000);

        // Anyone can expire (using @0xC)
        ts::next_tx(&mut scenario, @0xC);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            offer::expire(offer, &clock, ctx);
        };

        // Verify maker (@0xA) received funds back
        ts::next_tx(&mut scenario, @0xA);
        {
            let coin = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&coin) == 1_000_000_000, 0);
            ts::return_to_sender(&scenario, coin);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 12. Error: expire before time =====

    #[test]
    #[expected_failure(abort_code = 116, location = davy::offer)]
    fun test_expire_before_time() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin, 1_000_000_000, 2_000_000_000, 5000, 0, 0, &clock, ctx,
            );
        };

        // Try expire at t=1000 (expiry is 5000) — should fail
        ts::next_tx(&mut scenario, @0xA);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            offer::expire(offer, &clock, ctx);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 13. is_fillable returns false after expiry time =====

    #[test]
    fun test_is_fillable_false_after_expiry() {
        let mut scenario = ts::begin(@0xA);
        let mut clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin, 1_000_000_000, 2_000_000_000, 5000, 0, 0, &clock, ctx,
            );
        };

        ts::next_tx(&mut scenario, @0xA);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);

            // Before expiry
            assert!(offer::is_fillable(&offer, &clock), 0);

            // After expiry
            clock::set_for_testing(&mut clock, 5000);
            assert!(!offer::is_fillable(&offer, &clock), 1);

            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 14. Exact expiry boundary (expiry == now) =====

    #[test]
    fun test_expire_exact_boundary() {
        let mut scenario = ts::begin(@0xA);
        let mut clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin, 1_000_000_000, 2_000_000_000, 5000, 0, 0, &clock, ctx,
            );
        };

        // Set clock exactly at expiry boundary
        clock::set_for_testing(&mut clock, 5000);

        ts::next_tx(&mut scenario, @0xA);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            // is_fillable should be false at exact boundary (now >= expiry)
            assert!(!offer::is_fillable(&offer, &clock), 0);
            // expire should succeed
            let ctx = ts::ctx(&mut scenario);
            offer::expire(offer, &clock, ctx);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== 15. Equal min and max price =====

    #[test]
    fun test_create_equal_price_bounds() {
        let mut scenario = ts::begin(@0xA);
        let clock = setup_clock(&mut scenario);

        ts::next_tx(&mut scenario, @0xA);
        {
            let ctx = ts::ctx(&mut scenario);
            let offer_coin = mint_coin(SUI {}, 1_000_000_000, ctx);
            offer::create<SUI, USDC>(
                offer_coin,
                1_500_000_000,  // min == max (fixed price)
                1_500_000_000,
                5000, 0, 0, &clock, ctx,
            );
        };

        ts::next_tx(&mut scenario, @0xA);
        {
            let offer = ts::take_shared<LiquidityOffer<SUI, USDC>>(&scenario);
            let (min_p, max_p) = offer::price_bounds(&offer);
            assert!(min_p == max_p, 0);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
