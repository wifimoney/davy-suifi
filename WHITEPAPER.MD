# Davy Protocol — Whitepaper

**Conditional Liquidity Coordination on Sui**

Version 1.0 — February 2026

---

## Abstract

Davy is a Sui-native coordination layer where liquidity is expressed as discrete on-chain objects with explicit lifecycle, conditional execution rules, and delegated intent fulfillment. Unlike AMMs that expose makers to curve dynamics, or orderbooks that require continuous matching infrastructure, Davy provides a minimal primitive: enforceable liquidity offers with maker-defined conditions, paired with escrowed execution intents that authorized agents can fulfill.

This paper describes the problem Davy addresses, its mechanism design, security model, and position within the Sui DeFi ecosystem.

---

## 1. The Problem

On-chain liquidity today is expressed through three dominant models, each with structural limitations.

**Automated Market Makers (AMMs)** provide instant swaps through mathematical pricing curves. Makers deposit into shared pools and accept implicit pricing — they cannot set explicit price bounds, enforce minimum fill sizes, or control partial fill behavior. Liquidity is continuous but undifferentiated: every unit of capital follows the same curve. For makers who want disciplined, conditional exposure, AMMs are a blunt instrument.

**Central Limit Order Books (CLOBs)** offer price-time priority and discrete limit orders. However, they require complex matching engine infrastructure, often with off-chain components for performance. On Sui, DeepBook provides shared-state orderbook functionality, but building on it means accepting its matching assumptions, market structure, and shared global state.

**OTC and P2P coordination** offers maximum flexibility — makers negotiate exact terms with counterparties. But this coordination happens off-chain (DMs, Telegram groups, manual agreements), is opaque to the rest of the ecosystem, non-composable, and unenforceable without trust.

The gap is clear: there is no minimal on-chain primitive that lets a maker say "trade X for Y within these exact conditions" and have those conditions be cryptographically enforceable, composable with other protocols, and visible to routers and aggregators.

---

## 2. The Davy Primitive

Davy fills this gap with two composable objects and a delegation model.

### 2.1 LiquidityOffer

A LiquidityOffer is a first-class Sui object that holds inventory (OfferAsset) and declares the conditions under which it can be consumed:

- **Price bounds** (min_price, max_price) — acceptable WantAsset-per-OfferAsset range, scaled by 1e9
- **Fill policy** — full-only or partial-allowed
- **Minimum fill amount** — prevents dust positions
- **Expiry timestamp** — automatic deadline enforcement via Sui Clock
- **Maker address** — only the maker can withdraw unfilled inventory

The object *is* the liquidity. There is no pool holding the funds, no curve computing the price, no matching engine deciding execution order. The offer exists as a standalone, auditable, fillable object.

### 2.2 ExecutionIntent

An ExecutionIntent is an escrowed request: "I want to receive X units of ReceiveAsset, and I'm willing to pay up to Y units of PayAsset, within these price bounds, before this deadline."

The intent escrows the taker's maximum payment on-chain. An authorized executor matches the intent against the best available offer. Settlement is atomic: the taker receives OfferAsset, the maker receives WantAsset, and any unused escrow is refunded — all in one transaction.

Intents are cancellable by the creator and expire automatically. In V1, each intent executes against exactly one offer (single-shot, no partial satisfaction, no multi-offer splitting).

### 2.3 Capability-Based Delegation

Execution authority is controlled by two capability objects:

- **AdminCap** — created at deployment, held by the protocol deployer. Used to mint ExecutorCaps.
- **ExecutorCap** — minted by AdminCap holder, granted to bots, DAOs, or relayers. Required to call `execute_against_offer`.

This model enables delegation without ACL lists. An ExecutorCap is a transferable, revocable Sui object. The holder can execute intents; the admin can destroy the cap to revoke access.

Direct fills (Path A) are permissionless — anyone can fill an offer. Intent execution (Path B) requires an ExecutorCap, creating a clean separation between open liquidity access and controlled execution delegation.

---

## 3. Lifecycle Model

### 3.1 Offer Lifecycle

Every offer follows a strict state machine:

```
Created → PartiallyFilled → Filled (terminal)
       → Filled (terminal)
       → Expired (terminal)
       → Withdrawn (terminal)

PartiallyFilled → Filled (terminal)
               → Expired (terminal)
               → Withdrawn (terminal)
```

No other transitions are allowed. Terminal states are enforced at the type level — once an offer reaches Filled, Expired, or Withdrawn, no further fills can occur.

### 3.2 Intent Lifecycle

```
Pending → Executed (terminal)
       → Cancelled (terminal)
       → Expired (terminal)
```

A pending intent can be executed exactly once, cancelled by its creator, or expired by anyone after the deadline. Executed intents record the offer used, amounts transferred, and effective price for auditability.

### 3.3 Event Completeness

Every state transition emits exactly one event. Off-chain systems reconstruct full protocol state from events alone, without object fetches. Events include asset type information (via Move's `type_name` module) so indexers can match offers to trading pairs without additional RPC calls.

---

## 4. Price Mechanism

Davy uses deterministic fixed-point arithmetic with 1e9 scaling.

**Canonical format:** Prices represent WantAsset per 1 OfferAsset, multiplied by 1,000,000,000.

**Payment calculation (ceiling rounding):**
```
payment = ⌈fill_amount × price / 1e9⌉
```
Ceiling rounding ensures the taker never under-pays. The maker always receives at least the proportional amount.

**Fill calculation (floor rounding):**
```
fill_amount = ⌊pay_budget × 1e9 / price⌋
```
Floor rounding ensures the protocol never over-promises. The taker receives at most what their budget affords.

All intermediate calculations use u128 to prevent overflow, then checked-downcast to u64. These rounding rules are deterministic — off-chain TypeScript mirrors produce identical results to on-chain Move functions, enabling routers to quote prices locally without transaction simulation.

---

## 5. Security Model

### 5.1 Invariants

The protocol enforces ten security invariants:

1. **Balance integrity.** Offer balance never exceeds initial deposit (enforced by Sui's Balance type).
2. **Monotonic status.** State transitions are one-directional; no state can revert to a previous state.
3. **Expiry enforcement.** Every fill operation checks the Clock. Expired offers abort.
4. **Dual-sided price validation.** Intent execution validates against both the offer's price bounds and the intent's price bounds.
5. **Escrow coverage.** Payment splits are checked arithmetically — the escrow always covers the settlement.
6. **Dust prevention.** Partial fills that would leave a remainder smaller than min_fill_amount are rejected.
7. **Maker-only withdrawal.** Sender address is checked against the stored maker address.
8. **Single-shot intents.** An intent can execute at most once, enforced by status and offer_used fields.
9. **Executor isolation.** Settlement routes funds only to maker and creator — executors cannot redirect funds.
10. **Capability gating.** Intent execution requires a valid ExecutorCap object reference.

### 5.2 Failure Modes

| Risk | Assessment | Mitigation |
|---|---|---|
| Reentrancy | Not applicable | Sui's object model eliminates EVM-style reentrancy |
| Front-running fills | Possible | Maker sets tight price bounds and minimum fill size |
| Stale pool references | Expected by design | Pools are non-authoritative; clients verify offer state |
| Clock manipulation | Low | Sui Clock is consensus-validated |
| Integer overflow | Low | All intermediates use u128 |
| Capability loss | Recoverable | AdminCap holder mints replacement ExecutorCaps |

---

## 6. Ecosystem Position

### 6.1 What Davy Is Not

Davy is not an AMM. It has no curves, no pooled liquidity, no impermanent loss. It is not a CLOB — there is no price-time priority, no matching engine, no shared global state. It is not a solver auction — there are no competitive bidding rounds, no off-chain MEV infrastructure.

Davy is a **coordination primitive**: discrete liquidity objects with lifecycle rules and delegated execution.

### 6.2 Relationship to Existing Infrastructure

**DeepBook** is a shared-state orderbook engine — a venue where orders match via price-time priority. DeepBook is infrastructure that other protocols build on.

**Aggregators** (Cetus Plus, 7K, FlowX) are routers that discover the best execution path across multiple venues. They query DeepBook, AMM pools, and other liquidity sources, then pick the cheapest route for the user.

**Davy** is a liquidity source that routers query alongside DeepBook and AMM pools. A router checks Davy's event-derived offer cache, compares prices against other venues, and picks the winner. If a Davy offer beats the AMM quote, the router fills the offer. If not, it routes elsewhere.

This positioning is complementary, not competitive. Davy adds a new category of liquidity — conditional, lifecycle-bound, maker-controlled — to the Sui ecosystem. The more venues a router can query, the better the execution for end users.

### 6.3 The Conditional Liquidity Gap

No existing Sui primitive expresses all of the following in a single enforceable object:

- Explicit price bounds (not curve-derived)
- Partial fill rules with minimum size
- Time-bound expiry
- Maker withdrawal rights
- Delegated execution via capability tokens
- Escrowed, cancellable intents

AMMs express pooled, curve-priced liquidity. CLOBs express price-time-priority orders. Davy expresses condition-bound, lifecycle-managed offers with intent-driven execution. These are three distinct models addressing different needs.

---

## 7. Product Layers

The Davy ecosystem ships as four layers:

**Layer 1: Davy Core** (on-chain Move). The published, immutable smart contract. Offers, intents, capabilities, events. This is what gets audited. This is the primitive.

**Layer 2: Davy Router** (off-chain TypeScript). An execution bot that monitors intents, queries Davy offers and external venues (via Cetus aggregator), compares prices, and executes the best path. Holds one or more ExecutorCaps.

**Layer 3: Cetus Aggregator** (external). Davy Router integrates Cetus aggregator for access to all Sui DEX liquidity — DeepBook, Cetus pools, Turbos, FlowX — through a single SDK. This gives Davy users best-execution across the entire ecosystem.

**Layer 4: Davy App** (frontend). A desktop-first trading terminal where makers create offers, takers fill directly or submit intents, and the router handles execution transparently.

---

## 8. Fee Model

**V1: Zero protocol fees.** The router operates on spread capture — it fills at the offer's minimum price and passes savings to the intent creator, keeping any spread between the offer's acceptance range and the actual fill price.

**V2 (planned): Executor tips.** An optional tip field on intents lets creators incentivize faster execution, creating a competitive market for executors without requiring protocol-level fee extraction.

---

## 9. Design Philosophy

Three principles guide every Davy design decision:

**Objects are the API.** The LiquidityOffer object is the liquidity. The ExecutionIntent object is the request. The ExecutorCap object is the permission. There are no hidden registries, no implicit state, no off-chain dependencies. Everything is on-chain, auditable, and composable.

**Lifecycle is explicit.** Every object has a defined state machine with enumerated transitions. Terminal states are enforced. Events trace every transition. An off-chain system can reconstruct the entire protocol history from events alone.

**Restraint is design.** V1 explicitly does not implement: AMM curves, orderbook matching, solver auctions, multi-offer intents, cross-pool routing, dynamic pricing, governance, or incentive emissions. Each omission is deliberate. The primitive must be minimal enough to audit, understand, and trust before complexity is added.

---

## 10. Roadmap

| Phase | Status | Description |
|---|---|---|
| 1–6 | Complete | Core protocol: offers, fills, intents, capabilities, pools, events, tests |
| 7 | Active | Router readiness: quote helpers, event enrichment, TypeScript router reference, documentation |
| 8 | Planned | Production router with Cetus aggregator integration |
| 9 | Planned | Davy App v1 (direct fills) |
| 10 | Planned | Davy App v2 (intent flow with comparison UI) |
| — | Planned | Security audit and mainnet deployment |

---

## 11. Conclusion

Davy introduces a category of on-chain liquidity that doesn't exist on Sui today: discrete, conditional, lifecycle-managed offers paired with escrowed, delegated execution intents. It is not a replacement for AMMs or orderbooks — it is a complementary primitive that gives makers explicit control and gives routers a new source of potentially better-priced liquidity.

The protocol is minimal by design. The six Move modules total under 2,000 lines. Every state transition is explicit, every event is complete, every invariant is enforced on-chain. This is a foundation that can be audited, understood, and built upon.