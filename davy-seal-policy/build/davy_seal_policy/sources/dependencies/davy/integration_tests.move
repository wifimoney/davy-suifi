/// Davy Protocol — Integration Tests
/// Covers: E2E flows involving multiple modules (Offers, Intents, Capabilities, Pools).
#[test_only]
module davy::integration_tests {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, Coin};
    use sui::clock;

    use davy::offer::{Self, LiquidityOffer};
    use davy::intent::{Self, ExecutionIntent};
    use davy::capability::{Self, AdminCap, ExecutorCap};
    use davy::pool::{Self, CoordinationPool};

    // ===== Test Coins =====

    public struct TOKEN_A has drop {}
    public struct USDC has drop {}

    // ===== Addresses =====

    const ADMIN: address = @0xAD;
    const MAKER_1: address = @0xAA1;
    const MAKER_2: address = @0xAA2;
    const TAKER: address = @0xBB;
    const EXECUTOR: address = @0xEE;

    // ===== E2E Flow: Shared Liquidity & Managed Execution =====

    #[test]
    fun test_e2e_managed_execution_flow() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 1000);

        // 1. Setup Protocol Roles
        capability::init_for_testing(scenario.ctx());
        scenario.next_tx(ADMIN);
        let admin_cap = scenario.take_from_sender<AdminCap>();
        capability::mint_executor_cap(&admin_cap, b"ManagedExecutor", EXECUTOR, scenario.ctx());
        scenario.return_to_sender(admin_cap);

        // 2. Setup Coordination Pool for TOKEN_A/USDC
        scenario.next_tx(ADMIN);
        pool::create<TOKEN_A, USDC>(b"Institutional Liquidity", scenario.ctx());

        // 3. Maker 1 creates an offer and adds it to the pool
        scenario.next_tx(MAKER_1);
        let coin1 = coin::mint_for_testing<TOKEN_A>(1000, scenario.ctx());
        offer::create<TOKEN_A, USDC>(
            coin1, 2_000_000_000, 2_000_000_000, 10_000, 1, 100, &clock, scenario.ctx()
        );
        scenario.next_tx(MAKER_1);
        let offer1 = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
        let offer1_id = object::id(&offer1);
        scenario.next_tx(ADMIN); // Only creator (ADMIN here) adds to pool
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            pool::add_offer(&mut pool, offer1_id, scenario.ctx());
            ts::return_shared(pool);
        };
        ts::return_shared(offer1);

        // 4. Taker creates a Price-Bounded Intent
        scenario.next_tx(TAKER);
        let payment = coin::mint_for_testing<USDC>(5000, scenario.ctx());
        intent::create_price_bounded<TOKEN_A, USDC>(
            500, // Taker wants 500
            payment,
            1_000_000_000, // min_price
            3_000_000_000, // max_price (offer is at 2e9)
            10_000,
            &clock,
            scenario.ctx()
        );

        // 5. Executor fulfills Intent using Pool Liquidity
        scenario.next_tx(EXECUTOR);
        {
            let mut intent = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();

            intent::execute_against_offer(
                &mut intent,
                &mut offer,
                &exec_cap,
                &clock,
                scenario.ctx()
            );

            assert!(intent::intent_status(&intent) == intent::status_executed());
            assert!(offer::remaining_amount(&offer) == 500);

            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent);
            ts::return_shared(offer);
        };

        // 6. Verify Balances
        // Taker: 500 TOKEN_A + 4000 USDC refund (paid 1000)
        scenario.next_tx(TAKER);
        {
            let tokens = scenario.take_from_sender<Coin<TOKEN_A>>();
            assert!(coin::value(&tokens) == 500);
            ts::return_to_sender(&scenario, tokens);

            let refund = scenario.take_from_sender<Coin<USDC>>();
            assert!(coin::value(&refund) == 4000);
            ts::return_to_sender(&scenario, refund);
        };

        // Maker 1: 1000 USDC payment
        scenario.next_tx(MAKER_1);
        {
            let pay = scenario.take_from_sender<Coin<USDC>>();
            assert!(coin::value(&pay) == 1000);
            ts::return_to_sender(&scenario, pay);
        };

        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== Multi-Offer Settlement Flow =====

    #[test]
    fun test_sequential_fills_with_pool_updates() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 1000);

        capability::init_for_testing(scenario.ctx());
        scenario.next_tx(ADMIN);
        let admin_cap = scenario.take_from_sender<AdminCap>();
        capability::mint_executor_cap(&admin_cap, b"ManagedExecutor", EXECUTOR, scenario.ctx());
        scenario.return_to_sender(admin_cap);

        // Setup Pool
        scenario.next_tx(ADMIN);
        pool::create<TOKEN_A, USDC>(b"Pool", scenario.ctx());

        // Maker 1 & 2 create offers
        scenario.next_tx(MAKER_1);
        offer::create<TOKEN_A, USDC>(
            coin::mint_for_testing(1000, scenario.ctx()),
            1_000_000_000, 1_000_000_000,
            10_000, 0, 0, &clock, scenario.ctx()
        );
        scenario.next_tx(MAKER_2);
        offer::create<TOKEN_A, USDC>(
            coin::mint_for_testing(1000, scenario.ctx()),
            1_000_000_000, 1_000_000_000,
            10_000, 0, 0, &clock, scenario.ctx()
        );

        scenario.next_tx(ADMIN);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            // We'd take both offer IDs normally, here we just simulate the registry
            pool::add_offer(&mut pool, object::id_from_address(@0x1), scenario.ctx());
            pool::add_offer(&mut pool, object::id_from_address(@0x2), scenario.ctx());
            assert!(pool::size(&pool) == 2);
            ts::return_shared(pool);
        };

        // Execution of first offer completely
        scenario.next_tx(EXECUTOR);
        {
            let mut offer1 = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let ctx = ts::ctx(&mut scenario);
            let payment = coin::mint_for_testing<USDC>(1000, ctx);
            offer::fill_full_and_settle(&mut offer1, payment, &clock, ctx);
            ts::return_shared(offer1);
        };

        // Remove from pool if empty
        scenario.next_tx(ADMIN);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            pool::remove_offer(&mut pool, object::id_from_address(@0x1), scenario.ctx());
            assert!(pool::size(&pool) == 1);
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== Competing Intents: Second intent finds depleted offer =====

    #[test]
    #[expected_failure(abort_code = 106, location = davy::intent)]
    fun test_competing_intents_for_same_offer() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 1000);

        capability::init_for_testing(scenario.ctx());
        scenario.next_tx(ADMIN);
        let admin_cap = scenario.take_from_sender<AdminCap>();
        capability::mint_executor_cap(&admin_cap, b"Executor1", EXECUTOR, scenario.ctx());
        capability::mint_executor_cap(&admin_cap, b"Executor2", @0xFF, scenario.ctx());
        scenario.return_to_sender(admin_cap);

        // Maker creates offer with 500 TOKEN_A (full-only)
        scenario.next_tx(MAKER_1);
        offer::create<TOKEN_A, USDC>(
            coin::mint_for_testing(500, scenario.ctx()),
            2_000_000_000, 2_000_000_000,
            10_000, 0, 0, &clock, scenario.ctx()
        );

        // First taker creates and immediately executes intent
        scenario.next_tx(TAKER);
        intent::create_price_bounded<TOKEN_A, USDC>(
            500, coin::mint_for_testing(2000, scenario.ctx()),
            1_000_000_000, 3_000_000_000, 10_000, &clock, scenario.ctx()
        );

        scenario.next_tx(EXECUTOR);
        {
            let mut intent1 = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();

            intent::execute_against_offer(&mut intent1, &mut offer, &exec_cap, &clock, scenario.ctx());
            assert!(offer::status(&offer) == offer::status_filled());

            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent1);
            ts::return_shared(offer);
        };

        // Second taker creates intent for the now-depleted offer
        scenario.next_tx(@0xCC);
        intent::create_price_bounded<TOKEN_A, USDC>(
            500, coin::mint_for_testing(2000, scenario.ctx()),
            1_000_000_000, 3_000_000_000, 10_000, &clock, scenario.ctx()
        );

        // Second executor tries — should abort with offer_not_fillable (106)
        scenario.next_tx(@0xFF);
        {
            let mut intent2 = scenario.take_shared<ExecutionIntent<TOKEN_A, USDC>>();
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let exec_cap = scenario.take_from_sender<ExecutorCap>();

            intent::execute_against_offer(&mut intent2, &mut offer, &exec_cap, &clock, scenario.ctx());

            scenario.return_to_sender(exec_cap);
            ts::return_shared(intent2);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== Concurrent Partial Fills =====

    #[test]
    fun test_concurrent_partial_fills() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 1000);

        // Create partial-allowed offer: 1000 TOKEN_A, price 1e9, min_fill 100
        scenario.next_tx(MAKER_1);
        offer::create<TOKEN_A, USDC>(
            coin::mint_for_testing(1000, scenario.ctx()),
            1_000_000_000, 1_000_000_000,
            10_000, 1, 100, &clock, scenario.ctx()
        );

        // Taker 1: partial fill 300
        scenario.next_tx(TAKER);
        {
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let payment = coin::mint_for_testing<USDC>(300, scenario.ctx());
            offer::fill_partial_and_settle(&mut offer, 300, payment, &clock, scenario.ctx());
            assert!(offer::remaining_amount(&offer) == 700);
            assert!(offer::fill_count(&offer) == 1);
            ts::return_shared(offer);
        };

        // Taker 2: partial fill 300
        scenario.next_tx(@0xCC);
        {
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let payment = coin::mint_for_testing<USDC>(300, scenario.ctx());
            offer::fill_partial_and_settle(&mut offer, 300, payment, &clock, scenario.ctx());
            assert!(offer::remaining_amount(&offer) == 400);
            assert!(offer::fill_count(&offer) == 2);
            ts::return_shared(offer);
        };

        // Taker 3: partial fill 400 (final)
        scenario.next_tx(@0xDD);
        {
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let payment = coin::mint_for_testing<USDC>(400, scenario.ctx());
            offer::fill_partial_and_settle(&mut offer, 400, payment, &clock, scenario.ctx());
            assert!(offer::remaining_amount(&offer) == 0);
            assert!(offer::status(&offer) == offer::status_filled());
            assert!(offer::total_filled(&offer) == 1000);
            assert!(offer::fill_count(&offer) == 3);
            ts::return_shared(offer);
        };

        // Verify balances
        scenario.next_tx(TAKER);
        {
            let tokens = scenario.take_from_sender<Coin<TOKEN_A>>();
            assert!(coin::value(&tokens) == 300);
            ts::return_to_sender(&scenario, tokens);
        };
        scenario.next_tx(@0xCC);
        {
            let tokens = scenario.take_from_sender<Coin<TOKEN_A>>();
            assert!(coin::value(&tokens) == 300);
            ts::return_to_sender(&scenario, tokens);
        };
        scenario.next_tx(@0xDD);
        {
            let tokens = scenario.take_from_sender<Coin<TOKEN_A>>();
            assert!(coin::value(&tokens) == 400);
            ts::return_to_sender(&scenario, tokens);
        };

        // Maker received all payments
        scenario.next_tx(MAKER_1);
        {
            let usdc1 = scenario.take_from_sender<Coin<USDC>>();
            let usdc2 = scenario.take_from_sender<Coin<USDC>>();
            let usdc3 = scenario.take_from_sender<Coin<USDC>>();
            assert!(coin::value(&usdc1) + coin::value(&usdc2) + coin::value(&usdc3) == 1000);
            ts::return_to_sender(&scenario, usdc1);
            ts::return_to_sender(&scenario, usdc2);
            ts::return_to_sender(&scenario, usdc3);
        };

        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== Fill at Exact Expiry Boundary =====

    #[test]
    #[expected_failure(abort_code = 105, location = davy::offer)]
    fun test_fill_at_exact_expiry_boundary() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 1000);

        // Create offer with expiry at 5000
        scenario.next_tx(MAKER_1);
        offer::create<TOKEN_A, USDC>(
            coin::mint_for_testing(1000, scenario.ctx()),
            1_000_000_000, 1_000_000_000,
            5000, 0, 0, &clock, scenario.ctx()
        );

        // Set clock to exact expiry
        clock::set_for_testing(&mut clock, 5000);

        // Attempt fill — should abort with offer_expired (105)
        scenario.next_tx(TAKER);
        {
            let mut offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            let payment = coin::mint_for_testing<USDC>(1000, scenario.ctx());
            offer::fill_full_and_settle(&mut offer, payment, &clock, scenario.ctx());
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ===== Pool Stale After Expiry =====

    #[test]
    fun test_pool_stale_after_expiry() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, 1000);

        // Create pool
        scenario.next_tx(ADMIN);
        pool::create<TOKEN_A, USDC>(b"StaleTest", scenario.ctx());

        // Create offer with short expiry
        scenario.next_tx(MAKER_1);
        offer::create<TOKEN_A, USDC>(
            coin::mint_for_testing(1000, scenario.ctx()),
            1_000_000_000, 1_000_000_000,
            3000, 0, 0, &clock, scenario.ctx()
        );

        // Add offer to pool
        scenario.next_tx(MAKER_1);
        let offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
        let offer_id = object::id(&offer);
        ts::return_shared(offer);

        scenario.next_tx(ADMIN);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            pool::add_offer(&mut pool, offer_id, scenario.ctx());
            ts::return_shared(pool);
        };

        // Advance past expiry
        clock::set_for_testing(&mut clock, 4000);

        // Pool still contains the offer ID (non-authoritative — stale is expected)
        scenario.next_tx(ADMIN);
        {
            let pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            assert!(pool::contains(&pool, &offer_id) == true);
            assert!(pool::size(&pool) == 1);
            ts::return_shared(pool);
        };

        // But the offer itself is no longer fillable
        scenario.next_tx(TAKER);
        {
            let offer = scenario.take_shared<LiquidityOffer<TOKEN_A, USDC>>();
            assert!(offer::is_fillable(&offer, &clock) == false);
            ts::return_shared(offer);
        };

        clock::destroy_for_testing(clock);
        scenario.end();
    }
}
