/**
 * Davy Protocol — Router
 *
 * Core routing logic: given an intent, compare Davy offers against
 * external price sources (DeepBook, Cetus) and pick the best execution path.
 *
 * This is a REFERENCE implementation. Production routers would:
 * - Use real Sui RPC for DeepBook/Cetus price queries
 * - Handle multi-hop routing
 * - Support splitting across sources
 * - Implement gas optimization
 */

import { OfferCache } from './offer-cache.js';
import { CachedIntent, CachedOffer, RoutingDecision, FillPolicy } from './types.js';
import { quotePayAmount, quoteFillAmount, wouldLeaveDust } from './math.js';

/** External price source interface (mock for reference) */
export interface ExternalPriceSource {
    name: string;
    /** Get best available price for asset pair. Returns null if no liquidity. */
    getPrice(offerAssetType: string, wantAssetType: string, amount: bigint): Promise<bigint | null>;
}

export class DavyRouter {
    constructor(
        private offerCache: OfferCache,
        private externalSources: ExternalPriceSource[] = [],
    ) { }

    /**
     * Route an intent: find the best execution path.
     *
     * Flow:
     * 1. Query Davy offers matching the intent's asset pair
     * 2. For each offer, compute the cost to fill the intent's receive_amount
     * 3. Query external sources for comparison
     * 4. Pick the cheapest source
     * 5. Return routing decision
     */
    async routeIntent(intent: CachedIntent, nowMs: number): Promise<RoutingDecision> {
        const davyBest = this.findBestDavyOffer(intent, nowMs);
        const externalBest = await this.findBestExternalPrice(intent);

        // No Davy offers available
        if (!davyBest) {
            if (!externalBest) {
                return {
                    source: 'skip',
                    fillAmount: 0n,
                    paymentAmount: 0n,
                    effectivePrice: 0n,
                    reason: 'No liquidity available from any source',
                };
            }
            return externalBest;
        }

        // No external sources available — use Davy
        if (!externalBest) {
            return davyBest;
        }

        // Compare: lowest payment wins
        if (davyBest.paymentAmount <= externalBest.paymentAmount) {
            return {
                ...davyBest,
                reason: `Davy wins: ${davyBest.paymentAmount} vs ${externalBest.source} ${externalBest.paymentAmount}`,
            };
        } else {
            return {
                ...externalBest,
                reason: `${externalBest.source} wins: ${externalBest.paymentAmount} vs Davy ${davyBest.paymentAmount}`,
            };
        }
    }

    /**
     * Find the best Davy offer to fill an intent.
     * Tries each fillable offer and picks the one with lowest payment.
     */
    private findBestDavyOffer(
        intent: CachedIntent,
        nowMs: number,
    ): RoutingDecision | null {
        const offers = this.offerCache.findFillableOffers(
            intent.receiveAssetType,
            intent.payAssetType,
            nowMs,
        );

        let bestDecision: RoutingDecision | null = null;

        for (const offer of offers) {
            const decision = this.evaluateOffer(offer, intent);
            if (!decision) continue;

            if (!bestDecision || decision.paymentAmount < bestDecision.paymentAmount) {
                bestDecision = decision;
            }
        }

        return bestDecision;
    }

    /**
     * Evaluate a single Davy offer against an intent.
     * Returns null if the offer can't satisfy the intent.
     */
    private evaluateOffer(offer: CachedOffer, intent: CachedIntent): RoutingDecision | null {
        const fillAmount = intent.receiveAmount;

        // Can this offer fill the full intent amount?
        if (fillAmount > offer.remainingAmount) return null;

        // Is this a partial fill on a full-only offer?
        if (fillAmount < offer.remainingAmount && offer.fillPolicy === FillPolicy.FullOnly) return null;

        // Would this leave dust?
        if (fillAmount < offer.remainingAmount) {
            if (fillAmount < offer.minFillAmount) return null;
            if (wouldLeaveDust(offer.remainingAmount, fillAmount, offer.minFillAmount)) return null;
        }

        // Try pricing at offer's min_price (best for taker)
        const price = offer.minPrice;

        // Check intent price bounds
        if (price < intent.minPrice || price > intent.maxPrice) return null;

        // Quote payment
        const paymentAmount = quotePayAmount(fillAmount, price);

        // Check against intent's max_pay
        if (paymentAmount > intent.maxPayAmount) return null;

        return {
            source: 'davy',
            offerId: offer.offerId,
            fillAmount,
            paymentAmount,
            effectivePrice: price,
            reason: `Davy offer ${offer.offerId.slice(0, 8)}... at price ${price}`,
        };
    }

    /** Query external sources for comparison pricing */
    private async findBestExternalPrice(intent: CachedIntent): Promise<RoutingDecision | null> {
        let best: RoutingDecision | null = null;

        for (const source of this.externalSources) {
            const price = await source.getPrice(
                intent.receiveAssetType,
                intent.payAssetType,
                intent.receiveAmount,
            );

            if (!price) continue;

            const paymentAmount = quotePayAmount(intent.receiveAmount, price);

            if (paymentAmount > intent.maxPayAmount) continue;
            if (price < intent.minPrice || price > intent.maxPrice) continue;

            if (!best || paymentAmount < best.paymentAmount) {
                best = {
                    source: source.name as RoutingDecision['source'],
                    fillAmount: intent.receiveAmount,
                    paymentAmount,
                    effectivePrice: price,
                    reason: `${source.name} at price ${price}`,
                };
            }
        }

        return best;
    }
}
