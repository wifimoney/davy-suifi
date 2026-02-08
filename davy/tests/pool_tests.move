/// Davy Protocol — Coordination Pool Tests
/// Covers: create, add_offer, remove_offer, view functions, and validation.
#[test_only]
module davy::pool_tests {
    use sui::test_scenario::{Self as ts};
    use davy::pool::{Self, CoordinationPool};

    // ===== Constants =====

    const CREATOR: address = @0xCC;
    const OTHER: address = @0xDD;

    // ===== Test Coins =====

    public struct TOKEN_A has drop {}
    public struct USDC has drop {}

    // ===== 1. Create Pool — Happy Path =====

    #[test]
    fun test_create_pool() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"Main Pool", scenario.ctx());
        };
        scenario.next_tx(CREATOR);
        {
            let p = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            assert!(pool::creator(&p) == CREATOR);
            assert!(pool::size(&p) == 0);
            assert!(pool::name(&p) == b"Main Pool");
            ts::return_shared(p);
        };
        scenario.end();
    }

    // ===== 2. Empty name aborts (400) =====

    #[test]
    #[expected_failure(abort_code = 400)]
    fun test_empty_pool_name_aborts() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"", scenario.ctx());
        };
        scenario.end();
    }

    // ===== 3. Add offer to pool — Happy Path =====

    #[test]
    fun test_add_offer_to_pool() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"Pool", scenario.ctx());
        };
        scenario.next_tx(CREATOR);
        {
            let mut p = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            // Use a fake ID for testing the container
            let fake_id = object::id_from_address(@0x1);
            pool::add_offer(&mut p, fake_id, scenario.ctx());

            assert!(pool::size(&p) == 1);
            assert!(pool::contains(&p, &fake_id));

            ts::return_shared(p);
        };
        scenario.end();
    }

    // ===== 4. Add by non-creator aborts (402) =====

    #[test]
    #[expected_failure(abort_code = 402, location = davy::pool)]
    fun test_add_offer_not_creator_aborts() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"Pool", scenario.ctx());
        };
        scenario.next_tx(OTHER);
        {
            let mut p = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);
            pool::add_offer(&mut p, fake_id, scenario.ctx());
            ts::return_shared(p);
        };
        scenario.end();
    }

    // ===== 5. Add duplicate offer aborts (401) =====

    #[test]
    #[expected_failure(abort_code = 401, location = davy::pool)]
    fun test_add_duplicate_offer_aborts() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"Pool", scenario.ctx());
        };
        scenario.next_tx(CREATOR);
        {
            let mut p = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);
            pool::add_offer(&mut p, fake_id, scenario.ctx());
            pool::add_offer(&mut p, fake_id, scenario.ctx()); // duplicate → abort 401
            ts::return_shared(p);
        };
        scenario.end();
    }

    // ===== 6. Remove offer — Happy Path =====

    #[test]
    fun test_remove_offer_from_pool() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"Pool", scenario.ctx());
        };
        scenario.next_tx(CREATOR);
        {
            let mut p = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);
            pool::add_offer(&mut p, fake_id, scenario.ctx());
            assert!(pool::size(&p) == 1);

            pool::remove_offer(&mut p, fake_id, scenario.ctx());
            assert!(pool::size(&p) == 0);
            assert!(!pool::contains(&p, &fake_id));

            ts::return_shared(p);
        };
        scenario.end();
    }

    // ===== 7. Remove non-existent offer aborts (403) =====

    #[test]
    #[expected_failure(abort_code = 403, location = davy::pool)]
    fun test_remove_missing_offer_aborts() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"Pool", scenario.ctx());
        };
        scenario.next_tx(CREATOR);
        {
            let mut p = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);
            pool::remove_offer(&mut p, fake_id, scenario.ctx()); // missing → abort 403
            ts::return_shared(p);
        };
        scenario.end();
    }

    // ===== 8. Remove by non-creator aborts (402) =====

    #[test]
    #[expected_failure(abort_code = 402, location = davy::pool)]
    fun test_remove_not_creator_aborts() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"Pool", scenario.ctx());
        };
        scenario.next_tx(CREATOR);
        {
            let mut p = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);
            pool::add_offer(&mut p, fake_id, scenario.ctx());
            ts::return_shared(p);
        };
        scenario.next_tx(OTHER);
        {
            let mut p = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            let fake_id = object::id_from_address(@0x1);
            pool::remove_offer(&mut p, fake_id, scenario.ctx());
            ts::return_shared(p);
        };
        scenario.end();
    }

    // ===== 9. Multiple offers added sequentially =====

    #[test]
    fun test_multiple_offers() {
        let mut scenario = ts::begin(CREATOR);
        {
            pool::create<TOKEN_A, USDC>(b"Broad Pool", scenario.ctx());
        };
        scenario.next_tx(CREATOR);
        {
            let mut p = scenario.take_shared<CoordinationPool<TOKEN_A, USDC>>();
            pool::add_offer(&mut p, object::id_from_address(@0x1), scenario.ctx());
            pool::add_offer(&mut p, object::id_from_address(@0x2), scenario.ctx());
            pool::add_offer(&mut p, object::id_from_address(@0x3), scenario.ctx());

            assert!(pool::size(&p) == 3);
            assert!(pool::contains(&p, &object::id_from_address(@0x2)));

            ts::return_shared(p);
        };
        scenario.end();
    }
}
