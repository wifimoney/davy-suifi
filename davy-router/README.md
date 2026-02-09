# davy-router

**Reference off-chain router for the Davy Protocol.**

Proves that the Davy primitive composes into real execution outcomes:
intent → query offers → compare vs external sources → execute best → emit trace.

## Quick Start

```bash
npm install
npx tsx src/demo.ts
```

## Architecture

```
src/
├── math.ts         # Deterministic pricing (mirrors offer.move exactly)
├── types.ts        # CachedOffer, CachedIntent, RoutingDecision, ExecutionTrace
├── offer-cache.ts  # In-memory offer cache built from events
├── router.ts       # Routing logic: Davy vs external sources
├── demo.ts         # End-to-end demo flow
└── index.ts        # Package exports
```

## How It Works

1. **Indexer** subscribes to Davy events (`OfferCreated`, `OfferFilled`, etc.)
2. **OfferCache** maintains fillable offers in memory
3. **Router** receives an intent and:
   - Queries Davy offers matching the asset pair
   - Quotes payment for each offer using `quotePayAmount()`
   - Queries external sources (DeepBook, Cetus) for comparison
   - Picks the cheapest source
4. **Executor** submits the TX using `ExecutorCap`
5. **Trace** is emitted for audit

## Math Invariant

The TypeScript math in `math.ts` produces **bit-identical** results to Move:

```typescript
// This MUST equal the on-chain settlement amount
calcPayment(fillAmount, price) === onChainPayment
```

See `../davy/README.md` → "Deterministic Rounding Rules" for full spec.
