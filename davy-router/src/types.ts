/**
 * Davy Protocol — Phase 8: Shared Types
 *
 * Core interfaces used across the production router,
 * venue adapters, PTB builder, and execution engine.
 */

import type { TransactionObjectArgument } from '@mysten/sui/transactions';

// ============================================================
// Price & Scaling
// ============================================================

/** Davy's canonical price scaling factor: 1e9 */
export const PRICE_SCALING = 1_000_000_000n;

// ============================================================
// Venue Adapters
// ============================================================

/**
 * Interface for external liquidity sources (DeepBook, Cetus, etc.).
 * Each adapter implements this to participate in routing decisions.
 */
export interface ExternalPriceSource {
    /** Human-readable venue name */
    name: string;

    /**
     * Get the effective price for a trade.
     *
     * @param receiveAssetType - Full coin type the user wants to receive
     * @param payAssetType - Full coin type the user pays with
     * @param receiveAmount - Raw amount (with decimals) of receive asset desired
     * @returns Davy-scaled price (payAmount * 1e9 / receiveAmount), or null if no liquidity
     */
    getPrice(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
    ): Promise<bigint | null>;

    /**
     * Optional: Get a detailed quote with execution metadata.
     * Used by the PTB builder for fragment generation.
     */
    getDetailedQuote?(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
    ): Promise<VenueQuote | null>;
}

// ============================================================
// Quotes
// ============================================================

/**
 * A venue-specific quote with all information needed
 * to build a PTB fragment for execution.
 */
export interface VenueQuote {
    /** Which venue produced this quote */
    venue: string;

    /** Amount the user will receive (raw, with decimals) */
    receiveAmount: bigint;

    /** Amount the user must pay (raw, with decimals) */
    payAmount: bigint;

    /** Davy-scaled effective price: payAmount * 1e9 / receiveAmount */
    effectivePrice: bigint;

    /** Venue-specific metadata (pool key, direction, etc.) */
    [key: string]: unknown;
}

/**
 * A quote from Davy's own offer book.
 */
export interface DavyQuote {
    venue: 'davy';
    offerId: string;
    offerObjectId: string;
    receiveAmount: bigint;
    payAmount: bigint;
    effectivePrice: bigint;
    fillType: 'full' | 'partial';
}

// ============================================================
// Routing
// ============================================================

/**
 * A single routing leg — one venue handling part (or all) of a trade.
 */
export interface RoutingLeg {
    /** Source venue */
    venue: string;

    /** Amount this leg fills */
    fillAmount: bigint;

    /** Payment for this leg */
    payAmount: bigint;

    /** Effective price for this leg */
    effectivePrice: bigint;

    /** Venue-specific quote data for PTB generation */
    quote: VenueQuote | DavyQuote;
}

/**
 * Complete routing decision — may contain multiple legs
 * for split-route execution across venues.
 */
export interface RoutingDecision {
    /** Asset the user wants to receive */
    receiveAssetType: string;

    /** Asset the user pays with */
    payAssetType: string;

    /** Total amount to receive across all legs */
    totalReceiveAmount: bigint;

    /** Total payment across all legs */
    totalPayAmount: bigint;

    /** Blended effective price across all legs */
    blendedPrice: bigint;

    /** Individual routing legs (1 = single venue, 2+ = split route) */
    legs: RoutingLeg[];

    /** Timestamp when this decision was computed */
    computedAt: number;

    /** Whether this is a split route */
    isSplit: boolean;
}

// ============================================================
// PTB Fragments
// ============================================================

/**
 * A PTB fragment represents the moveCall instructions
 * that one venue contributes to a composite transaction.
 */
export interface PTBFragment {
    /** Which venue this fragment is from */
    venue: string;

    /** Output coin references from the swap */
    outputs: Record<string, TransactionObjectArgument>;

    /** Human-readable description for logging */
    description: string;
}

// ============================================================
// Offer Cache
// ============================================================

/** Offer status as tracked by the event-driven cache */
export type OfferStatus =
    | 'Created'
    | 'PartiallyFilled'
    | 'Filled'
    | 'Expired'
    | 'Withdrawn';

/**
 * Cached representation of a Davy LiquidityOffer,
 * reconstructed from on-chain events.
 */
export interface CachedOffer {
    /** Sui object ID of the offer */
    objectId: string;

    /** Maker address */
    maker: string;

    /** Full coin type of the offered asset */
    offerAssetType: string;

    /** Full coin type of the wanted asset */
    wantAssetType: string;

    /** Current remaining balance (raw, with decimals) */
    remainingBalance: bigint;

    /** Initial balance when created */
    initialBalance: bigint;

    /** Minimum acceptable price (Davy 1e9 scaled) */
    minPrice: bigint;

    /** Maximum acceptable price (Davy 1e9 scaled) */
    maxPrice: bigint;

    /** Fill policy: 0 = full only, 1 = partial, 2 = partial gated */
    fillPolicy: number;

    /** Minimum fill amount (raw, with decimals) */
    minFillAmount: bigint;

    /** Expiry timestamp (milliseconds since epoch) */
    expiryMs: bigint;

    /** Current status */
    status: OfferStatus;

    /** Last event timestamp that updated this offer */
    lastUpdatedAt: number;
}

// ============================================================
// Intent Cache
// ============================================================

export type IntentStatus = 'Pending' | 'Executed' | 'Cancelled' | 'Expired';

/**
 * Cached representation of a Davy ExecutionIntent,
 * reconstructed from on-chain events.
 */
export interface CachedIntent {
    /** Sui object ID of the intent */
    objectId: string;

    /** Creator address */
    creator: string;

    /** Asset the creator wants to receive */
    receiveAssetType: string;

    /** Asset the creator is paying */
    payAssetType: string;

    /** Amount of receive asset desired */
    receiveAmount: bigint;

    /** Maximum pay amount (escrowed) */
    maxPayAmount: bigint;

    /** Minimum acceptable price */
    minPrice: bigint;

    /** Maximum acceptable price */
    maxPrice: bigint;

    /** Expiry timestamp (milliseconds since epoch) */
    expiryMs: bigint;

    /** Current status */
    status: IntentStatus;

    /** Last event timestamp */
    lastUpdatedAt: number;
}

// ============================================================
// Execution Engine
// ============================================================

/** Configuration for the execution engine */
export interface ExecutionEngineConfig {
    /** Sui RPC endpoint */
    rpcUrl: string;

    /** Network environment */
    env: 'testnet' | 'mainnet';

    /** ExecutorCap object ID (required for intent execution) */
    executorCapId: string;

    /** Davy package ID on-chain */
    davyPackageId: string;

    /** AdminCap object ID (for reference) */
    adminCapId?: string;

    /** Polling interval for new intents (ms) */
    pollIntervalMs?: number;

    /** Maximum gas budget per transaction */
    maxGasBudget?: number;

    /** DEEP token coin object ID (for DeepBook fees) */
    deepCoinId?: string;

    /** Slippage tolerance for external venues (basis points) */
    slippageBps?: number;

    /** Revocation registry shared object ID */
    revocationRegistryId?: string;

    /** Seal policy package ID (enables encrypted intent support) */
    sealPolicyPackageId?: string;
}

/** Result of an execution attempt */
export interface ExecutionResult {
    /** Whether execution succeeded */
    success: boolean;

    /** Transaction digest if successful */
    txDigest?: string;

    /** Intent that was executed */
    intentId: string;

    /** Routing decision used */
    routing: RoutingDecision;

    /** Error message if failed */
    error?: string;

    /** Gas used */
    gasUsed?: bigint;

    /** Timestamp */
    timestamp: number;
}

// ============================================================
// Davy Contract Constants
// ============================================================

export const DAVY_MODULES = {
    OFFER: 'offer',
    INTENT: 'intent',
    CAPABILITY: 'capability',
    POOL: 'pool',
    EVENTS: 'events',
} as const;

export const DAVY_FUNCTIONS = {
    // offer.move
    CREATE_OFFER: 'create',
    FILL_FULL: 'fill_full_and_settle',
    FILL_PARTIAL: 'fill_partial_and_settle',
    WITHDRAW: 'withdraw',
    EXPIRE: 'expire',
    QUOTE_PAY: 'quote_pay_amount',
    QUOTE_FILL: 'quote_fill_amount',

    // intent.move
    CREATE_INTENT: 'create_price_bounded',
    EXECUTE_V2: 'execute_against_offer_v2',
    EXECUTE_GATED: 'execute_against_gated_offer',
    CANCEL_INTENT: 'cancel',
    EXPIRE_INTENT: 'expire_intent',
} as const;

export const FILL_POLICIES = {
    FULL_ONLY: 0,
    PARTIAL: 1,
    PARTIAL_GATED: 2,
} as const;

export const DAVY_EVENT_TYPES = {
    OFFER_CREATED: 'OfferCreated',
    OFFER_CREATED_V2: 'OfferCreatedV2',
    OFFER_FILLED: 'OfferFilled',
    OFFER_WITHDRAWN: 'OfferWithdrawn',
    OFFER_EXPIRED: 'OfferExpired',
    INTENT_SUBMITTED: 'IntentSubmitted',
    INTENT_SUBMITTED_V2: 'IntentSubmittedV2',
    INTENT_EXECUTED: 'IntentExecuted',
    INTENT_CANCELLED: 'IntentCancelled',
    INTENT_EXPIRED: 'IntentExpired',
    ENCRYPTED_INTENT_SUBMITTED: 'EncryptedIntentSubmitted',
} as const;
