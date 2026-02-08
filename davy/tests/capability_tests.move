/// Davy Protocol — Capability Tests
#[test_only]
module davy::capability_tests {
    use sui::test_scenario::{Self as ts};
    use davy::capability::{Self, AdminCap, ExecutorCap, PartialFillCap};
    use davy::errors;

    // ===== Constants =====

    const ADMIN: address = @0xAD;
    const EXECUTOR_1: address = @0xE1;
    const EXECUTOR_2: address = @0xE2;
    const NEW_ADMIN: address = @0xA0;

    // ===== Tests =====

    #[test]
    fun test_admin_cap_created_on_init() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            scenario.return_to_sender(admin_cap);
        };
        scenario.end();
    }

    #[test]
    fun test_mint_executor_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"market_maker_1",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            assert!(*capability::executor_cap_label(&exec_cap) == b"market_maker_1");
            assert!(capability::executor_cap_minted_by(&exec_cap) == ADMIN);
            scenario.return_to_sender(exec_cap);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = errors::EEMPTY_LABEL, location = davy::capability)]
    fun test_mint_executor_cap_empty_label_aborts() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.end();
    }

    #[test]
    fun test_destroy_executor_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"temp_executor",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            capability::destroy_executor_cap(exec_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            assert!(!ts::has_most_recent_for_sender<ExecutorCap>(&scenario));
        };
        scenario.end();
    }

    #[test]
    fun test_transfer_executor_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"transferable",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            capability::transfer_executor_cap(exec_cap, EXECUTOR_2);
        };
        scenario.next_tx(EXECUTOR_2);
        {
            let exec_cap = scenario.take_from_sender<ExecutorCap>();
            assert!(*capability::executor_cap_label(&exec_cap) == b"transferable");
            scenario.return_to_sender(exec_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            assert!(!ts::has_most_recent_for_sender<ExecutorCap>(&scenario));
        };
        scenario.end();
    }

    #[test]
    fun test_transfer_admin_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::transfer_admin_cap(admin_cap, NEW_ADMIN);
        };
        scenario.next_tx(NEW_ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"new_admin_mint",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(ADMIN);
        {
            assert!(!ts::has_most_recent_for_sender<AdminCap>(&scenario));
        };
        scenario.end();
    }

    #[test]
    fun test_mint_partial_fill_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_partial_fill_cap(
                &admin_cap,
                b"partial_filler_1",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let pf_cap = scenario.take_from_sender<PartialFillCap>();
            assert!(*capability::partial_fill_cap_label(&pf_cap) == b"partial_filler_1");
            assert!(capability::partial_fill_cap_minted_by(&pf_cap) == ADMIN);
            scenario.return_to_sender(pf_cap);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = errors::EEMPTY_LABEL, location = davy::capability)]
    fun test_mint_partial_fill_cap_empty_label_aborts() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_partial_fill_cap(
                &admin_cap,
                b"",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.end();
    }

    #[test]
    fun test_destroy_partial_fill_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_partial_fill_cap(
                &admin_cap,
                b"temp_partial",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let pf_cap = scenario.take_from_sender<PartialFillCap>();
            capability::destroy_partial_fill_cap(pf_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            assert!(!ts::has_most_recent_for_sender<PartialFillCap>(&scenario));
        };
        scenario.end();
    }

    #[test]
    fun test_mint_multiple_executor_caps() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_executor_cap(
                &admin_cap,
                b"executor_alpha",
                EXECUTOR_1,
                scenario.ctx(),
            );
            capability::mint_executor_cap(
                &admin_cap,
                b"executor_beta",
                EXECUTOR_2,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let cap = scenario.take_from_sender<ExecutorCap>();
            assert!(*capability::executor_cap_label(&cap) == b"executor_alpha");
            scenario.return_to_sender(cap);
        };
        scenario.next_tx(EXECUTOR_2);
        {
            let cap = scenario.take_from_sender<ExecutorCap>();
            assert!(*capability::executor_cap_label(&cap) == b"executor_beta");
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    fun test_transfer_partial_fill_cap() {
        let mut scenario = ts::begin(ADMIN);
        {
            capability::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(ADMIN);
        {
            let admin_cap = scenario.take_from_sender<AdminCap>();
            capability::mint_partial_fill_cap(
                &admin_cap,
                b"transferable_pf",
                EXECUTOR_1,
                scenario.ctx(),
            );
            scenario.return_to_sender(admin_cap);
        };
        scenario.next_tx(EXECUTOR_1);
        {
            let pf_cap = scenario.take_from_sender<PartialFillCap>();
            capability::transfer_partial_fill_cap(pf_cap, EXECUTOR_2);
        };
        scenario.next_tx(EXECUTOR_2);
        {
            let pf_cap = scenario.take_from_sender<PartialFillCap>();
            assert!(*capability::partial_fill_cap_label(&pf_cap) == b"transferable_pf");
            scenario.return_to_sender(pf_cap);
        };
        scenario.end();
    }
}
