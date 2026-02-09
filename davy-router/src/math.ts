/**
 * Davy Protocol — Deterministic Pricing Math
 *
 * These functions replicate the EXACT math from offer.move.
 * Any deviation means the router's quote won't match on-chain settlement.
 *
 * All prices: WantAsset per 1 OfferAsset, scaled by 1e9.
 * All arithmetic: BigInt to match Move's u128 intermediates.
 */

export const PRICE_SCALING_FACTOR = 1_000_000_000n;

/**
 * Calculate payment for a given fill amount and price.
 * Rounding: CEILING — taker never under-pays.
 *
 * Mirrors: offer::calc_payment() in offer.move
 */
export function calcPayment(fillAmount: bigint, price: bigint): bigint {
    const numerator = fillAmount * price;
    return (numerator + PRICE_SCALING_FACTOR - 1n) / PRICE_SCALING_FACTOR;
}

/**
 * Calculate effective price from payment and fill amounts.
 * Rounding: FLOOR — computed price never exceeds actual rate.
 *
 * Mirrors: offer::calculate_price() in offer.move
 */
export function calculatePrice(paymentAmount: bigint, fillAmount: bigint): bigint {
    return (paymentAmount * PRICE_SCALING_FACTOR) / fillAmount;
}

/**
 * Quote: how much WantAsset to pay for `fillAmount` of OfferAsset.
 * Rounding: CEILING.
 *
 * Mirrors: offer::quote_pay_amount() in offer.move
 * (without on-chain validation — caller handles constraints)
 */
export function quotePayAmount(fillAmount: bigint, price: bigint): bigint {
    return calcPayment(fillAmount, price);
}

/**
 * Quote: how much OfferAsset for a given WantAsset budget.
 * Rounding: FLOOR — never over-promises.
 * Clamped to `remaining`.
 *
 * Mirrors: offer::quote_fill_amount() in offer.move
 */
export function quoteFillAmount(
    payBudget: bigint,
    price: bigint,
    remaining: bigint,
): bigint {
    const fill = (payBudget * PRICE_SCALING_FACTOR) / price;
    return fill > remaining ? remaining : fill;
}

/**
 * Check dust constraint: would the fill leave a remainder below minFillAmount?
 */
export function wouldLeaveDust(
    remaining: bigint,
    fillAmount: bigint,
    minFillAmount: bigint,
): boolean {
    const wouldRemain = remaining - fillAmount;
    return wouldRemain > 0n && wouldRemain < minFillAmount;
}
