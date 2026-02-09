# Davy Protocol — Sui-Native Conditional Liquidity Coordination Primitive

> Davy is a Sui-native coordination layer where liquidity is expressed as discrete on-chain offer objects with explicit lifecycle and intent-driven execution.

**Status:** V1 Complete — Production-grade, auditable, Mysten-reviewable

---

## What Davy Is

Davy is a **coordination primitive**, not an AMM, not a CLOB, not a solver auction.

Makers create **LiquidityOffer** objects that _are_ the liquidity — no curves, no hidden math, no implicit rebalancing. Takers fill offers directly, or create **ExecutionIntent** objects that delegate execution to authorized bots/DAOs via **ExecutorCap**.

Every offer has an explicit lifecycle: `Created → PartiallyFilled → Filled | Expired | Withdrawn`.

Every intent has escrowed funds and is cancellable/expirable.

---

## Core Abstractions

| Abstraction | Purpose |
|---|---|
| `LiquidityOffer<O, W>` | Discrete on-chain liquidity with price bounds and fill policy |
| `ExecutionIntent<O, W>` | Escrowed, conditional execution request |
| `AdminCap` | Protocol admin — gates executor minting |
| `ExecutorCap` | Permission to execute intents against offers |
| `CoordinationPool<O, W>` | Non-authoritative index of offer IDs (optional) |

---

## Module Layout
```
davy/
├── sources/
│   ├── offer.move       # LiquidityOffer + lifecycle + fills + price math
│   ├── intent.move      # ExecutionIntent + execution + cancel + expire
│   ├── capability.move  # AdminCap, ExecutorCap, minting, revocation
│   ├── pool.move        # CoordinationPool (index only, no liquidity)
│   ├── events.move      # All event structs + emitters
│   └── errors.move      # Centralized error constants (1xx/2xx/3xx/4xx)
├── tests/
│   ├── offer_tests.move        # 15 tests — create, withdraw, expire, views
│   ├── fill_tests.move         # 16 tests — full/partial fills, price, dust
│   ├── capability_tests.move   # 11 tests — mint, destroy, transfer
│   ├── intent_tests.move       # 17 tests — create, execute, cancel, expire
│   ├── pool_tests.move         #  9 tests — create, add, remove, views
│   └── integration_tests.move  # 15 tests — e2e flows, security invariants
└── Move.toml
```

**83 total tests** covering happy paths, error paths, boundary conditions, and all 10 security invariants.

---

## Execution Paths

### Path A: Direct Fill (Permissionless)
```
Taker → fill_full_and_settle() → Offer
              ↓
       WantAsset → Maker
       OfferAsset → Taker
```

Anyone can fill. No capability required. Atomic settlement.

### Path B: Intent-Based Execution (Delegated)
```
Creator → create_intent() → Intent (escrows PayAsset)
                               ↓
Executor (w/ ExecutorCap) → execute_against_offer()
                               ↓
OfferAsset → Creator
PayAsset → Maker
Refund → Creator (if any)
```

Dual-sided price validation: effective price must satisfy **both** offer and intent bounds.

---

## Price Semantics

Prices are `WantAsset per 1 OfferAsset`, scaled by **1e9**.
```
price = (want_amount × 1,000,000,000) / offer_amount
```

- `price = 2_000_000_000` → "2 WantAsset per 1 OfferAsset"
- All intermediate math uses `u128`, then checked-downcast to `u64`
- Payment calculation rounds **up** (protects maker)

---

## Public API Reference

### offer.move

| Function | Description |
|---|---|
| `create<O,W>()` | Create offer, escrow OfferAsset. Returns `ID`. |
| `fill_full_and_settle<O,W>()` | Atomic full fill + settlement. **Recommended.** |
| `fill_partial_and_settle<O,W>()` | Atomic partial fill + settlement. **Recommended.** |
| `fill_full<O,W>()` | Low-level full fill. Returns `FillReceipt`. |
| `fill_partial<O,W>()` | Low-level partial fill. Returns `FillReceipt`. |
| `withdraw<O,W>()` | Maker withdraws remaining. Destroys offer. |
| `expire<O,W>()` | Permissionless expiry after timestamp. Destroys offer. |
| `calculate_price()` | Compute 1e9-scaled price from amounts. |
| `calc_payment()` | Compute required payment (rounds up). |
| `remaining_amount()` | View remaining balance. |
| `status()` | View offer status (0–4). |
| `is_fillable()` | Check if offer is active and not expired. |
| `price_bounds()` | View `(min_price, max_price)`. |
| `maker()` | View maker address. |

### intent.move

| Function | Description |
|---|---|
| `create_price_bounded<R,P>()` | Create intent, escrow PayAsset. |
| `execute_against_offer<R,P>()` | Execute against single offer. Requires `ExecutorCap`. |
| `cancel<R,P>()` | Creator cancels, returns escrow. |
| `expire_intent<R,P>()` | Permissionless expiry, returns escrow. |
| `intent_status()` | View status (0–3). |
| `creator()` | View creator address. |
| `escrowed_amount()` | View remaining escrowed balance. |

### capability.move

| Function | Description |
|---|---|
| `mint_executor_cap()` | Mint ExecutorCap. Requires `AdminCap`. |
| `destroy_executor_cap()` | Revoke/destroy an ExecutorCap. |
| `transfer_executor_cap()` | Transfer cap to new owner. |
| `transfer_admin_cap()` | Transfer AdminCap. **Use with caution.** |

### pool.move

| Function | Description |
|---|---|
| `create<O,W>()` | Create empty coordination pool. |
| `add_offer<O,W>()` | Add offer ID to pool. Creator-only. |
| `remove_offer<O,W>()` | Remove offer ID from pool. Creator-only. |
| `contains()` | Check if offer ID is in pool. |
| `size()` | Number of indexed offers. |

---

## Security Invariants

| # | Invariant | Enforcement |
|---|---|---|
| 1 | `balance ≤ initial` | Balance type — fills only split |
| 2 | Status monotonic | State machine — forward-only transitions |
| 3 | Expired offers unfillable | Clock check on every fill |
| 4 | Offer price bounds respected | `price_too_low` / `price_too_high` aborts |
| 5 | Intent price bounds respected | Dual-sided check in `execute_against_offer` |
| 6 | Escrow ≥ payments | Balance split aborts on insufficient |
| 7 | No dust positions | Remainder check against `min_fill_amount` |
| 8 | Only maker withdraws | Sender check → `not_maker` abort |
| 9 | Intent single-shot | Status check → `intent_not_pending` abort |
| 10 | Executor cannot siphon | Settlement routes only to maker + creator |

All 10 invariants have dedicated test coverage in `integration_tests.move`.

---

## Error Codes

| Range | Module | Examples |
|---|---|---|
| 100–118 | offer | `100` zero_amount, `105` offer_expired, `107` price_too_low, `113` would_leave_dust |
| 200–209 | intent | `200` intent_not_pending, `203` price_mismatch, `205` insufficient_escrowed |
| 300 | capability | `300` empty_label |
| 400–402 | pool | `400` empty_pool_name, `401` offer_already_in_pool |

---

## Explicit Non-Goals (V1)

- ❌ AMM curves
- ❌ Orderbooks / price-time priority
- ❌ Solver competitions / auctions
- ❌ Off-chain matching dependencies
- ❌ Multi-offer intent execution
- ❌ Cross-pool routing
- ❌ Dynamic pricing
- ❌ Fee mechanisms
- ❌ Governance
- ❌ Agent frameworks

Restraint is part of the design.

---

## Build & Test
```bash
# Build
sui move build

# Run all 83 tests
sui move test
```

Requires Sui CLI with `mainnet-v1.25.0` framework.

---

## License

UNLICENSED — All rights reserved.

---

## 📐 Deterministic Rounding Rules (Router Integration)

Off-chain routers MUST replicate Davy's pricing math exactly. Any discrepancy
means the router's quoted amount won't match the on-chain fill, causing TX failure.

### Price Representation

All prices are **WantAsset per 1 OfferAsset**, scaled by **1e9** (1,000,000,000).

```
price = 2_000_000_000  →  "2.0 WantAsset per 1 OfferAsset"
price = 1_500_000_000  →  "1.5 WantAsset per 1 OfferAsset"
```

### Core Functions

#### `calc_payment(fill_amount, price) → payment`

How much WantAsset the taker pays for `fill_amount` of OfferAsset.

**Rounding: CEILING** — taker never under-pays.

```
payment = ceil(fill_amount × price / 1e9)
        = (fill_amount × price + 1e9 - 1) / 1e9    [integer math]
```

**TypeScript equivalent:**
```typescript
function calcPayment(fillAmount: bigint, price: bigint): bigint {
  const SCALING = 1_000_000_000n;
  return (fillAmount * price + SCALING - 1n) / SCALING;
}
```

#### `calculate_price(payment_amount, fill_amount) → price`

Effective price of a fill (used for validation, not quoting).

**Rounding: FLOOR** — computed price never exceeds actual rate.

```
price = floor(payment_amount × 1e9 / fill_amount)
      = (payment_amount × 1e9) / fill_amount    [integer math]
```

**TypeScript equivalent:**
```typescript
function calculatePrice(paymentAmount: bigint, fillAmount: bigint): bigint {
  const SCALING = 1_000_000_000n;
  return (paymentAmount * SCALING) / fillAmount;
}
```

#### `quote_pay_amount(offer, fill_amount, price) → payment`

**Same math as `calc_payment`** plus validation guards.

- Checks: status, fill_amount ≤ remaining, fill policy, dust, price bounds
- Rounding: **CEILING**
- Use this to get the exact payment for a planned fill

#### `quote_fill_amount(offer, pay_budget, price) → fill_amount`

**Inverse of `calc_payment`** — how much OfferAsset for a given WantAsset budget.

**Rounding: FLOOR** — never over-promises.

```
fill_amount = floor(pay_budget × 1e9 / price)
            = (pay_budget × 1e9) / price    [integer math]
```

Result is clamped to `min(calculated, remaining_balance)`.

**TypeScript equivalent:**
```typescript
function quoteFillAmount(payBudget: bigint, price: bigint, remaining: bigint): bigint {
  const SCALING = 1_000_000_000n;
  const fill = (payBudget * SCALING) / price;
  return fill > remaining ? remaining : fill;
}
```

### Overflow Protection

All intermediate math uses `u128`. The maximum safe values:

```
Max fill_amount:  u64::MAX = 18,446,744,073,709,551,615
Max price:        u64::MAX = 18,446,744,073,709,551,615
Product:          u128 — safe up to 3.4e38 (no overflow possible with u64 inputs)
```

### Worked Examples

| fill_amount | price | payment (ceil) | Notes |
|---|---|---|---|
| 10,000,000,000 (10 SUI) | 2,000,000,000 (2.0) | 20,000,000,000 (20 USDC) | Clean division |
| 500,000,000 (0.5 SUI) | 1,500,000,000 (1.5) | 750,000,000 (0.75 USDC) | Clean |
| 1 | 1,500,000,001 | 2 | Ceiling: 1.500000001 → 2 |
| 100 | 1,500,000,000 | 150 | 100 × 1.5 = 150 |
| 333 | 1,000,000,001 | 334 | Ceiling rounds up |

### Dust Prevention

After a partial fill, the remaining balance must be ≥ `min_fill_amount`.
If `remaining - fill_amount > 0 && remaining - fill_amount < min_fill_amount`, the fill aborts.

Routers must check this constraint before submitting:
```typescript
const wouldRemain = remaining - fillAmount;
if (wouldRemain > 0n && wouldRemain < minFillAmount) {
  // This fill would leave dust — either fill more or fill all
}
```


---

## 🎯 Where Davy Fits (Sui Ecosystem)

### The One-Liner

> **DeepBook = venue. Aggregators = routers. Davy = coordination primitive.**

### Detailed Positioning

| Layer | Examples | What Davy Is/Isn't |
|---|---|---|
| **Venue / Engine** | DeepBook | Davy is NOT a venue. Offers coexist with DeepBook orders. |
| **Aggregator / Router** | Cetus Plus, 7K, FlowX | Davy is a SOURCE that aggregators can tap via quote helpers. |
| **OTC / RFQ** | (none on Sui) | Davy IS the on-chain RFQ primitive. Conditional offers with lifecycle. |
| **Intent / Solver** | (none shipping) | Davy provides escrowed, cancellable intents with delegated execution. |

### "Why not just use DeepBook?"

DeepBook is a shared-state orderbook engine. It's excellent for continuous
price-time-priority matching. But:

1. **DeepBook orders don't have lifecycle management** — no conditional expiry,
   no fill policy control, no explicit state machine.
2. **DeepBook doesn't have intent-driven execution** — no escrowed intents,
   no delegated execution via capability objects.
3. **DeepBook is a venue.** Davy is a coordination layer that can route TO
   DeepBook (or Cetus, or any venue) when the venue offers better price.

A router that integrates both Davy and DeepBook gives users the best of
both worlds: conditional, lifecycle-managed liquidity from Davy alongside
deep continuous liquidity from DeepBook.

### How a Router Uses Davy

```
1. Intent created (user escrows payment)
2. Router queries: Davy offers vs DeepBook price vs Cetus price
3. Best source wins → executor fills via Davy or routes to venue
4. Settlement: OfferAsset → creator, PayAsset → maker, refund → creator
5. Event trace emitted for audit
```


---

## 📋 Function Reference (Complete)

### offer.move

| Function | Description | Added |
|---|---|---|
| `create<O,W>()` | Create new offer, escrow OfferAsset | Phase 1 |
| `fill_full<O,W>()` | Low-level full fill primitive | Phase 2 |
| `fill_partial<O,W>()` | Low-level partial fill primitive | Phase 2 |
| `fill_full_and_settle<O,W>()` | Atomic full fill + settlement | Phase 2 |
| `fill_partial_and_settle<O,W>()` | Atomic partial fill + settlement | Phase 2 |
| `withdraw<O,W>()` | Maker withdraws remaining, terminalizes | Phase 1 |
| `expire<O,W>()` | Permissionless expiry, returns to maker | Phase 1 |
| `remaining_amount<O,W>()` | View remaining balance | Phase 1 |
| `status<O,W>()` | View status | Phase 1 |
| `is_fillable<O,W>()` | View fillability | Phase 1 |
| `price_bounds<O,W>()` | View min/max price | Phase 1 |
| `maker<O,W>()` | View maker address | Phase 1 |
| **`quote_pay_amount<O,W>()`** | **Quote: fill_amount → payment (ceiling)** | **Phase 7** |
| **`quote_fill_amount<O,W>()`** | **Quote: pay_budget → max fill (floor)** | **Phase 7** |

### intent.move

| Function | Description |
|---|---|
| `create_price_bounded<R,P>()` | Create intent, escrow PayAsset |
| `execute_against_offer<R,P>()` | Execute against single offer (ExecutorCap, dual-sided price) |
| `cancel<R,P>()` | Creator cancels, returns escrow |
| `expire_intent<R,P>()` | Permissionless expiry, returns escrow |
| `is_pending<R,P>()` | View pending status |
| `creator<R,P>()` | View creator address |

### capability.move

| Function | Description |
|---|---|
| `mint_executor_cap()` | Mint ExecutorCap (requires AdminCap) |
| `destroy_executor_cap()` | Revoke/destroy cap |
| `transfer_executor_cap()` | Transfer cap |
| `transfer_admin_cap()` | Transfer AdminCap (caution) |

### pool.move

| Function | Description | Changed |
|---|---|---|
| `create<O,W>()` | Create empty pool | — |
| `add_offer<O,W>()` | Add offer ID to index | **Phase 7: emits event** |
| `remove_offer<O,W>()` | Remove offer ID from index | **Phase 7: emits event** |
| `offer_ids<O,W>()` | List all IDs | — |
| `size<O,W>()` | Pool size | — |
| `contains<O,W>()` | Membership check | — |

### events.move (Phase 7 additions)

| Event | When | Key Fields |
|---|---|---|
| **`OfferAddedToPool`** | Offer added to pool | pool_id, offer_id, added_by |
| **`OfferRemovedFromPool`** | Offer removed from pool | pool_id, offer_id, removed_by |

