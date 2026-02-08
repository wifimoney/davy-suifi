module davy::errors {
    public fun zero_amount(): u64 { 100 }
    public fun zero_min_price(): u64 { 101 }
    public fun zero_min_amount(): u64 { 101 }
    public fun zero_max_price(): u64 { 102 }
    public fun invalid_price_bounds(): u64 { 103 }
    public fun invalid_fill_policy(): u64 { 104 }
    public fun offer_expired(): u64 { 105 }
    public fun offer_not_fillable(): u64 { 106 }
    public fun price_too_low(): u64 { 107 }
    public fun price_too_high(): u64 { 108 }
    public fun expired_on_create(): u64 { 109 }
    public fun partial_fill_not_allowed(): u64 { 110 }
    public fun fill_below_minimum(): u64 { 111 }
    public fun fill_exceeds_remaining(): u64 { 112 }
    public fun would_leave_dust(): u64 { 113 }
    public fun not_maker(): u64 { 114 }
    public fun invalid_status_for_withdraw(): u64 { 115 }
    public fun not_yet_expired(): u64 { 116 }
    public fun invalid_status_for_expire(): u64 { 117 }
    public fun min_fill_exceeds_amount(): u64 { 118 }
    public fun empty_label(): u64 { 300 }
    public fun intent_expired(): u64 { 400 }
    public fun intent_not_active(): u64 { 401 }
    public fun not_creator(): u64 { 402 }
    public fun not_executor(): u64 { 403 }
    public fun invalid_intent_status(): u64 { 404 }
}
