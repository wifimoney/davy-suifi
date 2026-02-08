/// Davy Protocol — Error Layer
/// Centralized error codes with both constants (for tests) and functions (for logic).
module davy::errors {
    // ===== Offer Errors (100-199) =====

    const EZERO_AMOUNT: u64 = 100;
    public fun zero_amount(): u64 { EZERO_AMOUNT }

    const EZERO_MIN_PRICE: u64 = 101;
    public fun zero_min_price(): u64 { EZERO_MIN_PRICE }

    const EZERO_MAX_PRICE: u64 = 102;
    public fun zero_max_price(): u64 { EZERO_MAX_PRICE }

    const EINVALID_PRICE_BOUNDS: u64 = 103;
    public fun invalid_price_bounds(): u64 { EINVALID_PRICE_BOUNDS }

    const EINVALID_FILL_POLICY: u64 = 104;
    public fun invalid_fill_policy(): u64 { EINVALID_FILL_POLICY }

    const EOFFER_EXPIRED: u64 = 105;
    public fun offer_expired(): u64 { EOFFER_EXPIRED }

    const EOFFER_NOT_FILLABLE: u64 = 106;
    public fun offer_not_fillable(): u64 { EOFFER_NOT_FILLABLE }

    const EPRICE_TOO_LOW: u64 = 107;
    public fun price_too_low(): u64 { EPRICE_TOO_LOW }

    const EPRICE_TOO_HIGH: u64 = 108;
    public fun price_too_high(): u64 { EPRICE_TOO_HIGH }

    const EEXPIRED_ON_CREATE: u64 = 109;
    public fun expired_on_create(): u64 { EEXPIRED_ON_CREATE }

    const EPARTIAL_FILL_NOT_ALLOWED: u64 = 110;
    public fun partial_fill_not_allowed(): u64 { EPARTIAL_FILL_NOT_ALLOWED }

    const EFILL_BELOW_MINIMUM: u64 = 111;
    public fun fill_below_minimum(): u64 { EFILL_BELOW_MINIMUM }

    const EFILL_EXCEEDS_REMAINING: u64 = 112;
    public fun fill_exceeds_remaining(): u64 { EFILL_EXCEEDS_REMAINING }

    const EWOULD_LEAVE_DUST: u64 = 113;
    public fun would_leave_dust(): u64 { EWOULD_LEAVE_DUST }

    const ENOT_MAKER: u64 = 114;
    public fun not_maker(): u64 { ENOT_MAKER }

    const EINVALID_STATUS_FOR_WITHDRAW: u64 = 115;
    public fun invalid_status_for_withdraw(): u64 { EINVALID_STATUS_FOR_WITHDRAW }

    const ENOT_YET_EXPIRED: u64 = 116;
    public fun not_yet_expired(): u64 { ENOT_YET_EXPIRED }

    const EINVALID_STATUS_FOR_EXPIRE: u64 = 117;
    public fun invalid_status_for_expire(): u64 { EINVALID_STATUS_FOR_EXPIRE }

    const EMIN_FILL_EXCEEDS_AMOUNT: u64 = 118;
    public fun min_fill_exceeds_amount(): u64 { EMIN_FILL_EXCEEDS_AMOUNT }

    // ===== Authorization Errors (200-299) =====
    
    /// Global authorization failure (previously 402, now 206 for pool tests)
    const ENOT_CREATOR: u64 = 206;
    public fun not_creator(): u64 { ENOT_CREATOR }

    // ===== Capability Errors (300-399) =====

    const EEMPTY_LABEL: u64 = 300;
    public fun empty_label(): u64 { EEMPTY_LABEL }

    // ===== Pool Errors (400-499) =====

    const EEMPTY_POOL_NAME: u64 = 400;
    public fun empty_pool_name(): u64 { EEMPTY_POOL_NAME }

    const EOFFER_ALREADY_IN_POOL: u64 = 401;
    public fun offer_already_in_pool(): u64 { EOFFER_ALREADY_IN_POOL }

    const EOFFER_NOT_IN_POOL: u64 = 402;
    public fun offer_not_in_pool(): u64 { EOFFER_NOT_IN_POOL }
    
    // ===== Intent Errors (re-indexed) =====

    const EINTENT_EXPIRED: u64 = 500;
    public fun intent_expired(): u64 { EINTENT_EXPIRED }

    const EINTENT_NOT_ACTIVE: u64 = 501;
    public fun intent_not_active(): u64 { EINTENT_NOT_ACTIVE }

    const ENOT_EXECUTOR: u64 = 502;
    public fun not_executor(): u64 { ENOT_EXECUTOR }

    const EINVALID_INTENT_STATUS: u64 = 503;
    public fun invalid_intent_status(): u64 { EINVALID_INTENT_STATUS }
}
