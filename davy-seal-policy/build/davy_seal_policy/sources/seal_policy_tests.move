#[test_only]
module davy_seal_policy::seal_policy_tests {
    use sui::test_scenario::{Self as ts};
    use sui::bcs;
    use davy::capability::{Self, AdminCap, ExecutorCap};
    use davy_seal_policy::seal_policy::{Self, PrivateOfferAllowlist};

    // ===== Addresses =====

    const ADMIN: address = @0xAD;
    const EXECUTOR: address = @0xE1;
    const MAKER: address = @0xDA;
    const TAKER_1: address = @0x11;
    const TAKER_2: address = @0x22;
    const OUTSIDER: address = @0xBAD;

    // ===== Helpers =====

    fun setup_executor_cap(scenario: &mut ts::Scenario) {
        // Init Davy capabilities → AdminCap to ADMIN
        ts::next_tx(scenario, ADMIN);
        capability::init_for_testing(ts::ctx(scenario));

        // Mint ExecutorCap → EXECUTOR
        ts::next_tx(scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(scenario);
            capability::mint_executor_cap(
                &admin_cap,
                b"test_bot",
                EXECUTOR,
                ts::ctx(scenario),
            );
            ts::return_to_sender(scenario, admin_cap);
        };
    }

    fun id_bytes(addr: address): vector<u8> {
        bcs::to_bytes(&addr)
    }

    // =========================================================
    // seal_approve — ExecutorCap policy
    // =========================================================

    #[test]
    /// Happy path: valid cap + valid 32-byte identity → passes.
    fun test_approve_executor_happy_path() {
        let mut scenario = ts::begin(EXECUTOR);
        setup_executor_cap(&mut scenario);

        ts::next_tx(&mut scenario, EXECUTOR);
        {
            let cap = ts::take_from_sender<ExecutorCap>(&scenario);
            let intent_id = @0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
            seal_policy::seal_approve_for_testing(id_bytes(intent_id), &cap);
            ts::return_to_sender(&scenario, cap);
        };

        ts::end(scenario);
    }

    #[test]
    /// Zero address and max address both work (format is valid).
    fun test_approve_executor_edge_addresses() {
        let mut scenario = ts::begin(EXECUTOR);
        setup_executor_cap(&mut scenario);

        ts::next_tx(&mut scenario, EXECUTOR);
        {
            let cap = ts::take_from_sender<ExecutorCap>(&scenario);
            seal_policy::seal_approve_for_testing(id_bytes(@0x0), &cap);
            seal_policy::seal_approve_for_testing(
                id_bytes(@0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff),
                &cap,
            );
            ts::return_to_sender(&scenario, cap);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = davy_seal_policy::seal_policy::EInvalidIdentity)]
    /// 32 valid bytes + trailing garbage → aborts EInvalidIdentity.
    fun test_approve_executor_trailing_bytes() {
        let mut scenario = ts::begin(EXECUTOR);
        setup_executor_cap(&mut scenario);

        ts::next_tx(&mut scenario, EXECUTOR);
        {
            let cap = ts::take_from_sender<ExecutorCap>(&scenario);
            let mut bytes = id_bytes(@0xABCD);
            vector::push_back(&mut bytes, 0xFF); // garbage
            seal_policy::seal_approve_for_testing(bytes, &cap);
            ts::return_to_sender(&scenario, cap);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure] // BCS peel_address fails — not enough bytes
    /// Too few bytes → BCS deserialization aborts.
    fun test_approve_executor_short_bytes() {
        let mut scenario = ts::begin(EXECUTOR);
        setup_executor_cap(&mut scenario);

        ts::next_tx(&mut scenario, EXECUTOR);
        {
            let cap = ts::take_from_sender<ExecutorCap>(&scenario);
            seal_policy::seal_approve_for_testing(vector[0x01, 0x02, 0x03], &cap);
            ts::return_to_sender(&scenario, cap);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure] // BCS peel_address fails — zero bytes
    /// Empty identity → BCS deserialization aborts.
    fun test_approve_executor_empty_bytes() {
        let mut scenario = ts::begin(EXECUTOR);
        setup_executor_cap(&mut scenario);

        ts::next_tx(&mut scenario, EXECUTOR);
        {
            let cap = ts::take_from_sender<ExecutorCap>(&scenario);
            seal_policy::seal_approve_for_testing(vector::empty<u8>(), &cap);
            ts::return_to_sender(&scenario, cap);
        };

        ts::end(scenario);
    }

    // =========================================================
    // seal_approve_allowlist — Address policy
    // =========================================================

    #[test]
    /// Happy path: sender on allowlist → passes.
    fun test_allowlist_happy_path() {
        let mut scenario = ts::begin(MAKER);

        ts::next_tx(&mut scenario, MAKER);
        seal_policy::create_and_share_allowlist(
            @0xFE,
            vector[TAKER_1, TAKER_2],
            ts::ctx(&mut scenario),
        );

        // TAKER_1 decrypts
        ts::next_tx(&mut scenario, TAKER_1);
        {
            let al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            seal_policy::seal_approve_allowlist_for_testing(
                id_bytes(@0xFE), &al, ts::ctx(&mut scenario),
            );
            ts::return_shared(al);
        };

        // TAKER_2 decrypts
        ts::next_tx(&mut scenario, TAKER_2);
        {
            let al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            seal_policy::seal_approve_allowlist_for_testing(
                id_bytes(@0xFE), &al, ts::ctx(&mut scenario),
            );
            ts::return_shared(al);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = davy_seal_policy::seal_policy::ENotOnAllowlist)]
    /// Outsider NOT on allowlist → aborts.
    fun test_allowlist_unauthorized() {
        let mut scenario = ts::begin(MAKER);

        ts::next_tx(&mut scenario, MAKER);
        seal_policy::create_and_share_allowlist(
            @0xFE, vector[TAKER_1], ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, OUTSIDER);
        {
            let al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            seal_policy::seal_approve_allowlist_for_testing(
                id_bytes(@0xFE), &al, ts::ctx(&mut scenario),
            );
            ts::return_shared(al);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = davy_seal_policy::seal_policy::EInvalidIdentity)]
    /// Wrong offer_id in identity → aborts (allowlist is for a different offer).
    fun test_allowlist_wrong_offer_id() {
        let mut scenario = ts::begin(MAKER);

        ts::next_tx(&mut scenario, MAKER);
        seal_policy::create_and_share_allowlist(
            @0xFE, vector[TAKER_1], ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, TAKER_1);
        {
            let al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            // Pass wrong offer_id
            seal_policy::seal_approve_allowlist_for_testing(
                id_bytes(@0xEAD), &al, ts::ctx(&mut scenario),
            );
            ts::return_shared(al);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = davy_seal_policy::seal_policy::EInvalidIdentity)]
    /// Trailing bytes in allowlist identity → aborts.
    fun test_allowlist_trailing_bytes() {
        let mut scenario = ts::begin(MAKER);

        ts::next_tx(&mut scenario, MAKER);
        seal_policy::create_and_share_allowlist(
            @0xFE, vector[TAKER_1], ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, TAKER_1);
        {
            let al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            let mut bytes = id_bytes(@0xFE);
            vector::push_back(&mut bytes, 0x99);
            seal_policy::seal_approve_allowlist_for_testing(
                bytes, &al, ts::ctx(&mut scenario),
            );
            ts::return_shared(al);
        };

        ts::end(scenario);
    }

    // =========================================================
    // Allowlist management
    // =========================================================

    #[test]
    /// Add then check membership.
    fun test_allowlist_add_member() {
        let mut scenario = ts::begin(MAKER);

        ts::next_tx(&mut scenario, MAKER);
        seal_policy::create_and_share_allowlist(
            @0xFE, vector[TAKER_1], ts::ctx(&mut scenario),
        );

        // Add TAKER_2
        ts::next_tx(&mut scenario, MAKER);
        {
            let mut al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            assert!(!seal_policy::is_allowed(&al, TAKER_2), 0);
            seal_policy::add_to_allowlist(&mut al, TAKER_2, ts::ctx(&mut scenario));
            assert!(seal_policy::is_allowed(&al, TAKER_2), 1);
            ts::return_shared(al);
        };

        // TAKER_2 can now decrypt
        ts::next_tx(&mut scenario, TAKER_2);
        {
            let al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            seal_policy::seal_approve_allowlist_for_testing(
                id_bytes(@0xFE), &al, ts::ctx(&mut scenario),
            );
            ts::return_shared(al);
        };

        ts::end(scenario);
    }

    #[test]
    /// Remove then verify access denied.
    fun test_allowlist_remove_member() {
        let mut scenario = ts::begin(MAKER);

        ts::next_tx(&mut scenario, MAKER);
        seal_policy::create_and_share_allowlist(
            @0xFE, vector[TAKER_1, TAKER_2], ts::ctx(&mut scenario),
        );

        // Remove TAKER_1
        ts::next_tx(&mut scenario, MAKER);
        {
            let mut al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            assert!(seal_policy::is_allowed(&al, TAKER_1), 0);
            seal_policy::remove_from_allowlist(&mut al, TAKER_1, ts::ctx(&mut scenario));
            assert!(!seal_policy::is_allowed(&al, TAKER_1), 1);
            // TAKER_2 still allowed
            assert!(seal_policy::is_allowed(&al, TAKER_2), 2);
            ts::return_shared(al);
        };

        ts::end(scenario);
    }

    #[test]
    /// Duplicate add is a no-op (no double entries).
    fun test_allowlist_add_duplicate() {
        let mut scenario = ts::begin(MAKER);

        ts::next_tx(&mut scenario, MAKER);
        seal_policy::create_and_share_allowlist(
            @0xFE, vector[TAKER_1], ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, MAKER);
        {
            let mut al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            seal_policy::add_to_allowlist(&mut al, TAKER_1, ts::ctx(&mut scenario));
            // Still only 1 entry
            assert!(vector::length(seal_policy::allowlist_addresses(&al)) == 1, 0);
            ts::return_shared(al);
        };

        ts::end(scenario);
    }

    #[test]
    /// Remove non-existent address is a silent no-op.
    fun test_allowlist_remove_nonexistent() {
        let mut scenario = ts::begin(MAKER);

        ts::next_tx(&mut scenario, MAKER);
        seal_policy::create_and_share_allowlist(
            @0xFE, vector[TAKER_1], ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, MAKER);
        {
            let mut al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            seal_policy::remove_from_allowlist(&mut al, OUTSIDER, ts::ctx(&mut scenario));
            assert!(vector::length(seal_policy::allowlist_addresses(&al)) == 1, 0);
            ts::return_shared(al);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = davy_seal_policy::seal_policy::ENotOnAllowlist)]
    /// Non-maker can't add to allowlist.
    fun test_allowlist_add_not_maker() {
        let mut scenario = ts::begin(MAKER);

        ts::next_tx(&mut scenario, MAKER);
        seal_policy::create_and_share_allowlist(
            @0xFE, vector[TAKER_1], ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, OUTSIDER);
        {
            let mut al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            seal_policy::add_to_allowlist(&mut al, OUTSIDER, ts::ctx(&mut scenario));
            ts::return_shared(al);
        };

        ts::end(scenario);
    }

    // =========================================================
    // View functions
    // =========================================================

    #[test]
    fun test_view_functions() {
        let mut scenario = ts::begin(MAKER);

        ts::next_tx(&mut scenario, MAKER);
        seal_policy::create_and_share_allowlist(
            @0xFE, vector[TAKER_1, TAKER_2], ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, MAKER);
        {
            let al = ts::take_shared<PrivateOfferAllowlist>(&scenario);
            assert!(seal_policy::allowlist_offer_id(&al) == @0xFE, 0);
            assert!(seal_policy::allowlist_maker(&al) == MAKER, 1);
            assert!(vector::length(seal_policy::allowlist_addresses(&al)) == 2, 2);
            assert!(seal_policy::is_allowed(&al, TAKER_1), 3);
            assert!(seal_policy::is_allowed(&al, TAKER_2), 4);
            assert!(!seal_policy::is_allowed(&al, OUTSIDER), 5);
            ts::return_shared(al);
        };

        ts::end(scenario);
    }
}
