/// Davy Protocol — Intent Tests
/// Covers: creation, execution against offers, cancellation, expiry, and error paths.
#[test_only]
module davy::intent_tests {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};

    use davy::offer::{Self, LiquidityOffer};
    use davy::intent::{Self, ExecutionIntent};
    use davy::capability::{Self, AdminCap, ExecutorCap};

    // ===== Test Coins =====

    public struct USDC has drop {}
    public struct TOKEN_A has drop {}

    // ===== Addresses =====

    const ADMIN: address = @0xAD;
    const MAKER: address = @0xAA;
    const TAKER: address = @0xBB;
    const EXECUTOR: address = @0xEE;
    const NOBODY: address = @0x99;

    // ===== Helpers =====

    fun setup_clock(scenario: &mut ts::Scenario): Clock {
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 1000);
        clock
    }

    /// Create a standard offer: 1000 TOKEN_A, price 2e9 (2 USDC/TOKEN_A),
    /// expiry 10000, partial allowed, min_fill 100
    fun create_standard_offer(scenario: &mut ts::Scenario, clock: &Clock) {
        let coin = coin::mint_for_testing<TOKEN_A>(1000, scenario.ctx());
        offer::create<TOKEN_A, USDC>(
            coin,
            2_000_000_000, // min_price: 2 USDC per TOKEN_A
            2_000_000_000, // max_price: 2 USDC per TOKEN_A (fixed price)
            10_000,        // expiry
            1,             // partial allowed
            100,           // min_fill
            clock,
            scenario.ctx(),
        );
    }

    /// Create a range-price offer: 1000 TOKEN_A, price 1e9..3e9
    fun create_range_price_offer(scenario: &mut ts::Scenario, clock: &Clock) {
        let coin = coin::mint_for_testing<TOKEN_A>(1000, scenario.ctx());
        offer::create<TOKEN_A, USDC>(
            coin,
            1_000_000_000,
            3_000_000_000,
            10_000,
            1,
            100,
            clock,
            scenario.ctx(),
        );
    }

    fun setup_executor_cap(scenario: &mut ts::Scenario) {
        capability::init_for_testing(scenario.ctx());
    }

    fun mint_executor(scenario: &mut ts::Scenario) {
        let admin_cap = scenario.take_from_sender<AdminCap>();
        capability::mint_executor_cap(
            &admin_cap,
            b"test_executor",
            EXECUTOR,
            scenario.ctx(),
        );
        scenario.return_to_sender(admin_cap);
    }

    // ===== 1. Create intent — happy path =====

    #[test]
    fun test_create_intent() {
        let mut scenario = ts::begin(TAKER);
        let clock = setup_clock(&mut scenario);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000,
                payment,
                1_000_000_000,
                3_000_000_000,
                10_000,
                &clock,
                scenario.ctx(),
            );
        };
        scenario.next_tx(TAKER);
        {
            let intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            assert!(intent::creator(&intent) == TAKER);
            assert!(intent::receive_amount(&intent) == 1000);
            assert!(intent::escrowed_amount(&intent) == 5000);
            assert!(intent::max_pay_amount(&intent) == 5000);
            assert!(intent::intent_status(&intent) == intent::status_pending());
            let (min_p, max_p) = intent::intent_price_bounds(&intent);
            assert!(min_p == 1_000_000_000);
            assert!(max_p == 3_000_000_000);
            ts::return_shared(intent);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 2. Execute against offer — full fill =====

    #[test]
    fun test_execute_against_offer_full() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup_clock(&mut scenario);
        setup_executor_cap(&mut scenario);
        scenario.next_tx(ADMIN);
        mint_executor(&mut scenario);

        scenario.next_tx(MAKER);
        create_standard_offer(&mut scenario, &clock);

        scenario.next_tx(TAKER);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };

        scenario.next_tx(EXECUTOR);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();

            intent::execute_against_offer(
                &mut intent, &mut offer, &exec_cap, &clock, scenario.ctx(),
            );

            assert!(intent::intent_status(&intent) == intent::status_executed());
            assert!(intent::escrowed_amount(&intent) == 0);
            assert!(offer::status(&offer) == offer::status_filled());
            assert!(offer::remaining_amount(&offer) == 0);

            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent);
            ts::return_shared(offer);
        };

        // Taker gets 1000 TOKEN_A + 3000 USDC refund
        scenario.next_tx(TAKER);
        {
            let token_coin = scenario.take_from_sender<Coin<TOKEN_A>>();
            assert!(coin::value(&token_coin) == 1000);
            scenario.return_to_sender(token_coin);

            let refund_coin = scenario.take_from_sender<Coin<USDC>>();
            assert!(coin::value(&refund_coin) == 3000);
            scenario.return_to_sender(refund_coin);
        };

        // Maker gets 2000 USDC payment
        scenario.next_tx(MAKER);
        {
            let pay_coin = scenario.take_from_sender<Coin<USDC>>();
            assert!(coin::value(&pay_coin) == 2000);
            scenario.return_to_sender(pay_coin);
        };

        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 3. Execute — partial fill of offer =====

    #[test]
    fun test_execute_partial_fill() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup_clock(&mut scenario);
        setup_executor_cap(&mut scenario);
        scenario.next_tx(ADMIN);
        mint_executor(&mut scenario);

        scenario.next_tx(MAKER);
        create_standard_offer(&mut scenario, &clock);

        // Taker wants only 500 TOKEN_A
        scenario.next_tx(TAKER);
        {
            let payment = coin::mint_for_testing<USDC>(3000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                500, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };

        scenario.next_tx(EXECUTOR);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();

            intent::execute_against_offer(
                &mut intent, &mut offer, &exec_cap, &clock, scenario.ctx(),
            );

            assert!(intent::intent_status(&intent) == intent::status_executed());
            assert!(offer::status(&offer) == offer::status_partially_filled());
            assert!(offer::remaining_amount(&offer) == 500);

            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent);
            ts::return_shared(offer);
        };

        // Taker: 500 TOKEN_A + 2000 USDC refund (paid 1000)
        scenario.next_tx(TAKER);
        {
            let token_coin = scenario.take_from_sender<Coin<TOKEN_A>>();
            assert!(coin::value(&token_coin) == 500);
            scenario.return_to_sender(token_coin);

            let refund_coin = scenario.take_from_sender<Coin<USDC>>();
            assert!(coin::value(&refund_coin) == 2000);
            scenario.return_to_sender(refund_coin);
        };

        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 4. Cancel intent — happy path =====

    #[test]
    fun test_cancel_intent() {
        let mut scenario = ts::begin(TAKER);
        let clock = setup_clock(&mut scenario);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };
        scenario.next_tx(TAKER);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            intent::cancel(&mut intent, scenario.ctx());
            assert!(intent::intent_status(&intent) == intent::status_cancelled());
            assert!(intent::escrowed_amount(&intent) == 0);
            ts::return_shared(intent);
        };
        scenario.next_tx(TAKER);
        {
            let refund = scenario.take_from_sender<Coin<USDC>>();
            assert!(coin::value(&refund) == 5000);
            scenario.return_to_sender(refund);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 5. Cancel by non-creator aborts (206) =====

    #[test]
    #[expected_failure(abort_code = 206, location = davy::intent)]
    fun test_cancel_not_creator_aborts() {
        let mut scenario = ts::begin(TAKER);
        let clock = setup_clock(&mut scenario);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };
        scenario.next_tx(NOBODY);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            intent::cancel(&mut intent, scenario.ctx());
            ts::return_shared(intent);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 6. Expire intent — happy path =====

    #[test]
    fun test_expire_intent() {
        let mut scenario = ts::begin(TAKER);
        let mut clock = setup_clock(&mut scenario);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };
        clock::set_for_testing(&mut clock, 10_000);
        scenario.next_tx(NOBODY);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            intent::expire_intent(&mut intent, &clock, scenario.ctx());
            assert!(intent::intent_status(&intent) == intent::status_expired());
            assert!(intent::escrowed_amount(&intent) == 0);
            ts::return_shared(intent);
        };
        // Refund goes to creator (TAKER), not caller
        scenario.next_tx(TAKER);
        {
            let refund = scenario.take_from_sender<Coin<USDC>>();
            assert!(coin::value(&refund) == 5000);
            scenario.return_to_sender(refund);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 7. Expire before time aborts (201) =====

    #[test]
    #[expected_failure(abort_code = 202, location = davy::intent)]
    fun test_expire_before_time_aborts() {
        let mut scenario = ts::begin(TAKER);
        let clock = setup_clock(&mut scenario);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };
        scenario.next_tx(NOBODY);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            intent::expire_intent(&mut intent, &clock, scenario.ctx());
            ts::return_shared(intent);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 8. Execute expired intent aborts (201) =====

    #[test]
    #[expected_failure(abort_code = 201, location = davy::intent)]
    fun test_execute_expired_intent_aborts() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = setup_clock(&mut scenario);
        setup_executor_cap(&mut scenario);
        scenario.next_tx(ADMIN);
        mint_executor(&mut scenario);

        scenario.next_tx(MAKER);
        create_standard_offer(&mut scenario, &clock);

        scenario.next_tx(TAKER);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };

        clock::set_for_testing(&mut clock, 10_000);

        scenario.next_tx(EXECUTOR);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            intent::execute_against_offer(
                &mut intent, &mut offer, &exec_cap, &clock, scenario.ctx(),
            );
            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent);
            ts::return_shared(offer);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 9. Double execute aborts (200) =====

    #[test]
    #[expected_failure(abort_code = 200)]
    fun test_double_execute_aborts() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup_clock(&mut scenario);
        setup_executor_cap(&mut scenario);
        scenario.next_tx(ADMIN);
        mint_executor(&mut scenario);

        scenario.next_tx(MAKER);
        create_standard_offer(&mut scenario, &clock);

        scenario.next_tx(TAKER);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };

        // First execution succeeds
        scenario.next_tx(EXECUTOR);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            intent::execute_against_offer(
                &mut intent, &mut offer, &exec_cap, &clock, scenario.ctx(),
            );
            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent);
            ts::return_shared(offer);
        };

        // New offer for retry attempt
        scenario.next_tx(MAKER);
        create_standard_offer(&mut scenario, &clock);

        // Second execution aborts
        scenario.next_tx(EXECUTOR);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            intent::execute_against_offer(
                &mut intent, &mut offer, &exec_cap, &clock, scenario.ctx(),
            );
            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent);
            ts::return_shared(offer);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 10. Insufficient offer liquidity aborts (204) =====

    #[test]
    #[expected_failure(abort_code = 204, location = davy::intent)]
    fun test_insufficient_offer_liquidity_aborts() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup_clock(&mut scenario);
        setup_executor_cap(&mut scenario);
        scenario.next_tx(ADMIN);
        mint_executor(&mut scenario);

        // Maker: only 500 TOKEN_A
        scenario.next_tx(MAKER);
        {
            let coin = coin::mint_for_testing<TOKEN_A>(500, scenario.ctx());
            offer::create<TOKEN_A, USDC>(
                coin,
                2_000_000_000, 2_000_000_000,
                10_000, 1, 100,
                &clock, scenario.ctx(),
            );
        };

        // Taker wants 1000 (more than available)
        scenario.next_tx(TAKER);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };

        scenario.next_tx(EXECUTOR);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            intent::execute_against_offer(
                &mut intent, &mut offer, &exec_cap, &clock, scenario.ctx(),
            );
            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent);
            ts::return_shared(offer);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 11. Insufficient escrowed payment aborts (205) =====

    #[test]
    #[expected_failure(abort_code = 205, location = davy::intent)]
    fun test_insufficient_escrow_aborts() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup_clock(&mut scenario);
        setup_executor_cap(&mut scenario);
        scenario.next_tx(ADMIN);
        mint_executor(&mut scenario);

        // Offer: 1000 TOKEN_A at 2e9 → needs 2000 USDC
        scenario.next_tx(MAKER);
        create_standard_offer(&mut scenario, &clock);

        // Taker only escrows 500 USDC
        scenario.next_tx(TAKER);
        {
            let payment = coin::mint_for_testing<USDC>(500, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };

        scenario.next_tx(EXECUTOR);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            intent::execute_against_offer(
                &mut intent, &mut offer, &exec_cap, &clock, scenario.ctx(),
            );
            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent);
            ts::return_shared(offer);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 12. Price mismatch — offer price above intent max (203) =====

    #[test]
    #[expected_failure(abort_code = 203, location = davy::intent)]
    fun test_price_mismatch_aborts() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup_clock(&mut scenario);
        setup_executor_cap(&mut scenario);
        scenario.next_tx(ADMIN);
        mint_executor(&mut scenario);

        // Offer at 5e9 (5 USDC/TOKEN_A)
        scenario.next_tx(MAKER);
        {
            let coin = coin::mint_for_testing<TOKEN_A>(1000, scenario.ctx());
            offer::create<TOKEN_A, USDC>(
                coin,
                5_000_000_000, 5_000_000_000,
                10_000, 1, 100,
                &clock, scenario.ctx(),
            );
        };

        // Intent max_price 3e9 — won't accept 5e9
        scenario.next_tx(TAKER);
        {
            let payment = coin::mint_for_testing<USDC>(10000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000,
                3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };

        scenario.next_tx(EXECUTOR);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            intent::execute_against_offer(
                &mut intent, &mut offer, &exec_cap, &clock, scenario.ctx(),
            );
            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent);
            ts::return_shared(offer);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 13. Zero receive_amount aborts (208) =====

    #[test]
    #[expected_failure(abort_code = 208, location = davy::intent)]
    fun test_create_zero_receive_aborts() {
        let mut scenario = ts::begin(TAKER);
        let clock = setup_clock(&mut scenario);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                0, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 14. Zero payment aborts (209) =====

    #[test]
    #[expected_failure(abort_code = 209, location = davy::intent)]
    fun test_create_zero_payment_aborts() {
        let mut scenario = ts::begin(TAKER);
        let clock = setup_clock(&mut scenario);
        {
            let payment = coin::mint_for_testing<USDC>(0, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 15. Expired on create aborts (207) =====

    #[test]
    #[expected_failure(abort_code = 207, location = davy::intent)]
    fun test_create_expired_aborts() {
        let mut scenario = ts::begin(TAKER);
        let clock = setup_clock(&mut scenario); // clock at 1000
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                500, // expiry < clock → abort 207
                &clock, scenario.ctx(),
            );
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 16. Double cancel aborts (200) =====

    #[test]
    #[expected_failure(abort_code = 200)]
    fun test_double_cancel_aborts() {
        let mut scenario = ts::begin(TAKER);
        let clock = setup_clock(&mut scenario);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000, 3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };
        scenario.next_tx(TAKER);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            intent::cancel(&mut intent, scenario.ctx());
            ts::return_shared(intent);
        };
        scenario.next_tx(TAKER);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            intent::cancel(&mut intent, scenario.ctx());
            ts::return_shared(intent);
        };
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== 17. Execute with range price — uses offer min_price =====

    #[test]
    fun test_execute_uses_offer_min_price() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup_clock(&mut scenario);
        setup_executor_cap(&mut scenario);
        scenario.next_tx(ADMIN);
        mint_executor(&mut scenario);

        // Maker: range price 1e9..3e9
        scenario.next_tx(MAKER);
        create_range_price_offer(&mut scenario, &clock);

        scenario.next_tx(TAKER);
        {
            let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
            intent::create_price_bounded<TOKEN_A, USDC>(
                1000, payment,
                1_000_000_000,
                3_000_000_000,
                10_000, &clock, scenario.ctx(),
            );
        };

        scenario.next_tx(EXECUTOR);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();

            intent::execute_against_offer(
                &mut intent, &mut offer, &exec_cap, &clock, scenario.ctx(),
            );

            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent);
            ts::return_shared(offer);
        };

        // At min_price 1e9: payment = 1000 USDC, refund = 4000
        scenario.next_tx(MAKER);
        {
            let pay_coin = scenario.take_from_sender<Coin<USDC>>();
            assert!(coin::value(&pay_coin) == 1000);
            scenario.return_to_sender(pay_coin);
        };

        scenario.next_tx(TAKER);
        {
            let refund = scenario.take_from_sender<Coin<USDC>>();
            assert!(coin::value(&refund) == 4000);
            scenario.return_to_sender(refund);
        };

        clock::destroy_for_testing(clock);
        scenario.end();
    }
}
