# Davy Protocol

**Sui-native conditional liquidity coordination primitive.**

Davy is a coordination layer where liquidity is expressed as discrete on-chain offer objects with explicit lifecycle and intent-driven execution. Built on [Sui](https://sui.io) using the [Move](https://move-language.github.io/move/) programming language.

---

## What Is Davy?

Davy lets anyone create enforceable, conditional liquidity on-chain — without AMM curves, orderbook matching engines, or off-chain dependencies.

A maker deposits tokens into a **LiquidityOffer** object with explicit conditions: price bounds, fill policy, minimum size, and expiry. A taker fills that offer directly, or submits an **ExecutionIntent** that an authorized executor matches against the best available offer.

The offer object *is* the liquidity. No pools. No curves. No hidden math.

### Who Is It For?

- **Makers** who want conditional control over their liquidity — price bounds, partial/full fill rules, time expiry — without curve exposure
- **Takers** who want guaranteed execution at a known price with zero slippage
- **Routers and aggregators** (Cetus, 7K, FlowX) who want Davy as an additional liquidity source alongside AMMs and orderbooks
- **Execution bots** that monitor intents and fill them for spread capture
- **Protocol builders** who need a composable liquidity primitive as infrastructure

---

## Core Concepts

### LiquidityOffer

```
"I will trade 1000 USDC for SUI at 1.95–2.05 per unit,
 partial fills allowed, minimum 100 USDC, expires in 24 hours."
```

An offer is a first-class Sui object that holds inventory (OfferAsset) and declares conditions under which it can be filled. The object follows a strict lifecycle: Created → PartiallyFilled → Filled / Expired / Withdrawn. No other transitions are allowed.

### ExecutionIntent

```
"I want 500 SUI. I'll pay up to 1000 USDC.
 My acceptable price range is 1.90–2.10. Expires in 1 hour."
```

An intent escrows the taker's payment on-chain and delegates execution to an authorized executor. The executor matches the intent against the best offer. Unused funds are refunded atomically.

### Capabilities

Two capability objects control permissions:

- **AdminCap** — created at deployment, used to mint ExecutorCaps
- **ExecutorCap** — authorizes a bot/DAO/relayer to execute intents on behalf of users

Direct fills are permissionless. Intent execution requires an ExecutorCap.

### CoordinationPool

An optional, non-authoritative index that groups offer IDs by trading pair. Pools hold references, not liquidity. Clients must verify offer state directly.

---

## Architecture

```
davy/
├── sources/
│   ├── offer.move           # LiquidityOffer + lifecycle + fills
│   ├── intent.move          # ExecutionIntent + execution logic
│   ├── capability.move      # AdminCap, ExecutorCap
│   ├── pool.move            # CoordinationPool (index only)
│   ├── events.move          # All event structs + emitters
│   └── errors.move          # Error constants
├── tests/
│   ├── offer_tests.move
│   ├── intent_tests.move
│   ├── capability_tests.move
│   └── integration_tests.move
└── Move.toml
```

---

## Execution Paths

### Path A: Direct Fill (Permissionless)

Taker fills a specific offer directly. Atomic settlement routes OfferAsset to taker and WantAsset to maker in a single transaction.

```
Taker → fill_full_and_settle() → Offer
              ↓
       WantAsset → Maker
       OfferAsset → Taker
```

### Path B: Intent-Based Execution (Delegated)

Creator escrows payment and publishes an intent. An executor with an ExecutorCap matches the intent against the best offer.

```
Creator → create_intent() → Intent (escrows PayAsset)
                               ↓
Executor (w/ ExecutorCap) → execute_against_offer()
                               ↓
OfferAsset → Creator
PayAsset → Maker
Refund → Creator (if any)
```

Dual-sided price validation ensures the effective price satisfies both the offer's bounds and the intent's bounds. If either side rejects, the transaction aborts.

---

## Price Semantics

Prices are expressed as **WantAsset per 1 OfferAsset**, scaled by 1e9.

```
price = (want_amount × 1,000,000,000) / offer_amount
```

A `price` of `2_000_000_000` means "2 WantAsset per 1 OfferAsset."

All intermediate arithmetic uses `u128` to prevent overflow, then checked-downcast to `u64`. Fill calculations use ceiling rounding for payment amounts (taker never under-pays) and floor rounding for fill amounts (protocol never over-promises).

### Quote Helpers

Two pure view functions enable routers to price-check offers without simulation:

```move
// "If I take `fill_amount` of OfferAsset, what do I pay?"
// Ceiling rounding.
public fun quote_pay_amount<O, W>(
    offer: &LiquidityOffer<O, W>,
    fill_amount: u64,
    price: u64,
    clock: &Clock,
): u64

// "If I have `pay_budget` of WantAsset, how much OfferAsset can I get?"
// Floor rounding. Clamped to remaining balance.
public fun quote_fill_amount<O, W>(
    offer: &LiquidityOffer<O, W>,
    pay_budget: u64,
    price: u64,
    clock: &Clock,
): u64
```

TypeScript mirrors for off-chain quoting:

```typescript
const PRICE_SCALING = 1_000_000_000n;

function quotePayAmount(fillAmount: bigint, price: bigint): bigint {
  return (fillAmount * price + PRICE_SCALING - 1n) / PRICE_SCALING;
}

function quoteFillAmount(payBudget: bigint, price: bigint, remaining: bigint): bigint {
  const raw = (payBudget * PRICE_SCALING) / price;
  return raw < remaining ? raw : remaining;
}
```

---

## Events

Every state transition emits exactly one event. Off-chain systems reconstruct full protocol state from events alone — no `sui_getObject` calls required.

| Event | When | Key Fields |
|---|---|---|
| `OfferCreated` | Offer created | offer_id, maker, offer_asset_type, want_asset_type, amount, price bounds, fill_policy, min_fill_amount, expiry |
| `OfferFilled` | Fill executed | offer_id, taker, fill_amount, payment_amount, price, remaining_amount, is_full_fill |
| `OfferWithdrawn` | Maker withdraws | offer_id, remaining_amount_returned |
| `OfferExpired` | Expiry triggered | offer_id, remaining_amount_returned |
| `IntentSubmitted` | Intent created | intent_id, creator, receive/pay asset types, amounts, price bounds, escrowed_amount, expiry |
| `IntentExecuted` | Intent executed | intent_id, executor, offer_used, amount_received, amount_paid |
| `IntentCancelled` | Creator cancels | intent_id |
| `IntentExpired` | Expiry triggered | intent_id |

---

## Security Invariants

| Invariant | Enforcement |
|---|---|
| Offer balance ≤ initial amount | Sui Balance type |
| Status transitions are monotonic | State machine guards |
| Expired offers are unfillable | Clock check on every fill |
| Price bounds respected (both sides) | Dual-sided validation in execute |
| Escrow ≥ payments | Balance split arithmetic |
| No dust positions | Remainder check against min_fill_amount |
| Only maker can withdraw | Sender address check |
| Intent is single-shot | Status + offer_used guard |
| Executor cannot siphon funds | Settlement routing to maker/creator only |

---

## Router Integration

Davy is designed to be consumed as a liquidity source by routers and aggregators. Integration requires approximately 200 lines of TypeScript: subscribe to 4 event types, mirror 2 math functions, add 1 `moveCall` to your PTB builder.

See [docs/integration-spec.md](docs/integration-spec.md) for the complete router integration specification, including event schemas, cache shapes, quote flows, and PTB construction patterns.

### Why a Router Adds Davy

1. **Better prices on specific pairs.** Maker posts USDC→SUI at 1.95; AMM quotes 2.01 with slippage. Router picks Davy.
2. **Zero slippage.** Quoted price IS execution price within offer bounds.
3. **Conditional liquidity.** Price bounds + partial fills + minimum size + expiry = single enforceable object. No AMM or orderbook on Sui expresses this.
4. **Intent delegation.** Escrowed, cancellable, delegated to executors — an on-chain solver primitive.

---

## Ecosystem Position

Davy is a **coordination primitive**, not a venue.

- **DeepBook** = shared-state orderbook engine (venue)
- **Cetus, 7K, FlowX** = aggregators/routers (best-execution across venues)
- **Davy** = conditional liquidity objects with lifecycle + intent execution (primitive)

A router queries Davy alongside DeepBook and AMM pools, then picks the best price. Davy complements existing infrastructure — it doesn't replace it.

---

## Function Reference

### offer.move

| Function | Description |
|---|---|
| `create<O,W>()` | Create new offer, escrow OfferAsset |
| `fill_full_and_settle<O,W>()` | Atomic full fill + settlement |
| `fill_partial_and_settle<O,W>()` | Atomic partial fill + settlement |
| `fill_full<O,W>()` | Low-level full fill primitive |
| `fill_partial<O,W>()` | Low-level partial fill primitive |
| `withdraw<O,W>()` | Maker withdraws remaining, terminalizes |
| `expire<O,W>()` | Permissionless expiry, returns to maker |
| `quote_pay_amount<O,W>()` | Pure view: payment for given fill amount |
| `quote_fill_amount<O,W>()` | Pure view: fill amount for given budget |

### intent.move

| Function | Description |
|---|---|
| `create_price_bounded<R,P>()` | Create intent, escrow PayAsset |
| `execute_against_offer<R,P>()` | Execute intent against single offer (requires ExecutorCap) |
| `cancel<R,P>()` | Creator cancels, returns escrow |
| `expire_intent<R,P>()` | Permissionless expiry, returns escrow |

### capability.move

| Function | Description |
|---|---|
| `mint_executor_cap()` | Mint ExecutorCap (requires AdminCap) |
| `destroy_executor_cap()` | Revoke/destroy cap |
| `transfer_executor_cap()` | Transfer cap |
| `transfer_admin_cap()` | Transfer AdminCap |

### pool.move

| Function | Description |
|---|---|
| `create<O,W>()` | Create pool |
| `add_offer<O,W>()` | Add offer ID to index |
| `remove_offer<O,W>()` | Remove offer ID from index |
| `offer_ids<O,W>()` | List indexed IDs |

---

## Building

```bash
# Install Sui CLI
# https://docs.sui.io/guides/developer/getting-started/sui-install

# Build
sui move build

# Test
sui move test

# Publish (testnet)
sui client publish --gas-budget 100000000
```

---

## Project Structure

```
davy/
├── sources/              # Move smart contracts
├── tests/                # Move test suites
├── docs/
│   ├── whitepaper.md     # Protocol whitepaper
│   ├── technical-paper.md # Technical specification
│   ├── litepaper.md      # Two-page overview
│   └── integration-spec.md # Router integration guide
├── Move.toml
└── README.md
```

---

## Explicit Non-Goals (V1)

Davy does not implement: AMM curves, orderbooks, solver competitions, off-chain matching, routing/aggregation, incentives/emissions, governance, agent frameworks, partial intent satisfaction, multi-offer intent execution, cross-pool routing, or dynamic pricing.

Restraint is part of the design.

---

## License

[MIT](LICENSE)