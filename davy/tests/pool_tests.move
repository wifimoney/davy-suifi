/// Davy Protocol — Pool Tests
/// Covers: creation, add/remove, view functions, error paths.
#[test_only]
module davy::pool_tests {
    use sui::test_scenario::{Self as ts};
    use sui::coin;
    use sui::clock;

    use davy::offer;
    use davy::pool::{Self, CoordinationPool};
    use davy::errors;

    // ===== Test Coins =====

    public struct USDC has drop {}
    public struct TOKEN_A has drop {}

    // ===== Addresses =====

    const CREATOR: address = @0xCC;
    const MAKER: address = @0xAA;
    const NOBODY: address = @0x99;

    // ===== 1. Create pool — happy path =====

    #[test]
    fun test_create_pool() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(
                b"TOKEN_A/USDC Pool",
                scenario.ctx(),
            );
        };
        scenario.next_tx(CREATOR);
        {
            let pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            assert!(pool::size(&pool) == 0);
            assert!(pool::creator(&pool) == CREATOR);
            assert!(pool::name(&pool) == b"TOKEN_A/USDC Pool");
            ts::return_shared(pool);
        };
        scenario.end();
    }

    // ===== 2. Add offer to pool =====

    #[test]
    fun test_add_offer() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"test-pool", scenario.ctx());
        };

        // Create an offer to get its ID
        scenario.next_tx(MAKER);
        {
            let mut clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut clock, 1000);
            let coin = coin::mint_for_testing<TOKEN_A>(1000, scenario.ctx());
            offer::create<TOKEN_A, USDC>(
                coin,
                2_000_000_000, 2_000_000_000,
                10_000, 1, 100,
                &clock, scenario.ctx(),
            );
            clock::destroy_for_testing(clock);
        };

        // Add offer to pool
        scenario.next_tx(CREATOR);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let offer = scenario.take_shared<offer::LiquidityOffer<TOKEN_A, USDC>>();
            let offer_id = offer::offer_id(&offer);

            pool::add_offer(&mut pool, offer_id, scenario.ctx());

            assert!(pool::size(&pool) == 1);
            assert!(pool::contains(&pool, &offer_id));

            ts::return_shared(offer);
            ts::return_shared(pool);
        };
        scenario.end();
    }

    // ===== 3. Remove offer from pool =====

    #[test]
    fun test_remove_offer() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"test-pool", scenario.ctx());
        };

        scenario.next_tx(MAKER);
        {
            let mut clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut clock, 1000);
            let coin = coin::mint_for_testing<TOKEN_A>(1000, scenario.ctx());
            offer::create<TOKEN_A, USDC>(
                coin,
                2_000_000_000, 2_000_000_000,
                10_000, 1, 100,
                &clock, scenario.ctx(),
            );
            clock::destroy_for_testing(clock);
        };

        // Add then remove
        scenario.next_tx(CREATOR);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let offer = scenario.take_shared<offer::LiquidityOffer<TOKEN_A, USDC>>();
            let offer_id = offer::offer_id(&offer);

            pool::add_offer(&mut pool, offer_id, scenario.ctx());
            assert!(pool::size(&pool) == 1);

            pool::remove_offer(&mut pool, offer_id, scenario.ctx());
            assert!(pool::size(&pool) == 0);
            assert!(!pool::contains(&pool, &offer_id));

            ts::return_shared(offer);
            ts::return_shared(pool);
        };
        scenario.end();
    }

    // ===== 4. Multiple offers in pool =====

    #[test]
    fun test_multiple_offers() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"multi-pool", scenario.ctx());
        };

        // Create two offers
        scenario.next_tx(MAKER);
        {
            let mut clock = clock::create_for_testing(scenario.ctx());
            clock::set_for_testing(&mut clock, 1000);
            let coin1 = coin::mint_for_testing<TOKEN_A>(1000, scenario.ctx());
            offer::create<TOKEN_A, USDC>(
                coin1,
                2_000_000_000, 2_000_000_000,
                10_000, 1, 100,
                &clock, scenario.ctx(),
            );
            let coin2 = coin::mint_for_testing<TOKEN_A>(500, scenario.ctx());
            offer::create<TOKEN_A, USDC>(
                coin2,
                1_000_000_000, 3_000_000_000,
                10_000, 1, 50,
                &clock, scenario.ctx(),
            );
            clock::destroy_for_testing(clock);
        };

        // Add both offers via their IDs
        scenario.next_tx(CREATOR);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();

            let fake_id_1 = object::id_from_address(@0x1);
            let fake_id_2 = object::id_from_address(@0x2);

            pool::add_offer(&mut pool, fake_id_1, scenario.ctx());
            pool::add_offer(&mut pool, fake_id_2, scenario.ctx());

            assert!(pool::size(&pool) == 2);
            assert!(pool::contains(&pool, &fake_id_1));
            assert!(pool::contains(&pool, &fake_id_2));

            // Remove one
            pool::remove_offer(&mut pool, fake_id_1, scenario.ctx());
            assert!(pool::size(&pool) == 1);
            assert!(!pool::contains(&pool, &fake_id_1));
            assert!(pool::contains(&pool, &fake_id_2));

            ts::return_shared(pool);
        };
        scenario.end();
    }

    // ===== 5. Empty pool name aborts (400) =====

    #[test]
    #[expected_failure(abort_code = errors::EEMPTY_POOL_NAME, location = davy::pool)]
    fun test_create_empty_name_aborts() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(
                b"",  // empty name → abort 400
                scenario.ctx(),
            );
        };
        scenario.end();
    }

    // ===== 6. Add duplicate offer aborts (401) =====

    #[test]
    #[expected_failure(abort_code = errors::EOFFER_ALREADY_IN_POOL, location = davy::pool)]
    fun test_add_duplicate_aborts() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"dup-test", scenario.ctx());
        };
        scenario.next_tx(CREATOR);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);

            pool::add_offer(&mut pool, fake_id, scenario.ctx());
            pool::add_offer(&mut pool, fake_id, scenario.ctx()); // duplicate → abort 401

            ts::return_shared(pool);
        };
        scenario.end();
    }

    // ===== 7. Remove non-existent offer aborts (402) =====

    #[test]
    #[expected_failure(abort_code = errors::EOFFER_NOT_IN_POOL, location = davy::pool)]
    fun test_remove_nonexistent_aborts() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"missing-test", scenario.ctx());
        };
        scenario.next_tx(CREATOR);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);

            pool::remove_offer(&mut pool, fake_id, scenario.ctx()); // not in pool → abort 402

            ts::return_shared(pool);
        };
        scenario.end();
    }

    // ===== 8. Non-creator add aborts (206) =====

    #[test]
    #[expected_failure(abort_code = errors::ENOT_CREATOR, location = davy::pool)]
    fun test_add_not_creator_aborts() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"auth-test", scenario.ctx());
        };
        scenario.next_tx(NOBODY);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);

            pool::add_offer(&mut pool, fake_id, scenario.ctx()); // not creator → abort 206

            ts::return_shared(pool);
        };
        scenario.end();
    }

    // ===== 9. Non-creator remove aborts (206) =====

    #[test]
    #[expected_failure(abort_code = errors::ENOT_CREATOR, location = davy::pool)]
    fun test_remove_not_creator_aborts() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"auth-test", scenario.ctx());
        };

        // Creator adds an offer first
        scenario.next_tx(CREATOR);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);
            pool::add_offer(&mut pool, fake_id, scenario.ctx());
            ts::return_shared(pool);
        };

        // Non-creator tries to remove
        scenario.next_tx(NOBODY);
        {
            let mut pool = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);
            pool::remove_offer(&mut pool, fake_id, scenario.ctx()); // not creator → abort 206
            ts::return_shared(pool);
        };
        scenario.end();
    }
}
