import { OfferCache } from './offer-cache';
import { CachedIntent, RoutingDecision, OfferStatus, FillPolicy } from './types';
import { quotePayAmount, quoteFillAmount, wouldLeaveDust } from './math';

/**
 * Davy Protocol — Execution Logic
 *
 * This class simulates a smart router (like Cetus Plus or 7K) navigating the fragmented
 * liquidity landscape.
 *
 * Goals:
 * 1. Find cheapest source (Davy offers vs External pool price)
 * 2. Comply with intent constraints (escrowed amount, max_pay, min/max price)
 * 3. Emit a routing decision
 */
export class DavyRouter {
    private cache: OfferCache;

    constructor(cache: OfferCache) {
        this.cache = cache;
    }

    /**
     * Main entry point: determine best execution for an incoming intent.
     *
     * @param intent The user's execution intent
     * @param nowMs Current timestamp (indexer simulation)
     */
    async routeIntent(intent: CachedIntent, nowMs: number): Promise<RoutingDecision> {
        // 1. Find Davy offers for the intent's pair
        let bestDavy = this.findBestDavyOffer(intent, nowMs);

        // 2. Simulate querying external aggregators (DeepBook, Cetus)
        const externalBest = await this.findBestExternalPrice(intent);

        // 3. Compare and select
        if (!bestDavy) {
            if (!externalBest) {
                return {
                    source: 'skip',
                    fillAmount: 0n,
                    paymentAmount: 0n,
                    effectivePrice: 0n,
                    reason: 'No liquidity available within price bounds.',
                };
            }
            // No Davy, use external
            return externalBest;
        }

        if (externalBest) {
            // Compare effective price (lower is better for payer)
            // PayAsset per 1 ReceiveAsset (lower payment is better)
            if (externalBest.paymentAmount < bestDavy.paymentAmount) {
                return externalBest;
            }
        }

        // Default to Davy if it's best or only option
        return bestDavy;
    }

    /**
     * Find the single best Davy offer that satisfies the intent.
     * "Best" = lowest payment required for the requested amount.
     */
    private findBestDavyOffer(intent: CachedIntent, nowMs: number): RoutingDecision | null {
        const candidates = this.cache.findCandidates(
            intent.receiveAssetType,
            intent.payAssetType,
            nowMs
        );

        let bestOfferDecision: RoutingDecision | null = null;
        let minPayment = BigInt((2n ** 64n).toString()); // Start high

        for (const offer of candidates) {
            // Price check: offer.min_price ≤ intent.max_price
            // AND intent.min_price ≤ offer.max_price
            // (Overlap check)
            //
            // In reality, we just want the lowest payment.
            // The offer's price is determined by the maker's bounds.
            // We'll optimistically try to fill at `offer.min_price` (best case for taker).
            // However, to be safe, let's assume worst-case (max_price) for guarantee.
            //
            // For this reference impl, let's simulate a market price P where:
            // P = max(offer.min_price, intent.min_price)
            // If P > offer.max_price or P > intent.max_price, no deal.

            const executionPrice = offer.minPrice > intent.minPrice ? offer.minPrice : intent.minPrice;

            if (executionPrice > offer.maxPrice || executionPrice > intent.maxPrice) {
                continue;
            }

            // Calculate fill potential
            // 1. How much does user want?
            let fillAmount = intent.receiveAmount;

            // 2. Is offer enough?
            if (offer.remainingAmount < fillAmount) {
                if (offer.fillPolicy === FillPolicy.FullOnly) {
                    continue; // Can't partial fill a full-only offer
                }
                fillAmount = offer.remainingAmount; // Partial fill
            }

            // 3. Check min fill constraints
            if (fillAmount < offer.minFillAmount) {
                continue;
            }

            // 4. Check dust
            if (wouldLeaveDust(offer.remainingAmount, fillAmount, offer.minFillAmount)) {
                continue;
            }

            // 5. Calculate payment
            const payment = quotePayAmount(fillAmount, executionPrice);

            // 6. Check intent budget
            // The user escrowed `intent.escrowedAmount`. They are willing to pay up to `intent.maxPayAmount`.
            // The payment must not exceed either.
            if (payment > intent.escrowedAmount || payment > intent.maxPayAmount) {
                continue;
            }

            // Is this better than current best?
            if (payment < minPayment) {
                minPayment = payment;
                bestOfferDecision = {
                    source: 'davy',
                    offerId: offer.offerId,
                    fillAmount,
                    paymentAmount: payment,
                    effectivePrice: executionPrice,
                    reason: 'Best on-chain offer found.',
                };
            }
        }

        return bestOfferDecision;
    }

    /**
     * Mock external aggregator query.
     * Simulates finding a price on DeepBook or Cetus.
     */
    private async findBestExternalPrice(intent: CachedIntent): Promise<RoutingDecision | null> {
        // Simulate a random external price check
        // In a real router, this would call the aggregator API/SDK.

        // 50% chance of finding liquidity
        if (Math.random() > 0.5) {
            return null;
        }

        // Generate a random price around the intent's min price
        // Variation: +/- 5%
        const basePrice = Number(intent.minPrice);
        const randomVariation = 0.95 + Math.random() * 0.10;
        const externalPrice = BigInt(Math.floor(basePrice * randomVariation));

        if (externalPrice > intent.maxPrice) {
            return null; // Too expensive
        }

        const fillAmount = intent.receiveAmount;
        const payment = quotePayAmount(fillAmount, externalPrice);

        if (payment > intent.escrowedAmount) {
            return null;
        }

        return {
            source: 'deepbook', // Placeholder
            fillAmount,
            paymentAmount: payment,
            effectivePrice: externalPrice,
            reason: 'External aggregator offered better price.',
        };
    }
}
