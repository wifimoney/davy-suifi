# Davy Protocol — Off-Chain Router (Reference Implementation)

This package demonstrates how to build an off-chain router for the Davy Protocol.

It proves the **Composability** of the Davy primitive: specialized liquidity
can be discovered, priced, and executed alongside standard pools.

## Architecture

1.  **Indexer (Mock):** `offer-cache.ts`
    -   In production, this would be a service listening to `OfferCreated` / `OfferFilled` events.
2.  **Pricing Engine:** `math.ts`
    -   **CRITICAL:** Replicates on-chain Move math exactly.
3.  **Router:** `router.ts`
    -   Compare Davy offers vs External venues (e.g., DeepBook).
    -   Constraints: Status, Expiry, Fill Policy, Price Bounds, Dust.

## Usage

```bash
# Install dependencies
npm install

# Run the demo
npm run demo
```

The demo simulates:
1.  An intent to buy 5 SUI for max 10 USDC (limit price 2.0).
2.  Two active Davy offers:
    -   Offer A: 5 SUI @ 1.5 USDC (Partial allowed)
    -   Offer B: 20 SUI @ 1.45 USDC (Full only)
3.  The router correctly picks Offer A because Offer B, while cheaper,
    doesn't fit the `fill_amount` constraint due to its generic FullOnly policy.

## Rounding Rules

See `math.ts` for the exact TypeScript implementation of Davy's ceiling/floor logic.
