module davy::events {
    use sui::object::ID;
    use sui::event;

    public struct OfferCreated has copy, drop {
        offer_id: ID,
        maker: address,
        offer_amount: u64,
        min_price: u64,
        max_price: u64,
        expiry: u64,
        fill_policy: u8,
        min_fill: u64,
    }

    public struct OfferWithdrawn has copy, drop {
        offer_id: ID,
        maker: address,
        amount: u64,
        total_filled: u64,
    }

    public struct OfferExpired has copy, drop {
        offer_id: ID,
        remaining_amount: u64,
        total_filled: u64,
    }

    public struct OfferFilled has copy, drop {
        offer_id: ID,
        taker: address,
        fill_amount: u64,
        payment_amount: u64,
        price: u64,
        is_full: bool,
        remaining: u64,
    }

    public fun emit_offer_created(
        offer_id: ID,
        maker: address,
        offer_amount: u64,
        min_price: u64,
        max_price: u64,
        expiry: u64,
        fill_policy: u8,
        min_fill: u64,
    ) {
        event::emit(OfferCreated {
            offer_id, maker, offer_amount, min_price, max_price, expiry, fill_policy, min_fill
        })
    }

    public fun emit_offer_withdrawn(offer_id: ID, maker: address, amount: u64, total_filled: u64) {
        event::emit(OfferWithdrawn { offer_id, maker, amount, total_filled })
    }

    public fun emit_offer_expired(offer_id: ID, remaining_amount: u64, total_filled: u64) {
        event::emit(OfferExpired { offer_id, remaining_amount, total_filled })
    }

    public fun emit_offer_filled(
        offer_id: ID,
        taker: address,
        fill_amount: u64,
        payment_amount: u64,
        price: u64,
        is_full: bool,
        remaining: u64,
    ) {
        event::emit(OfferFilled {
            offer_id, taker, fill_amount, payment_amount, price, is_full, remaining
        })
    }
}
