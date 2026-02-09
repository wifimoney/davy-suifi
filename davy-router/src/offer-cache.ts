/**
 * Davy Protocol — Offer Cache
 *
 * Maintains an in-memory cache of Davy offers, updated from events.
 * In production, this would be backed by a database and fed by
 * a Sui event subscription (sui_subscribeEvent).
 */

import { CachedOffer, OfferStatus, FillPolicy } from './types.js';

export class OfferCache {
    private offers = new Map<string, CachedOffer>();

    /** Process an OfferCreated event */
    onOfferCreated(event: {
        offerId: string;
        maker: string;
        offerAssetType: string;
        wantAssetType: string;
        initialAmount: bigint;
        minPrice: bigint;
        maxPrice: bigint;
        fillPolicy: number;
        minFillAmount: bigint;
        expiryTimestampMs: number;
    }): void {
        this.offers.set(event.offerId, {
            offerId: event.offerId,
            maker: event.maker,
            offerAssetType: event.offerAssetType,
            wantAssetType: event.wantAssetType,
            initialAmount: event.initialAmount,
            remainingAmount: event.initialAmount,
            minPrice: event.minPrice,
            maxPrice: event.maxPrice,
            fillPolicy: event.fillPolicy as FillPolicy,
            minFillAmount: event.minFillAmount,
            expiryTimestampMs: event.expiryTimestampMs,
            status: OfferStatus.Created,
            totalFilled: 0n,
            fillCount: 0,
        });
    }

    /** Process an OfferFilled event */
    onOfferFilled(event: {
        offerId: string;
        fillAmount: bigint;
        isFull: boolean;
        remaining: bigint;
    }): void {
        const offer = this.offers.get(event.offerId);
        if (!offer) return;

        offer.remainingAmount = event.remaining;
        offer.totalFilled += event.fillAmount;
        offer.fillCount += 1;
        offer.status = event.isFull
            ? OfferStatus.Filled
            : OfferStatus.PartiallyFilled;
    }

    /** Process an OfferWithdrawn event */
    onOfferWithdrawn(offerId: string): void {
        const offer = this.offers.get(offerId);
        if (offer) offer.status = OfferStatus.Withdrawn;
    }

    /** Process an OfferExpired event */
    onOfferExpired(offerId: string): void {
        const offer = this.offers.get(offerId);
        if (offer) offer.status = OfferStatus.Expired;
    }

    /** Get a specific offer */
    get(offerId: string): CachedOffer | undefined {
        return this.offers.get(offerId);
    }

    /**
     * Find all fillable offers for a given asset pair.
     * Returns offers sorted by best price (lowest minPrice first).
     */
    findFillableOffers(
        offerAssetType: string,
        wantAssetType: string,
        nowMs: number,
    ): CachedOffer[] {
        const results: CachedOffer[] = [];

        for (const offer of this.offers.values()) {
            if (offer.offerAssetType !== offerAssetType) continue;
            if (offer.wantAssetType !== wantAssetType) continue;
            if (offer.status !== OfferStatus.Created && offer.status !== OfferStatus.PartiallyFilled) continue;
            if (offer.expiryTimestampMs <= nowMs) continue;
            if (offer.remainingAmount === 0n) continue;

            results.push(offer);
        }

        // Sort by min_price ascending (cheapest first)
        results.sort((a, b) => {
            if (a.minPrice < b.minPrice) return -1;
            if (a.minPrice > b.minPrice) return 1;
            return 0;
        });

        return results;
    }

    /** Upsert an offer (used for bulk loading) */
    upsert(offer: CachedOffer): void {
        this.offers.set(offer.offerId, offer);
    }

    /** Total offers in cache */
    get size(): number {
        return this.offers.size;
    }
}
