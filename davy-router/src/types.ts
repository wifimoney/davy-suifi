/**
 * Davy Protocol — Router Types
 *
 * These types mirror the on-chain structs as reconstructed from events.
 * An indexer listens to Davy events and builds/updates these caches.
 */

/** Offer status — matches on-chain STATUS_* constants */
export enum OfferStatus {
    Created = 0,
    PartiallyFilled = 1,
    Filled = 2,
    Expired = 3,
    Withdrawn = 4,
}

/** Fill policy — matches on-chain FILL_POLICY_* constants */
export enum FillPolicy {
    FullOnly = 0,
    PartialAllowed = 1,
}

/** Reconstructed from OfferCreated + OfferFilled events */
export interface CachedOffer {
    offerId: string;
    maker: string;
    offerAssetType: string;
    wantAssetType: string;
    initialAmount: bigint;
    remainingAmount: bigint;
    minPrice: bigint;
    maxPrice: bigint;
    fillPolicy: FillPolicy;
    minFillAmount: bigint;
    expiryTimestampMs: number;
    status: OfferStatus;
    totalFilled: bigint;
    fillCount: number;
}

/** Reconstructed from IntentSubmitted event */
export interface CachedIntent {
    intentId: string;
    creator: string;
    receiveAssetType: string;
    payAssetType: string;
    receiveAmount: bigint;
    maxPayAmount: bigint;
    escrowedAmount: bigint;
    minPrice: bigint;
    maxPrice: bigint;
    expiryTimestampMs: number;
    status: 'pending' | 'executed' | 'cancelled' | 'expired';
}

/** Result of a routing decision */
export interface RoutingDecision {
    source: 'davy' | 'deepbook' | 'cetus' | 'skip';
    offerId?: string;
    fillAmount: bigint;
    paymentAmount: bigint;
    effectivePrice: bigint;
    reason: string;
}

/** Execution trace — emitted after routing decision is executed */
export interface ExecutionTrace {
    intentId: string;
    decision: RoutingDecision;
    txDigest?: string;
    timestamp: number;
}
