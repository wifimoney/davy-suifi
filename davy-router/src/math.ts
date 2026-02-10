/**
 * Davy Protocol — Phase 8: Math Module
 *
 * Bit-identical TypeScript mirrors of on-chain Move pricing functions.
 * These MUST produce identical results to the Move code or router
 * quotes will not match on-chain execution, causing TX failures.
 *
 * Price representation: WantAsset per 1 OfferAsset, scaled by 1e9.
 * Rounding: CEILING on payments (taker never under-pays),
 *           FLOOR on fill amounts (taker never over-receives).
 */

import { PRICE_SCALING } from './types.js';

// ============================================================
// Core Pricing Functions
// ============================================================

/**
 * Calculate payment required for a given fill amount.
 * Mirrors: offer::calc_payment(fill_amount, price) → payment
 *
 * Formula: payment = ceil(fill_amount * price / 1e9)
 * Rounding: CEILING — taker never under-pays
 */
export function calcPayment(fillAmount: bigint, price: bigint): bigint {
    if (fillAmount === 0n || price === 0n) return 0n;

    const numerator = fillAmount * price;
    const payment = ceilDiv(numerator, PRICE_SCALING);
    return payment;
}

/**
 * Calculate price from fill and payment amounts.
 * Mirrors: offer::calculate_price(fill_amount, payment) → price
 *
 * Formula: price = payment * 1e9 / fill_amount
 * Uses integer division (floor).
 */
export function calculatePrice(fillAmount: bigint, payment: bigint): bigint {
    if (fillAmount === 0n) return 0n;
    return (payment * PRICE_SCALING) / fillAmount;
}

/**
 * Quote: how much WantAsset must be paid for `fillAmount` of OfferAsset?
 * Mirrors: offer::quote_pay_amount(offer, fill_amount) → payment
 *
 * Uses the offer's max_price for ceiling calculation.
 * This is the WORST CASE payment (most expensive for the taker).
 */
export function quotePayAmount(
    fillAmount: bigint,
    maxPrice: bigint,
): bigint {
    return calcPayment(fillAmount, maxPrice);
}

/**
 * Quote: how much OfferAsset can be obtained for a given budget?
 * Mirrors: offer::quote_fill_amount(offer, budget) → fill_amount
 *
 * Formula: fill_amount = floor(budget * 1e9 / max_price)
 * Rounding: FLOOR — taker never over-receives.
 */
export function quoteFillAmount(
    budget: bigint,
    maxPrice: bigint,
): bigint {
    if (maxPrice === 0n) return 0n;
    return (budget * PRICE_SCALING) / maxPrice;
}

// ============================================================
// Dust Prevention
// ============================================================

/**
 * Check if a partial fill would leave dust (remainder < minFillAmount).
 * Mirrors the on-chain dust check in offer::fill_partial.
 *
 * A fill is rejected if:
 *   remainder > 0 AND remainder < min_fill_amount
 */
export function wouldLeaveDust(
    currentBalance: bigint,
    fillAmount: bigint,
    minFillAmount: bigint,
): boolean {
    if (fillAmount > currentBalance) return true; // Over-fill
    const remainder = currentBalance - fillAmount;
    return remainder > 0n && remainder < minFillAmount;
}

// ============================================================
// Price Validation
// ============================================================

/**
 * Check if an effective price falls within offer bounds.
 * Mirrors the on-chain price validation in offer::fill_full/fill_partial.
 */
export function priceWithinOfferBounds(
    effectivePrice: bigint,
    minPrice: bigint,
    maxPrice: bigint,
): boolean {
    return effectivePrice >= minPrice && effectivePrice <= maxPrice;
}

/**
 * Check if an effective price falls within intent bounds.
 * Mirrors the dual-sided validation in intent::execute_against_offer.
 */
export function priceWithinIntentBounds(
    effectivePrice: bigint,
    intentMinPrice: bigint,
    intentMaxPrice: bigint,
): boolean {
    return effectivePrice >= intentMinPrice && effectivePrice <= intentMaxPrice;
}

/**
 * Check if offer and intent price ranges overlap.
 * If they don't overlap, no execution is possible.
 */
export function priceRangesOverlap(
    offerMinPrice: bigint,
    offerMaxPrice: bigint,
    intentMinPrice: bigint,
    intentMaxPrice: bigint,
): boolean {
    return offerMinPrice <= intentMaxPrice && intentMinPrice <= offerMaxPrice;
}

// ============================================================
// Offer Scoring
// ============================================================

/**
 * Score an offer for routing priority.
 * Lower score = better for the taker.
 *
 * Score components:
 * 1. Price (lower is better for buyer)
 * 2. Available liquidity (more is better — fewer splits needed)
 * 3. Fill policy (full-only is simpler, partial is more flexible)
 */
export function scoreOffer(
    effectivePrice: bigint,
    availableBalance: bigint,
    desiredAmount: bigint,
    fillPolicy: number,
): number {
    // Price component: normalized to 0-1 range (lower price = lower score = better)
    const priceScore = Number(effectivePrice) / Number(PRICE_SCALING);

    // Liquidity component: penalty for insufficient liquidity
    const coverageRatio = Number(availableBalance) / Number(desiredAmount || 1n);
    const liquidityPenalty = coverageRatio >= 1.0 ? 0 : (1 - coverageRatio) * 0.5;

    // Fill policy bonus: partial fills get a small bonus for flexibility
    const policyBonus = fillPolicy > 0 ? -0.01 : 0;

    return priceScore + liquidityPenalty + policyBonus;
}

// ============================================================
// Utilities
// ============================================================

/** Ceiling division for bigint: ceil(a / b) */
export function ceilDiv(a: bigint, b: bigint): bigint {
    if (b === 0n) throw new Error('Division by zero');
    if (a === 0n) return 0n;
    return (a + b - 1n) / b;
}

/** Convert a human-readable amount to raw (with decimals) */
export function toRaw(amount: number, decimals: number): bigint {
    return BigInt(Math.round(amount * (10 ** decimals)));
}

/** Convert raw amount to human-readable */
export function fromRaw(amount: bigint, decimals: number): number {
    return Number(amount) / (10 ** decimals);
}

/** Format a Davy-scaled price as a human-readable string */
export function formatPrice(price: bigint, decimals: number = 4): string {
    const num = Number(price) / Number(PRICE_SCALING);
    return num.toFixed(decimals);
}
