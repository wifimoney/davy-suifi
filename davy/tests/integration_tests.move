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
}
