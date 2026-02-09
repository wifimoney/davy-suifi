# Davy Protocol — Litepaper

**Conditional Liquidity Coordination on Sui**

February 2026

---

## The Problem

DeFi liquidity on Sui is expressed through AMMs (curve-priced pools) or orderbooks (shared-state matching). Both serve their purpose, but neither lets a maker say:

*"Trade 1000 USDC for SUI at 1.95–2.05 per unit, partial fills allowed, minimum 100 USDC, expires in 24 hours, and let my bot handle execution."*

AMMs don't offer explicit price bounds or fill rules. Orderbooks require matching engine infrastructure. OTC deals happen off-chain and are non-composable.

**The gap:** no minimal on-chain primitive for conditional, lifecycle-managed liquidity with delegated execution.

---

## The Solution

Davy is a Sui-native coordination layer built on two objects and a delegation model.

**LiquidityOffer** — A Sui object that holds inventory and declares conditions: price bounds, fill policy, minimum size, expiry. The object *is* the liquidity. No pools. No curves.

**ExecutionIntent** — An escrowed request: "I want X tokens, I'll pay up to Y, within these price bounds, before this deadline." An authorized executor matches it against the best offer. Settlement is atomic.

**ExecutorCap** — A transferable capability that authorizes bots, DAOs, or relayers to execute intents. Minted by the protocol admin. Revocable.

Direct fills are permissionless. Intent execution is delegated. Both are on-chain, auditable, and composable.

---

## How It Works

**For Makers:**
Create an offer → set price bounds → set fill rules → deposit tokens → done.
The offer sits on-chain until filled, expired, or withdrawn. Maker retains full control.

**For Takers (Direct):**
Find an offer → fill it → settlement is instant and atomic. Zero slippage — the price is what the maker posted.

**For Takers (Intent):**
Submit an intent → escrow payment → router finds the best price (Davy offer vs. AMM vs. orderbook) → executor fills → taker receives tokens + refund of unused escrow.

---

## Why Routers Care

Aggregators like Cetus Plus, 7K, and FlowX route trades across multiple venues for best execution. Davy gives them a new liquidity source:

- **Better prices.** Maker posts USDC→SUI at 1.95. AMM quotes 2.01 with slippage. Router picks Davy.
- **Zero slippage.** The quoted price is the execution price. No curve dynamics.
- **Low integration cost.** ~200 lines of TypeScript: subscribe to events, mirror two math functions, add one `moveCall`.

Davy doesn't replace AMMs or orderbooks. It complements them. The more venues a router queries, the better the execution for users.

---

## Ecosystem Position

```
┌──────────────────────────────────────────────────┐
│  Aggregators (Cetus, 7K, FlowX)                 │
│  Route across all venues for best execution      │
├──────────┬───────────────┬───────────────────────┤
│ DeepBook │  AMM Pools    │  Davy Protocol        │
│ Orderbook│  Curve-priced │  Conditional offers    │
│ engine   │  liquidity    │  + intent execution    │
├──────────┴───────────────┴───────────────────────┤
│  Sui Network                                      │
└──────────────────────────────────────────────────┘
```

**DeepBook** = venue (orderbook engine).
**AMMs** = venues (pooled curves).
**Davy** = coordination primitive (discrete offers with lifecycle + intents).
**Aggregators** = routers (pick the best venue for each trade).

---

## Technical Highlights

- **Six Move modules**, under 2,000 lines total. Minimal, auditable surface.
- **Deterministic pricing.** 1e9-scaled fixed-point arithmetic. Ceiling rounding on payments, floor rounding on fills. TypeScript mirrors produce identical results.
- **Event-only reconstruction.** Off-chain systems rebuild full protocol state from events — no object fetches required.
- **Dual-sided price validation.** Intent execution checks both offer and intent price bounds atomically.
- **Zero external dependencies.** Davy Core imports only the Sui framework. No awareness of any external venue.
- **Capability-based security.** Two objects (AdminCap, ExecutorCap) control all permissions. No ACL lists.

---

## Product Layers

| Layer | What | Status |
|---|---|---|
| **Davy Core** | On-chain Move contracts — the primitive | Phases 1–6 complete |
| **Davy Router** | Off-chain execution bot — compares Davy vs. external venues | In development |
| **Davy App** | Desktop trading terminal — create offers, fill, submit intents | Planned |
| **Davy SDK** | TypeScript library — event parsing, math, PTB builder | In development |

---

## V1 Non-Goals

Davy V1 explicitly does not implement: AMM curves, orderbook matching, solver auctions, multi-offer intents, cross-pool routing, dynamic pricing, governance, or incentive emissions.

Restraint is part of the design. The primitive must be minimal enough to audit, understand, and trust before complexity is added.

---

## What's Next

- **Phase 7 (Active):** Router readiness — quote helpers, enriched events, TypeScript router reference
- **Phase 8:** Production router with Cetus aggregator integration for best-execution across all Sui DEXs
- **Phase 9–10:** Davy App with direct fill and intent comparison flows
- **Audit and mainnet deployment**

---

## Links

- Repository: [github.com/davy-protocol/davy](https://github.com/davy-protocol/davy)
- Technical Paper: [docs/technical-paper.md](docs/technical-paper.md)
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)
- Router Integration Spec: [docs/integration-spec.md](docs/integration-spec.md)