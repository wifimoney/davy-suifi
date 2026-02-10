/**
 * Davy Protocol — Phase 8: Production Router
 *
 * @module @davy-protocol/router
 *
 * Architecture:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                  ExecutionEngine                        │
 *   │  (main loop: poll intents → route → build PTB → submit)│
 *   └───────┬────────────────┬──────────────────┬────────────┘
 *           │                │                  │
 *   ┌───────▼───────┐ ┌─────▼──────┐  ┌───────▼─────────┐
 *   │  OfferCache   │ │   Router   │  │   PTBBuilder    │
 *   │ (event-driven │ │ (compare   │  │ (assemble split │
 *   │  state)       │ │  sources)  │  │  route PTBs)    │
 *   └───────┬───────┘ └─────┬──────┘  └───────┬─────────┘
 *           │                │                  │
 *    Sui Events       ┌─────┴──────┐    Sui Transaction
 *                     │            │
 *              ┌──────▼──┐ ┌──────▼──────┐
 *              │DeepBook │ │   Cetus     │
 *              │Adapter  │ │   Adapter   │
 *              └─────────┘ └─────────────┘
 */

// Core types
export {
    PRICE_SCALING,
    ExternalPriceSource,
    VenueQuote,
    DavyQuote,
    RoutingLeg,
    RoutingDecision,
    PTBFragment,
    CachedOffer,
    CachedIntent,
    OfferStatus,
    IntentStatus,
    ExecutionEngineConfig,
    ExecutionResult,
    DAVY_MODULES,
    DAVY_FUNCTIONS,
    FILL_POLICIES,
    DAVY_EVENT_TYPES,
} from './types.js';

// Math (bit-identical to on-chain)
export {
    calcPayment,
    calculatePrice,
    quotePayAmount,
    quoteFillAmount,
    wouldLeaveDust,
    priceWithinOfferBounds,
    priceWithinIntentBounds,
    priceRangesOverlap,
    scoreOffer,
    ceilDiv,
    toRaw,
    fromRaw,
    formatPrice,
} from './math.js';

// Offer cache
export { OfferCache } from './offer-cache.js';

// Router
export { DavyRouter, RouterConfig } from './router.js';

// PTB builder
export { PTBBuilder } from './ptb-builder.js';

// Venue adapters
export { DeepBookV3Adapter, DeepBookPoolConfig, DEEPBOOK_POOLS } from './deepbook.js';
export { CetusAdapter } from './cetus.js';

// Execution engine
export { ExecutionEngine } from './execution-engine.js';
