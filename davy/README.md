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
