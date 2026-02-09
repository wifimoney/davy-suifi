import { CachedOffer, OfferStatus } from './types';

/**
 * Davy Protocol — Offer Cache (Indexer Simulation)
 *
 * In a real deployment, this would be backed by a PostgreSQL DB updated by
 * an indexer service listening to Sui events.
 *
 * For the router reference, we use an in-memory map.
 */
export class OfferCache {
    private offers: Map<string, CachedOffer> = new Map();

    /**
     * Add or update an offer (simulating event processing)
     */
    upsert(offer: CachedOffer): void {
        this.offers.set(offer.offerId, offer);
    }

    /**
     * Find potentially fillable offers for a given pair.
     * Filters: Valid status, match pair, not expired.
     */
    findCandidates(
        offerAsset: string,
        wantAsset: string,
        nowMs: number
    ): CachedOffer[] {
        const candidates: CachedOffer[] = [];

        for (const offer of this.offers.values()) {
            // 1. Asset match
            if (offer.offerAssetType !== offerAsset || offer.wantAssetType !== wantAsset) {
                continue;
            }

            // 2. Status match (Created or PartiallyFilled)
            if (offer.status !== OfferStatus.Created && offer.status !== OfferStatus.PartiallyFilled) {
                continue;
            }

            // 3. Expiry check
            if (offer.expiryTimestampMs <= nowMs) {
                continue;
            }

            // 4. Remaining balance > 0
            if (offer.remainingAmount <= 0n) {
                continue;
            }

            candidates.push(offer);
        }

        return candidates;
    }
}
