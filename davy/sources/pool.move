/// Davy Protocol — CoordinationPool Module
///
/// Pools are **non-authoritative indexes** that hold references to offer IDs,
/// NOT liquidity. They exist for off-chain client convenience.
///
/// ## Critical Invariant
///   Clients MUST verify offer state directly. Pool membership does not
///   guarantee fillability — stale IDs are expected and normal.
///
/// ## Access Control
///   Creator-only membership management prevents spam/griefing.
module davy::pool {
    use sui::vec_set::{Self, VecSet};

    use davy::errors;
    use davy::events;

    // ===== Core Struct (5.1) =====

    /// A non-authoritative index of offer IDs.
    /// Shared object — anyone can read; creator manages membership.
    public struct CoordinationPool<phantom OfferAsset, phantom WantAsset> has key, store {
        id: UID,

        /// Human-readable pool name
        name: vector<u8>,

        /// Set of offer IDs (index only, no balances)
        offer_ids: VecSet<ID>,

        /// Address that created this pool
        creator: address,
    }

    // ===== create (5.2) =====

    /// Create an empty coordination pool with a name.
    /// The pool is shared — anyone can read it.
    /// Only the creator can add/remove offers.
    ///
    /// Aborts:
    ///   - 400 if name is empty
    public fun create<OfferAsset, WantAsset>(
        name: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(!std::vector::is_empty(&name), errors::empty_pool_name());

        let creator = tx_context::sender(ctx);
        let pool = CoordinationPool<OfferAsset, WantAsset> {
            id: object::new(ctx),
            name,
            offer_ids: vec_set::empty(),
            creator,
        };

        let pool_id = object::uid_to_inner(&pool.id);
        events::emit_pool_created(pool_id, creator, pool.name);

        transfer::public_share_object(pool);
    }

    // ===== add_offer + remove_offer (5.3) =====

    /// Add an offer ID to the pool index.
    /// Only the pool creator can add offers.
    ///
    /// Aborts:
    ///   - 401 if offer ID is already in the pool
    public fun add_offer<OfferAsset, WantAsset>(
        pool: &mut CoordinationPool<OfferAsset, WantAsset>,
        offer_id: ID,
        ctx: &TxContext,
    ) {
        assert!(tx_context::sender(ctx) == pool.creator, errors::not_pool_creator());
        assert!(!vec_set::contains(&pool.offer_ids, &offer_id), errors::offer_already_in_pool());

        vec_set::insert(&mut pool.offer_ids, offer_id);

        let pool_id = object::uid_to_inner(&pool.id);
        events::emit_offer_added_to_pool(pool_id, offer_id);
    }

    /// Remove an offer ID from the pool index.
    /// Only the pool creator can remove offers.
    ///
    /// Aborts:
    ///   - 402 if offer ID is not in the pool
    public fun remove_offer<OfferAsset, WantAsset>(
        pool: &mut CoordinationPool<OfferAsset, WantAsset>,
        offer_id: ID,
        ctx: &TxContext,
    ) {
        assert!(tx_context::sender(ctx) == pool.creator, errors::not_pool_creator());
        assert!(vec_set::contains(&pool.offer_ids, &offer_id), errors::offer_not_in_pool());

        vec_set::remove(&mut pool.offer_ids, &offer_id);

        let pool_id = object::uid_to_inner(&pool.id);
        events::emit_offer_removed_from_pool(pool_id, offer_id);
    }

    // ===== View Functions (5.4) =====

    /// Returns the set of offer IDs in the pool.
    public fun offer_ids<OfferAsset, WantAsset>(
        pool: &CoordinationPool<OfferAsset, WantAsset>,
    ): &VecSet<ID> {
        &pool.offer_ids
    }

    /// Returns the number of offers in the pool.
    public fun size<OfferAsset, WantAsset>(
        pool: &CoordinationPool<OfferAsset, WantAsset>,
    ): u64 {
        vec_set::length(&pool.offer_ids)
    }

    /// Check if an offer ID is in the pool.
    public fun contains<OfferAsset, WantAsset>(
        pool: &CoordinationPool<OfferAsset, WantAsset>,
        offer_id: &ID,
    ): bool {
        vec_set::contains(&pool.offer_ids, offer_id)
    }

    /// Returns the pool creator address.
    public fun creator<OfferAsset, WantAsset>(
        pool: &CoordinationPool<OfferAsset, WantAsset>,
    ): address {
        pool.creator
    }

    /// Returns the pool name.
    public fun name<OfferAsset, WantAsset>(
        pool: &CoordinationPool<OfferAsset, WantAsset>,
    ): vector<u8> {
        pool.name
    }

    /// Returns the pool's object ID.
    public fun pool_id<OfferAsset, WantAsset>(
        pool: &CoordinationPool<OfferAsset, WantAsset>,
    ): ID {
        object::uid_to_inner(&pool.id)
    }
}
