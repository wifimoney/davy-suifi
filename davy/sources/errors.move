/// Davy Protocol — Centralized Error Constants
///
/// All abort codes in one module for easy auditing and documentation.
///
/// ## Ranges
///   - `1xx` — Offer errors (creation, fills, lifecycle)
///   - `2xx` — Intent errors (execution, escrow, lifecycle)
///   - `3xx` — Capability errors (minting, revocation)
///   - `4xx` — Pool errors (membership)
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

    const EPARTIAL_FILL_CAP_REQUIRED: u64 = 119;
    public fun partial_fill_cap_required(): u64 { EPARTIAL_FILL_CAP_REQUIRED }

    const EINVALID_STATUS_FOR_FILL: u64 = 120;
    public fun invalid_status_for_fill(): u64 { EINVALID_STATUS_FOR_FILL }

    const EZERO_PRICE: u64 = 121;
    public fun zero_price(): u64 { EZERO_PRICE }

    // ===== Intent Errors (200-299) =====

    const EINTENT_NOT_PENDING: u64 = 200;
    public fun intent_not_pending(): u64 { EINTENT_NOT_PENDING }

    const EINTENT_EXPIRED: u64 = 201;
    public fun intent_expired(): u64 { EINTENT_EXPIRED }

    const ENOT_YET_EXPIRED_INTENT: u64 = 202;
    public fun not_yet_expired_intent(): u64 { ENOT_YET_EXPIRED_INTENT }

    const EPRICE_MISMATCH: u64 = 203;
    public fun price_mismatch(): u64 { EPRICE_MISMATCH }

    const EINSUFFICIENT_LIQUIDITY: u64 = 204;
    public fun insufficient_liquidity(): u64 { EINSUFFICIENT_LIQUIDITY }

    const EINSUFFICIENT_ESCROWED: u64 = 205;
    public fun insufficient_escrowed(): u64 { EINSUFFICIENT_ESCROWED }

    const ENOT_CREATOR: u64 = 206;
    public fun not_creator(): u64 { ENOT_CREATOR }

    const EEXPIRED_ON_CREATE_INTENT: u64 = 207;
    public fun expired_on_create_intent(): u64 { EEXPIRED_ON_CREATE_INTENT }

    const EZERO_RECEIVE_AMOUNT: u64 = 208;
    public fun zero_receive_amount(): u64 { EZERO_RECEIVE_AMOUNT }

    const EZERO_ESCROW_AMOUNT: u64 = 209;
    public fun zero_escrow_amount(): u64 { EZERO_ESCROW_AMOUNT }

    // ===== Capability Errors (300-399) =====

    const EEMPTY_LABEL: u64 = 300;
    public fun empty_label(): u64 { EEMPTY_LABEL }

    /// Attempted to revoke an ExecutorCap that is already in the registry.
    const ECAP_ALREADY_REVOKED: u64 = 301;
    public fun cap_already_revoked(): u64 { ECAP_ALREADY_REVOKED }

    /// Attempted to revoke a PartialFillCap that is already in the registry.
    const EPARTIAL_CAP_ALREADY_REVOKED: u64 = 302;
    public fun partial_cap_already_revoked(): u64 { EPARTIAL_CAP_ALREADY_REVOKED }

    /// ExecutorCap or PartialFillCap has been revoked by admin.
    const EREVOKED_CAP: u64 = 303;
    public fun revoked_cap(): u64 { EREVOKED_CAP }

    /// Attempted to un-revoke a cap ID not in the registry.
    const EREVOCATION_NOT_FOUND: u64 = 304;
    public fun revocation_not_found(): u64 { EREVOCATION_NOT_FOUND }

    // ===== Pool Errors (400-499) =====

    const EEMPTY_POOL_NAME: u64 = 400;
    public fun empty_pool_name(): u64 { EEMPTY_POOL_NAME }

    const EOFFER_ALREADY_IN_POOL: u64 = 401;
    public fun offer_already_in_pool(): u64 { EOFFER_ALREADY_IN_POOL }

    const ENOT_POOL_CREATOR: u64 = 402;
    public fun not_pool_creator(): u64 { ENOT_POOL_CREATOR }

    const EOFFER_NOT_IN_POOL: u64 = 403;
    public fun offer_not_in_pool(): u64 { EOFFER_NOT_IN_POOL }

    /// Pool has reached maximum capacity (1000 offers).
    const EPOOL_FULL: u64 = 404;
    public fun pool_full(): u64 { EPOOL_FULL }

    // ===== Encrypted Intent Errors (210-219) =====

    /// Attempted execute_encrypted on an intent with no encrypted params.
    const EINTENT_NOT_ENCRYPTED: u64 = 210;
    public fun intent_not_encrypted(): u64 { EINTENT_NOT_ENCRYPTED }

    /// Encrypted params already consumed (intent already decrypted/executed).
    const EINTENT_ALREADY_DECRYPTED: u64 = 211;
    public fun intent_already_decrypted(): u64 { EINTENT_ALREADY_DECRYPTED }

    /// Empty encrypted_params blob passed to create_encrypted_intent.
    const EZERO_ENCRYPTED_PARAMS: u64 = 212;
    public fun zero_encrypted_params(): u64 { EZERO_ENCRYPTED_PARAMS }
}
