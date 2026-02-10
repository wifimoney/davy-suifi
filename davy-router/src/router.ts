/**
 * Davy Protocol — Phase 8: Production Router
 *
 * Compares Davy on-chain offers against external venue quotes
 * (DeepBook, Cetus, etc.) and produces optimal RoutingDecisions.
 *
 * Key capabilities:
 * - Single-venue routing (all-Davy or all-external)
 * - Split-route routing (partial Davy + partial external in one PTB)
 * - Multi-offer Davy fills (walk sorted offers like an orderbook)
 * - Configurable venue priority and thresholds
 */

import { OfferCache } from './offer-cache.js';
import {
    ExternalPriceSource,
    CachedOffer,
    RoutingDecision,
    RoutingLeg,
    DavyQuote,
    VenueQuote,
    PRICE_SCALING,
    FILL_POLICIES,
} from './types.js';
import {
    calcPayment,
    quotePayAmount,
    quoteFillAmount,
    priceRangesOverlap,
    wouldLeaveDust,
    scoreOffer,
} from './math.js';

// ============================================================
// Configuration
// ============================================================

export interface RouterConfig {
    /** Minimum improvement (bps) Davy must offer over external to prefer it */
    davyPreferenceBps?: number;

    /** Enable split-route across venues */
    enableSplitRouting?: boolean;

    /** Maximum number of Davy offers to use in a single route */
    maxDavyOffersPerRoute?: number;

    /** Minimum fill amount (raw) below which we skip a venue */
    minLegAmount?: bigint;
}

const DEFAULT_CONFIG: Required<RouterConfig> = {
    davyPreferenceBps: 0,
    enableSplitRouting: true,
    maxDavyOffersPerRoute: 5,
    minLegAmount: 1n,
};

// ============================================================
// Router
// ============================================================

export class DavyRouter {
    private cache: OfferCache;
    private venues: ExternalPriceSource[] = [];
    private config: Required<RouterConfig>;

    constructor(
        cache: OfferCache,
        venues: ExternalPriceSource[],
        config?: RouterConfig,
    ) {
        this.cache = cache;
        this.venues = venues;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // --------------------------------------------------------
    // Main Routing Entry Point
    // --------------------------------------------------------

    /**
     * Find the optimal execution path for a trade.
     *
     * @param receiveAssetType - Asset the user wants (= OfferAsset on Davy offers)
     * @param payAssetType - Asset the user pays (= WantAsset on Davy offers)
     * @param receiveAmount - How much of receiveAsset the user wants
     * @returns RoutingDecision with one or more legs, or null if no liquidity
     */
    async route(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
    ): Promise<RoutingDecision | null> {
        // 1. Get Davy offer quotes
        const davyLegs = this.buildDavyLegs(
            receiveAssetType,
            payAssetType,
            receiveAmount,
        );

        // 2. Get external venue quotes (parallel)
        const externalQuotes = await this.getExternalQuotes(
            receiveAssetType,
            payAssetType,
            receiveAmount,
        );

        // 3. Build candidate routes and pick the best
        const candidates: RoutingDecision[] = [];

        // Candidate A: All-Davy (if sufficient liquidity)
        const allDavy = this.buildAllDavyRoute(
            receiveAssetType,
            payAssetType,
            receiveAmount,
            davyLegs,
        );
        if (allDavy) candidates.push(allDavy);

        // Candidate B: Best single external venue
        for (const quote of externalQuotes) {
            const route = this.buildExternalRoute(
                receiveAssetType,
                payAssetType,
                receiveAmount,
                quote,
            );
            if (route) candidates.push(route);
        }

        // Candidate C: Split routes (Davy + external)
        if (this.config.enableSplitRouting && davyLegs.length > 0 && externalQuotes.length > 0) {
            const splitRoutes = this.buildSplitRoutes(
                receiveAssetType,
                payAssetType,
                receiveAmount,
                davyLegs,
                externalQuotes,
            );
            candidates.push(...splitRoutes);
        }

        if (candidates.length === 0) return null;

        // 4. Pick best route by total payment (lowest wins)
        candidates.sort((a, b) => {
            if (a.totalPayAmount < b.totalPayAmount) return -1;
            if (a.totalPayAmount > b.totalPayAmount) return 1;
            // Tie-break: prefer fewer legs (simpler PTB)
            return a.legs.length - b.legs.length;
        });

        return candidates[0];
    }

    // --------------------------------------------------------
    // Davy Offer Leg Construction
    // --------------------------------------------------------

    /**
     * Build potential Davy legs by walking sorted offers.
     * Returns legs in price-priority order, up to maxDavyOffersPerRoute.
     */
    private buildDavyLegs(
        offerAssetType: string,
        wantAssetType: string,
        totalAmount: bigint,
    ): DavyLeg[] {
        const offers = this.cache.getActiveOffersSorted(offerAssetType, wantAssetType);
        const legs: DavyLeg[] = [];
        let remaining = totalAmount;

        for (const offer of offers) {
            if (remaining <= 0n) break;
            if (legs.length >= this.config.maxDavyOffersPerRoute) break;

            const fillAmount = this.computeFillForOffer(offer, remaining);
            if (fillAmount <= 0n) continue;
            if (fillAmount < this.config.minLegAmount) continue;

            const payment = calcPayment(fillAmount, offer.maxPrice);
            const effectivePrice = (payment * PRICE_SCALING) / fillAmount;

            legs.push({
                offer,
                fillAmount,
                payAmount: payment,
                effectivePrice,
            });

            remaining -= fillAmount;
        }

        return legs;
    }

    /**
     * Compute how much of an offer can be filled given the remaining need.
     * Respects fill policy, dust prevention, and available balance.
     */
    private computeFillForOffer(offer: CachedOffer, needed: bigint): bigint {
        const available = offer.remainingBalance;
        if (available <= 0n) return 0n;

        if (needed >= available) {
            // Full fill — always allowed
            return available;
        }

        // Partial fill — check policy
        if (offer.fillPolicy === FILL_POLICIES.FULL_ONLY) {
            // Can only take the full offer
            return 0n;
        }

        // Partial fill allowed — check dust
        if (wouldLeaveDust(available, needed, offer.minFillAmount)) {
            // Would leave dust. Options:
            // 1. Fill the full offer instead (slightly overfills our need)
            // 2. Skip this offer
            // We choose to fill full to avoid leaving unfillable dust
            return available;
        }

        // Check minimum fill amount
        if (needed < offer.minFillAmount) {
            return 0n;
        }

        return needed;
    }

    // --------------------------------------------------------
    // External Venue Quoting
    // --------------------------------------------------------

    private async getExternalQuotes(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
    ): Promise<VenueQuote[]> {
        const quotes: VenueQuote[] = [];

        const results = await Promise.allSettled(
            this.venues.map(async (venue) => {
                if (venue.getDetailedQuote) {
                    return venue.getDetailedQuote(receiveAssetType, payAssetType, receiveAmount);
                }
                // Fallback to simple price
                const price = await venue.getPrice(receiveAssetType, payAssetType, receiveAmount);
                if (price === null) return null;

                const payAmount = calcPayment(receiveAmount, price);
                return {
                    venue: venue.name,
                    receiveAmount,
                    payAmount,
                    effectivePrice: price,
                } as VenueQuote;
            }),
        );

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                quotes.push(result.value);
            }
        }

        return quotes;
    }

    // --------------------------------------------------------
    // Route Construction
    // --------------------------------------------------------

    private buildAllDavyRoute(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
        legs: DavyLeg[],
    ): RoutingDecision | null {
        const totalFilled = legs.reduce((sum, l) => sum + l.fillAmount, 0n);
        if (totalFilled < receiveAmount) return null; // Insufficient Davy liquidity

        const totalPay = legs.reduce((sum, l) => sum + l.payAmount, 0n);
        const blended = (totalPay * PRICE_SCALING) / receiveAmount;

        return {
            receiveAssetType,
            payAssetType,
            totalReceiveAmount: totalFilled,
            totalPayAmount: totalPay,
            blendedPrice: blended,
            legs: legs.map((l) => ({
                venue: 'davy',
                fillAmount: l.fillAmount,
                payAmount: l.payAmount,
                effectivePrice: l.effectivePrice,
                quote: {
                    venue: 'davy',
                    offerId: l.offer.objectId,
                    offerObjectId: l.offer.objectId,
                    receiveAmount: l.fillAmount,
                    payAmount: l.payAmount,
                    effectivePrice: l.effectivePrice,
                    fillType: l.fillAmount === l.offer.remainingBalance ? 'full' : 'partial',
                } as DavyQuote,
            })),
            computedAt: Date.now(),
            isSplit: legs.length > 1,
        };
    }

    private buildExternalRoute(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
        quote: VenueQuote,
    ): RoutingDecision | null {
        return {
            receiveAssetType,
            payAssetType,
            totalReceiveAmount: receiveAmount,
            totalPayAmount: quote.payAmount,
            blendedPrice: quote.effectivePrice,
            legs: [{
                venue: quote.venue,
                fillAmount: receiveAmount,
                payAmount: quote.payAmount,
                effectivePrice: quote.effectivePrice,
                quote,
            }],
            computedAt: Date.now(),
            isSplit: false,
        };
    }

    /**
     * Build split routes: Davy handles what it can cheaply,
     * external venues handle the remainder.
     *
     * Strategy: For each external venue, compute a split where
     * Davy fills up to the point where its price is better than
     * the external venue, and the external venue fills the rest.
     */
    private buildSplitRoutes(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
        davyLegs: DavyLeg[],
        externalQuotes: VenueQuote[],
    ): RoutingDecision[] {
        const routes: RoutingDecision[] = [];

        for (const extQuote of externalQuotes) {
            // Find Davy legs that are cheaper than this external venue
            const cheaperLegs = davyLegs.filter(
                (l) => l.effectivePrice < extQuote.effectivePrice,
            );

            if (cheaperLegs.length === 0) continue;

            const davyFilled = cheaperLegs.reduce((sum, l) => sum + l.fillAmount, 0n);
            const davyPay = cheaperLegs.reduce((sum, l) => sum + l.payAmount, 0n);
            const remaining = receiveAmount - davyFilled;

            if (remaining <= 0n) continue; // Davy covers everything — already in all-Davy route
            if (remaining < this.config.minLegAmount) continue;

            // Get external quote for the remainder amount
            const remainderPay = calcPayment(remaining, extQuote.effectivePrice);

            const totalPay = davyPay + remainderPay;
            const blended = (totalPay * PRICE_SCALING) / receiveAmount;

            const allLegs: RoutingLeg[] = [
                ...cheaperLegs.map((l) => ({
                    venue: 'davy' as const,
                    fillAmount: l.fillAmount,
                    payAmount: l.payAmount,
                    effectivePrice: l.effectivePrice,
                    quote: {
                        venue: 'davy' as const,
                        offerId: l.offer.objectId,
                        offerObjectId: l.offer.objectId,
                        receiveAmount: l.fillAmount,
                        payAmount: l.payAmount,
                        effectivePrice: l.effectivePrice,
                        fillType: (l.fillAmount === l.offer.remainingBalance
                            ? 'full'
                            : 'partial') as 'full' | 'partial',
                    },
                })),
                {
                    venue: extQuote.venue,
                    fillAmount: remaining,
                    payAmount: remainderPay,
                    effectivePrice: extQuote.effectivePrice,
                    quote: { ...extQuote, receiveAmount: remaining, payAmount: remainderPay },
                },
            ];

            routes.push({
                receiveAssetType,
                payAssetType,
                totalReceiveAmount: receiveAmount,
                totalPayAmount: totalPay,
                blendedPrice: blended,
                legs: allLegs,
                computedAt: Date.now(),
                isSplit: true,
            });
        }

        return routes;
    }

    // --------------------------------------------------------
    // Utilities
    // --------------------------------------------------------

    /** Add a venue adapter at runtime */
    addVenue(venue: ExternalPriceSource): void {
        this.venues.push(venue);
    }

    /** Get registered venue names */
    getVenues(): string[] {
        return ['davy', ...this.venues.map((v) => v.name)];
    }

    /** Update router configuration */
    updateConfig(config: Partial<RouterConfig>): void {
        Object.assign(this.config, config);
    }
}

// ============================================================
// Internal Types
// ============================================================

interface DavyLeg {
    offer: CachedOffer;
    fillAmount: bigint;
    payAmount: bigint;
    effectivePrice: bigint;
}
