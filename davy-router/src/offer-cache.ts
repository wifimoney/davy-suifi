/**
 * Davy Protocol — Phase 8: Offer Cache
 *
 * Event-driven in-memory cache that reconstructs the complete state
 * of all Davy offers and intents by subscribing to on-chain events.
 *
 * The cache provides the router with instant access to active offers
 * for price comparison without RPC object fetches.
 *
 * Event types consumed:
 *   OfferCreated, OfferFilled, OfferPartiallyFilled,
 *   OfferWithdrawn, OfferExpired,
 *   IntentCreated, IntentExecuted, IntentCancelled, IntentExpired
 */

import type { SuiClient, SuiEvent } from '@mysten/sui/client';
import {
    CachedOffer,
    CachedIntent,
    OfferStatus,
    IntentStatus,
    DAVY_EVENT_TYPES,
} from './types.js';

// ============================================================
// Cache
// ============================================================

export class OfferCache {
    private offers: Map<string, CachedOffer> = new Map();
    private intents: Map<string, CachedIntent> = new Map();
    private client: SuiClient;
    private packageId: string;
    private subscriptionId: any = null;
    private lastCursor: string | null = null;
    private isRunning = false;

    constructor(config: {
        client: SuiClient;
        packageId: string;
    }) {
        this.client = config.client;
        this.packageId = config.packageId;
    }

    // --------------------------------------------------------
    // Lifecycle
    // --------------------------------------------------------

    /**
     * Start the event subscription.
     * Uses WebSocket subscription if available, falls back to polling.
     */
    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            // Try WebSocket subscription first
            this.subscriptionId = await this.client.subscribeEvent({
                filter: { Package: this.packageId } as any,
                onMessage: (event: SuiEvent) => this.processEvent(event),
            });
        } catch {
            // Fallback to polling
            console.warn('[OfferCache] WebSocket unavailable, falling back to polling');
            this.startPolling();
        }
    }

    /** Stop the event subscription. */
    async stop(): Promise<void> {
        this.isRunning = false;
        if (this.subscriptionId) {
            try {
                // Determine if we have an unsubscribe capability
                if (typeof this.subscriptionId === 'function') {
                    await this.subscriptionId();
                } else if ((this.client as any).unsubscribeEvent) {
                    await (this.client as any).unsubscribeEvent({ id: this.subscriptionId });
                }
            } catch {
                // Ignore unsubscribe errors
            }
            this.subscriptionId = null;
        }
    }

    /** Poll for new events (fallback when WebSocket is unavailable) */
    private startPolling(intervalMs: number = 2000): void {
        const poll = async () => {
            if (!this.isRunning) return;

            try {
                const result = await this.client.queryEvents({
                    query: { MoveEventModule: { package: this.packageId, module: 'events' } } as any, // Filter by events module
                    cursor: this.lastCursor as any,
                    order: 'ascending',
                    limit: 50,
                });

                for (const event of result.data) {
                    this.processEvent(event);
                }

                if (result.nextCursor) {
                    this.lastCursor = result.nextCursor as any;
                }
            } catch (err) {
                console.error('[OfferCache] Polling error:', err);
            }

            if (this.isRunning) {
                setTimeout(poll, intervalMs);
            }
        };

        poll();
    }

    // --------------------------------------------------------
    // Event Processing
    // --------------------------------------------------------

    private processEvent(event: SuiEvent): void {
        const eventType = event.type.split('::').pop() ?? '';
        const data = event.parsedJson as any;

        if (!data) return;

        const now = Date.now();

        switch (eventType) {
            case DAVY_EVENT_TYPES.OFFER_CREATED:
            case DAVY_EVENT_TYPES.OFFER_CREATED_V2:
                this.offers.set(data.offer_id, {
                    objectId: data.offer_id,
                    maker: data.maker,
                    offerAssetType: data.offer_asset?.name || data.offer_asset_type || '',
                    wantAssetType: data.want_asset?.name || data.want_asset_type || '',
                    remainingBalance: BigInt(data.amount || data.initial_offer_amount || '0'),
                    initialBalance: BigInt(data.amount || data.initial_offer_amount || '0'),
                    minPrice: BigInt(data.min_price ?? '0'),
                    maxPrice: BigInt(data.max_price ?? '0'),
                    fillPolicy: Number(data.fill_policy ?? 0),
                    minFillAmount: BigInt(data.min_fill_amount ?? '0'),
                    expiryMs: BigInt(data.expiry_ms || data.expiry_timestamp_ms || '0'),
                    status: 'Created',
                    lastUpdatedAt: now,
                });
                break;

            case DAVY_EVENT_TYPES.OFFER_FILLED:
                this.updateOffer(data.offer_id, {
                    status: 'Filled',
                    remainingBalance: 0n,
                    lastUpdatedAt: now,
                });
                break;

            case DAVY_EVENT_TYPES.OFFER_WITHDRAWN:
                this.updateOffer(data.offer_id, {
                    status: 'Withdrawn',
                    remainingBalance: 0n,
                    lastUpdatedAt: now,
                });
                break;

            case DAVY_EVENT_TYPES.OFFER_EXPIRED:
                this.updateOffer(data.offer_id, {
                    status: 'Expired',
                    lastUpdatedAt: now,
                });
                break;

            case DAVY_EVENT_TYPES.INTENT_SUBMITTED:
            case DAVY_EVENT_TYPES.INTENT_SUBMITTED_V2:
                this.intents.set(data.intent_id, {
                    objectId: data.intent_id,
                    creator: data.creator,
                    receiveAssetType: data.receive_asset?.name || data.receive_asset_type || '',
                    payAssetType: data.pay_asset?.name || data.pay_asset_type || '',
                    receiveAmount: BigInt(data.receive_amount ?? '0'),
                    maxPayAmount: BigInt(data.max_pay_amount ?? '0'),
                    minPrice: BigInt(data.min_price ?? '0'),
                    maxPrice: BigInt(data.max_price ?? '0'),
                    expiryMs: BigInt(data.expiry_ms || data.expiry_timestamp_ms || '0'),
                    status: 'Pending',
                    lastUpdatedAt: now,
                });
                break;

            case DAVY_EVENT_TYPES.ENCRYPTED_INTENT_SUBMITTED:
                this.intents.set(data.intent_id, {
                    objectId: data.intent_id,
                    creator: data.creator,
                    receiveAssetType: data.receive_asset?.name || '',
                    payAssetType: data.pay_asset?.name || '',
                    receiveAmount: 0n, // sentinel for encrypted
                    maxPayAmount: BigInt(data.max_pay_amount ?? '0'),
                    minPrice: 0n, // sentinel for encrypted
                    maxPrice: 0n, // sentinel for encrypted
                    expiryMs: BigInt(data.expiry_timestamp_ms ?? '0'),
                    status: 'Pending',
                    lastUpdatedAt: now,
                });
                break;

            case DAVY_EVENT_TYPES.INTENT_EXECUTED:
                this.updateIntent(data.intent_id, {
                    status: 'Executed',
                    lastUpdatedAt: now,
                });
                break;

            case DAVY_EVENT_TYPES.INTENT_CANCELLED:
                this.updateIntent(data.intent_id, {
                    status: 'Cancelled',
                    lastUpdatedAt: now,
                });
                break;

            case DAVY_EVENT_TYPES.INTENT_EXPIRED:
                this.updateIntent(data.intent_id, {
                    status: 'Expired',
                    lastUpdatedAt: now,
                });
                break;
        }
    }

    private updateOffer(id: string, updates: Partial<CachedOffer>): void {
        const existing = this.offers.get(id);
        if (existing) {
            Object.assign(existing, updates);
        }
    }

    private updateIntent(id: string, updates: Partial<CachedIntent>): void {
        const existing = this.intents.get(id);
        if (existing) {
            Object.assign(existing, updates);
        }
    }

    // --------------------------------------------------------
    // Queries
    // --------------------------------------------------------

    /**
     * Get all active (fillable) offers for a given asset pair.
     * Filters out expired, filled, and withdrawn offers.
     */
    getActiveOffers(
        offerAssetType: string,
        wantAssetType: string,
    ): CachedOffer[] {
        const now = BigInt(Date.now());
        const result: CachedOffer[] = [];

        for (const offer of this.offers.values()) {
            if (
                offer.offerAssetType === offerAssetType &&
                offer.wantAssetType === wantAssetType &&
                (offer.status === 'Created' || offer.status === 'PartiallyFilled') &&
                offer.expiryMs > now &&
                offer.remainingBalance > 0n
            ) {
                result.push(offer);
            }
        }

        return result;
    }

    /**
     * Get all active offers sorted by price (best price first = lowest for buyer).
     */
    getActiveOffersSorted(
        offerAssetType: string,
        wantAssetType: string,
    ): CachedOffer[] {
        return this.getActiveOffers(offerAssetType, wantAssetType)
            .sort((a, b) => {
                // Sort by min_price ascending (cheapest first)
                if (a.minPrice < b.minPrice) return -1;
                if (a.minPrice > b.minPrice) return 1;
                // Tie-break: larger balance first
                if (a.remainingBalance > b.remainingBalance) return -1;
                if (a.remainingBalance < b.remainingBalance) return 1;
                return 0;
            });
    }

    /**
     * Get all pending intents (not yet executed, cancelled, or expired).
     */
    getPendingIntents(): CachedIntent[] {
        const now = BigInt(Date.now());
        const result: CachedIntent[] = [];

        for (const intent of this.intents.values()) {
            if (intent.status === 'Pending' && intent.expiryMs > now) {
                result.push(intent);
            }
        }

        return result;
    }

    /**
     * Get pending intents for a specific asset pair.
     */
    getPendingIntentsForPair(
        receiveAssetType: string,
        payAssetType: string,
    ): CachedIntent[] {
        return this.getPendingIntents().filter(
            (i) =>
                i.receiveAssetType === receiveAssetType &&
                i.payAssetType === payAssetType,
        );
    }

    /**
     * Get a single offer by ID.
     */
    getOffer(offerId: string): CachedOffer | undefined {
        return this.offers.get(offerId);
    }

    /**
     * Get a single intent by ID.
     */
    getIntent(intentId: string): CachedIntent | undefined {
        return this.intents.get(intentId);
    }

    // --------------------------------------------------------
    // Stats
    // --------------------------------------------------------

    get offerCount(): number {
        return this.offers.size;
    }

    get activeOfferCount(): number {
        const now = BigInt(Date.now());
        let count = 0;
        for (const o of this.offers.values()) {
            if ((o.status === 'Created' || o.status === 'PartiallyFilled') && o.expiryMs > now) {
                count++;
            }
        }
        return count;
    }

    get pendingIntentCount(): number {
        return this.getPendingIntents().length;
    }

    /** Dump cache state for debugging */
    dump(): { offers: CachedOffer[]; intents: CachedIntent[] } {
        return {
            offers: [...this.offers.values()],
            intents: [...this.intents.values()],
        };
    }
}
