# Davy Protocol — Technical Specification

**Version 1.0 — February 2026**

**Audience:** Smart contract auditors, protocol engineers, Move developers, router/aggregator integrators

---

## 1. Overview

This document is the complete technical specification for Davy Protocol V1 — a Sui-native conditional liquidity coordination primitive. It covers all data structures, state machines, arithmetic, error handling, event schemas, and security invariants at implementation depth.

The protocol consists of six Move modules deployed as a single Sui package:

| Module | Responsibility | LOC (approx) |
|---|---|---|
| `errors.move` | Centralized abort codes | ~30 |
| `events.move` | Event struct definitions + emitters | ~120 |
| `capability.move` | AdminCap, ExecutorCap lifecycle | ~80 |
| `offer.move` | LiquidityOffer + fills + settlement + quotes | ~400 |
| `intent.move` | ExecutionIntent + execution + settlement | ~250 |
| `pool.move` | CoordinationPool (index only) | ~80 |

Package dependency: `Sui` framework (mainnet-v1.25.0).

---

## 2. Data Structures

### 2.1 LiquidityOffer\<OfferAsset, WantAsset\>

```move
public struct LiquidityOffer<phantom OfferAsset, phantom WantAsset> has key, store {
    id: UID,

    // Liquidity — the object holds inventory
    offer_balance: Balance<OfferAsset>,
    initial_offer_amount: u64,

    // Pricing — fixed-point, no curves
    min_price: u64,        // Minimum acceptable price (1e9-scaled)
    max_price: u64,        // Maximum acceptable price (1e9-scaled)

    // Lifecycle
    status: u8,            // 0=Created, 1=PartiallyFilled, 2=Filled, 3=Expired, 4=Withdrawn
    expiry_timestamp_ms: u64,

    // Fill policy
    fill_policy: u8,       // 0=FullOnly, 1=PartialAllowed
    min_fill_amount: u64,  // Minimum fill to prevent dust

    // Accounting
    total_filled: u64,
    fill_count: u64,

    // Ownership
    maker: address,
}
```

**Type parameters:** `OfferAsset` is the token the maker deposits (what takers receive). `WantAsset` is the token the maker wants in return (what takers pay). Both are phantom types — the offer object is generic over any Sui coin type.

**Status constants:**

| Value | Name | Terminal | Description |
|---|---|---|---|
| 0 | STATUS_CREATED | No | Initial state after creation |
| 1 | STATUS_PARTIALLY_FILLED | No | At least one partial fill executed |
| 2 | STATUS_FILLED | Yes | All inventory consumed |
| 3 | STATUS_EXPIRED | Yes | Clock passed expiry_timestamp_ms |
| 4 | STATUS_WITHDRAWN | Yes | Maker reclaimed remaining inventory |

**Fill policy constants:**

| Value | Name | Description |
|---|---|---|
| 0 | FILL_POLICY_FULL_ONLY | Only full fills accepted |
| 1 | FILL_POLICY_PARTIAL_ALLOWED | Partial and full fills accepted |

### 2.2 ExecutionIntent\<ReceiveAsset, PayAsset\>

```move
public struct ExecutionIntent<phantom ReceiveAsset, phantom PayAsset> has key, store {
    id: UID,

    // Desired outcome
    receive_amount: u64,       // Exact amount of ReceiveAsset wanted
    max_pay_amount: u64,       // Maximum PayAsset willing to spend

    // Price condition
    min_price: u64,            // Minimum acceptable price (1e9-scaled)
    max_price: u64,            // Maximum acceptable price (1e9-scaled)

    // Lifecycle
    status: u8,                // 0=Pending, 1=Executed, 2=Cancelled, 3=Expired
    expiry_timestamp_ms: u64,

    // Ownership
    creator: address,

    // Escrow
    escrowed_payment: Balance<PayAsset>,

    // Execution record
    offer_used: Option<ID>,    // Which offer satisfied this intent
    amount_received: u64,      // Actual ReceiveAsset delivered
    amount_paid: u64,          // Actual PayAsset consumed
}
```

**Matching rule:** `LiquidityOffer<O, W>` matches `ExecutionIntent<O, W>`. The intent creator receives O (OfferAsset) and pays W (WantAsset). Same generic order, different semantic roles.

**Status constants:**

| Value | Name | Terminal | Description |
|---|---|---|---|
| 0 | INTENT_STATUS_PENDING | No | Awaiting execution |
| 1 | INTENT_STATUS_EXECUTED | Yes | Successfully matched and settled |
| 2 | INTENT_STATUS_CANCELLED | Yes | Creator cancelled, escrow returned |
| 3 | INTENT_STATUS_EXPIRED | Yes | Clock passed expiry, escrow returned |

### 2.3 Capabilities

```move
public struct AdminCap has key, store {
    id: UID,
}

public struct ExecutorCap has key, store {
    id: UID,
    label: vector<u8>,     // Human-readable identifier
    minted_by: address,    // Admin who created this cap
}
```

AdminCap is created once during module `init()`. ExecutorCaps are minted by the AdminCap holder and can be transferred or destroyed.

### 2.4 CoordinationPool\<OfferAsset, WantAsset\>

```move
public struct CoordinationPool<phantom OfferAsset, phantom WantAsset> has key, store {
    id: UID,
    name: vector<u8>,
    offer_ids: VecSet<ID>,  // Index only — no balances
    creator: address,
}
```

Pools are non-authoritative indexes. They hold references (offer IDs), not liquidity. Clients must verify offer state directly — stale references are expected.

---

## 3. State Machines

### 3.1 Offer State Machine

```
           ┌── partial_fill ──► PartiallyFilled ──┬── fill ──► Filled
           │                                       ├── expire ──► Expired
Created ───┼── fill ──────────────────────────────────────────► Filled
           ├── expire ────────────────────────────────────────► Expired
           └── withdraw ──────────────────────────────────────► Withdrawn
                                 PartiallyFilled ──└── withdraw ──► Withdrawn
```

**Transition enforcement:** Every function that modifies offer status checks the current status against the allowed source states. Invalid transitions abort with `E_INVALID_STATUS_TRANSITION`.

**Terminal enforcement:** Functions that require a fillable offer check `status ∈ {0, 1}` AND `expiry_timestamp_ms > clock.timestamp_ms()`.

### 3.2 Intent State Machine

```
Pending ──┬── execute ──► Executed
          ├── cancel ───► Cancelled
          └── expire ───► Expired
```

All transitions from Pending are one-way and mutually exclusive.

---

## 4. Arithmetic Specification

### 4.1 Price Representation

All prices use a fixed-point format with 1e9 scaling factor.

```
PRICE_SCALING = 1_000_000_000

price = (want_amount × PRICE_SCALING) / offer_amount
```

A `price` of `2_000_000_000` means "2 WantAsset per 1 OfferAsset."

### 4.2 Payment Calculation (Ceiling Rounding)

Given a fill amount (OfferAsset units) and price, compute the payment (WantAsset units):

```
payment = ⌈fill_amount × price / PRICE_SCALING⌉
```

Implementation using integer arithmetic:

```move
let payment = (
    (fill_amount as u128) * (price as u128) + (PRICE_SCALING as u128) - 1
) / (PRICE_SCALING as u128);
assert!(payment <= (MAX_U64 as u128), E_OVERFLOW);
(payment as u64)
```

**Rationale:** Ceiling rounding ensures the taker never under-pays. The maker always receives at least the proportional amount. This is the conservative direction for the protocol.

### 4.3 Fill Calculation (Floor Rounding)

Given a payment budget (WantAsset units) and price, compute the maximum fill amount (OfferAsset units):

```
fill_amount = ⌊pay_budget × PRICE_SCALING / price⌋
```

Implementation:

```move
let raw = (
    (pay_budget as u128) * (PRICE_SCALING as u128)
) / (price as u128);
let clamped = if (raw < (remaining as u128)) { raw } else { (remaining as u128) };
(clamped as u64)
```

**Rationale:** Floor rounding ensures the protocol never over-promises. The taker receives at most what their budget affords, clamped to the offer's remaining balance.

### 4.4 Dust Prevention

A partial fill is rejected if it would leave a remainder smaller than the offer's `min_fill_amount`:

```move
let after = remaining - fill_amount;
if (after > 0 && after < offer.min_fill_amount) {
    abort E_WOULD_LEAVE_DUST
};
```

This prevents offers from becoming unfillable due to tiny remainders.

### 4.5 TypeScript Mirror

Off-chain systems must produce identical results:

```typescript
const PRICE_SCALING = 1_000_000_000n;

function quotePayAmount(fillAmount: bigint, price: bigint): bigint {
  return (fillAmount * price + PRICE_SCALING - 1n) / PRICE_SCALING;
}

function quoteFillAmount(payBudget: bigint, price: bigint, remaining: bigint): bigint {
  const raw = (payBudget * PRICE_SCALING) / price;
  return raw < remaining ? raw : remaining;
}

function wouldLeaveDust(remaining: bigint, fillAmount: bigint, minFillAmount: bigint): boolean {
  const after = remaining - fillAmount;
  return after > 0n && after < minFillAmount;
}
```

These functions are deterministic. Given the same inputs, the TypeScript and Move implementations produce the same output. Routers use the TypeScript functions for local quoting and rely on the Move functions for on-chain verification.

---

## 5. Function Specifications

### 5.1 offer::create\<O, W\>

**Signature:**
```move
public fun create<O, W>(
    offer_coin: Coin<O>,
    min_price: u64,
    max_price: u64,
    fill_policy: u8,
    min_fill_amount: u64,
    expiry_timestamp_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): LiquidityOffer<O, W>
```

**Preconditions:**
- `coin::value(&offer_coin) > 0` — non-zero deposit
- `min_price > 0 && min_price <= max_price` — valid price range
- `fill_policy ∈ {0, 1}` — valid policy
- `min_fill_amount > 0 && min_fill_amount <= coin::value(&offer_coin)` — valid minimum
- `expiry_timestamp_ms > clock.timestamp_ms()` — future expiry

**Effects:** Creates a new LiquidityOffer object, transfers OfferAsset into its balance, emits `OfferCreated` event.

### 5.2 offer::fill_full_and_settle\<O, W\>

**Signature:**
```move
public fun fill_full_and_settle<O, W>(
    offer: &mut LiquidityOffer<O, W>,
    payment: Coin<W>,
    price: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<O>, Coin<W>)
```

**Preconditions:**
- Offer is fillable (status ∈ {0, 1}, not expired)
- `price >= offer.min_price && price <= offer.max_price`
- Payment covers `⌈remaining × price / 1e9⌉`

**Effects:** Fills entire remaining balance, transitions to Filled, returns (OfferAsset coin to taker, excess WantAsset to taker). Maker receives payment via `transfer::public_transfer`. Emits `OfferFilled`.

### 5.3 offer::fill_partial_and_settle\<O, W\>

**Signature:**
```move
public fun fill_partial_and_settle<O, W>(
    offer: &mut LiquidityOffer<O, W>,
    payment: Coin<W>,
    fill_amount: u64,
    price: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<O>, Coin<W>)
```

**Additional preconditions:**
- `offer.fill_policy == FILL_POLICY_PARTIAL_ALLOWED`
- `fill_amount >= offer.min_fill_amount`
- `fill_amount <= remaining`
- Would not leave dust

### 5.4 offer::quote_pay_amount\<O, W\>

**Signature:**
```move
public fun quote_pay_amount<O, W>(
    offer: &LiquidityOffer<O, W>,
    fill_amount: u64,
    price: u64,
    clock: &Clock,
): u64
```

**Pure view function.** Returns the WantAsset payment required for a given fill amount at a given price. Aborts if the offer is not fillable, the price is out of bounds, or the fill would leave dust. Does not modify state.

### 5.5 offer::quote_fill_amount\<O, W\>

**Signature:**
```move
public fun quote_fill_amount<O, W>(
    offer: &LiquidityOffer<O, W>,
    pay_budget: u64,
    price: u64,
    clock: &Clock,
): u64
```

**Pure view function.** Returns the maximum OfferAsset fill amount for a given WantAsset budget. Clamped to remaining balance. Aborts if offer is not fillable or price is out of bounds.

### 5.6 intent::create_price_bounded\<R, P\>

**Signature:**
```move
public fun create_price_bounded<R, P>(
    payment_coin: Coin<P>,
    receive_amount: u64,
    min_price: u64,
    max_price: u64,
    expiry_timestamp_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ExecutionIntent<R, P>
```

**Effects:** Escrows payment coin into intent, emits `IntentSubmitted` with asset type information.

### 5.7 intent::execute_against_offer\<R, P\>

**Signature:**
```move
public fun execute_against_offer<R, P>(
    intent: &mut ExecutionIntent<R, P>,
    offer: &mut LiquidityOffer<R, P>,
    _executor_cap: &ExecutorCap,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

**Preconditions:**
- Intent is pending
- Offer is fillable
- Neither is expired
- **Dual-sided price validation:** effective price must satisfy BOTH offer.min_price..offer.max_price AND intent.min_price..intent.max_price

**Settlement:**
1. Compute payment = ⌈intent.receive_amount × effective_price / 1e9⌉
2. Split payment from escrowed balance
3. Transfer ReceiveAsset (from offer) to intent creator
4. Transfer PayAsset (from escrow) to offer maker
5. Refund remaining escrow to intent creator
6. Update both objects' status and accounting fields
7. Emit `OfferFilled` + `IntentExecuted`

---

## 6. Error Codes

All abort codes are centralized in `errors.move`:

| Code | Name | Description |
|---|---|---|
| 1 | E_INVALID_PRICE_RANGE | min_price > max_price or min_price == 0 |
| 2 | E_INVALID_FILL_POLICY | fill_policy not 0 or 1 |
| 3 | E_ZERO_AMOUNT | Zero deposit or zero fill amount |
| 4 | E_EXPIRED | Expiry timestamp has passed |
| 5 | E_NOT_EXPIRED | Attempting to expire before deadline |
| 6 | E_OFFER_NOT_FILLABLE | Offer in terminal state |
| 7 | E_PRICE_TOO_LOW | Price below offer's min_price |
| 8 | E_PRICE_TOO_HIGH | Price above offer's max_price |
| 9 | E_INSUFFICIENT_PAYMENT | Payment doesn't cover fill amount |
| 10 | E_WOULD_LEAVE_DUST | Partial fill leaves remainder below min_fill_amount |
| 11 | E_FILL_AMOUNT_TOO_SMALL | Fill amount below min_fill_amount |
| 12 | E_FILL_AMOUNT_TOO_LARGE | Fill amount exceeds remaining |
| 13 | E_PARTIAL_FILL_NOT_ALLOWED | fill_policy is FullOnly but partial fill attempted |
| 14 | E_NOT_MAKER | Sender is not the offer maker |
| 15 | E_INTENT_NOT_PENDING | Intent in terminal state |
| 16 | E_NOT_INTENT_CREATOR | Sender is not the intent creator |
| 17 | E_PRICE_MISMATCH | Effective price outside intent's bounds |
| 18 | E_OVERFLOW | u128 to u64 downcast would overflow |
| 19 | E_INVALID_STATUS_TRANSITION | State machine violation |
| 20 | E_EXPIRY_IN_PAST | Expiry timestamp is not in the future |
| 21 | E_MIN_FILL_TOO_LARGE | min_fill_amount exceeds deposit amount |

---

## 7. Event Schema

### 7.1 Offer Events

**OfferCreated:**
```move
public struct OfferCreated has copy, drop {
    offer_id: ID,
    maker: address,
    offer_asset_type: TypeName,      // std::type_name::get<O>()
    want_asset_type: TypeName,       // std::type_name::get<W>()
    initial_offer_amount: u64,
    min_price: u64,
    max_price: u64,
    fill_policy: u8,
    min_fill_amount: u64,
    expiry_timestamp_ms: u64,
}
```

**OfferFilled:**
```move
public struct OfferFilled has copy, drop {
    offer_id: ID,
    taker: address,
    fill_amount: u64,
    payment_amount: u64,
    price: u64,
    remaining_amount: u64,
    is_full_fill: bool,
    new_status: u8,
}
```

**OfferWithdrawn:**
```move
public struct OfferWithdrawn has copy, drop {
    offer_id: ID,
    maker: address,
    remaining_amount_returned: u64,
    total_filled: u64,
    fill_count: u64,
}
```

**OfferExpired:**
```move
public struct OfferExpired has copy, drop {
    offer_id: ID,
    remaining_amount_returned: u64,
    total_filled: u64,
    fill_count: u64,
}
```

### 7.2 Intent Events

**IntentSubmitted:**
```move
public struct IntentSubmitted has copy, drop {
    intent_id: ID,
    creator: address,
    receive_asset_type: TypeName,
    pay_asset_type: TypeName,
    receive_amount: u64,
    max_pay_amount: u64,
    escrowed_amount: u64,
    min_price: u64,
    max_price: u64,
    expiry_timestamp_ms: u64,
}
```

**IntentExecuted:**
```move
public struct IntentExecuted has copy, drop {
    intent_id: ID,
    executor: address,
    offer_used: ID,
    amount_received: u64,
    amount_paid: u64,
    effective_price: u64,
    refund_amount: u64,
}
```

**IntentCancelled / IntentExpired:**
```move
public struct IntentCancelled has copy, drop {
    intent_id: ID,
    creator: address,
    refund_amount: u64,
}

public struct IntentExpired has copy, drop {
    intent_id: ID,
    creator: address,
    refund_amount: u64,
}
```

### 7.3 Capability Events

```move
public struct AdminCapCreated has copy, drop {
    cap_id: ID,
    owner: address,
}

public struct ExecutorCapMinted has copy, drop {
    cap_id: ID,
    recipient: address,
    label: vector<u8>,
    minted_by: address,
}

public struct ExecutorCapDestroyed has copy, drop {
    cap_id: ID,
}
```

### 7.4 Pool Events

```move
public struct OfferAddedToPool has copy, drop {
    pool_id: ID,
    offer_id: ID,
}

public struct OfferRemovedFromPool has copy, drop {
    pool_id: ID,
    offer_id: ID,
}
```

---

## 8. Permission Matrix

| Action | Requires | On Failure |
|---|---|---|
| Create offer | Anyone (has coins) | — |
| Fill offer (direct) | Anyone (has coins) | — |
| Withdraw offer | Maker (sender == offer.maker) | E_NOT_MAKER |
| Expire offer | Anyone (clock >= expiry) | E_NOT_EXPIRED |
| Create intent | Anyone (has coins) | — |
| Cancel intent | Creator (sender == intent.creator) | E_NOT_INTENT_CREATOR |
| Expire intent | Anyone (clock >= expiry) | E_NOT_EXPIRED |
| Execute intent | ExecutorCap holder | Move type-check |
| Mint ExecutorCap | AdminCap holder | Move type-check |
| Destroy ExecutorCap | Cap holder | Move ownership |
| Create pool | Anyone | — |
| Add/remove offer from pool | Anyone (has pool + offer refs) | — |

---

## 9. Router Integration Interface

### 9.1 Discovery

Routers reconstruct Davy state from events only. The `OfferCreated` event includes `offer_asset_type` and `want_asset_type` as `TypeName` values, enabling pair matching without object fetches.

**Cache shape:**
```typescript
interface CachedOffer {
  offerId: string;
  offerAssetType: string;
  wantAssetType: string;
  remainingAmount: bigint;
  minPrice: bigint;
  maxPrice: bigint;
  fillPolicy: 'full_only' | 'partial_allowed';
  minFillAmount: bigint;
  expiryTimestampMs: bigint;
  status: 'created' | 'partially_filled' | 'filled' | 'expired' | 'withdrawn';
}
```

### 9.2 Quote

Routers use the TypeScript math mirrors (Section 4.5) for local quoting. On-chain quote functions (Section 5.4, 5.5) exist for verification and PTB composition.

### 9.3 Execute

Routers build Programmable Transaction Blocks (PTBs) calling `fill_full_and_settle` or `fill_partial_and_settle`. For intent execution, the router calls `execute_against_offer` with its ExecutorCap.

---

## 10. Test Coverage

The test suite covers:

- **offer_tests.move:** Create, fill (full/partial), withdraw, expire, price validation, dust prevention, fill policy enforcement, status transitions, settlement correctness
- **intent_tests.move:** Create, execute, cancel, expire, dual-sided price validation, escrow accounting, refund correctness, single-shot enforcement
- **capability_tests.move:** AdminCap creation, ExecutorCap mint/transfer/destroy, permission gating
- **integration_tests.move:** End-to-end flows: create offer → create intent → execute → verify settlements; multi-fill sequences; expiry races; edge cases

---

## 11. Dependencies

```toml
[package]
name = "davy"
version = "0.1.0"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "mainnet-v1.25.0" }

[addresses]
davy = "0x0"
```

Single dependency: Sui framework. No external protocol imports. Davy Core has zero awareness of Cetus, DeepBook, or any other venue.