/**
 * Davy Protocol — Phase 8: DeepBook V3 Adapter
 *
 * Production adapter for DeepBook V3 on Sui.
 * Provides quoting (book-walk simulation) and PTB fragment generation
 * for atomic execution within the Davy router.
 *
 * SDK: @mysten/deepbook-v3
 * Docs: https://docs.sui.io/standards/deepbookv3-sdk
 */

import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import { ExternalPriceSource, PTBFragment, VenueQuote } from './types.js';

// ============================================================
// Constants
// ============================================================

const PRICE_SCALING = 1_000_000_000n; // Davy's 1e9 price scaling

/** Known DeepBook pool keys (mainnet). Extend as pools are added. */
export const DEEPBOOK_POOLS: Record<string, DeepBookPoolConfig> = {
    'SUI_USDC': {
        poolKey: 'SUI_DBUSDC',
        baseAsset: '0x2::sui::SUI',
        quoteAsset: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
        baseDecimals: 9,
        quoteDecimals: 6,
    },
    'DEEP_SUI': {
        poolKey: 'DEEP_SUI',
        baseAsset: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
        quoteAsset: '0x2::sui::SUI',
        baseDecimals: 6,
        quoteDecimals: 9,
    },
    'DEEP_USDC': {
        poolKey: 'DEEP_DBUSDC',
        baseAsset: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
        quoteAsset: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
        baseDecimals: 6,
        quoteDecimals: 6,
    },
};

// ============================================================
// Types
// ============================================================

export interface DeepBookPoolConfig {
    poolKey: string;
    baseAsset: string;
    quoteAsset: string;
    baseDecimals: number;
    quoteDecimals: number;
}

export interface DeepBookLevel2 {
    bidPrices: number[];
    bidQuantities: number[];
    askPrices: number[];
    askQuantities: number[];
}

export interface DeepBookQuoteResult {
    baseOut: number;
    quoteOut: number;
    deepRequired: number;
}

// ============================================================
// Adapter
// ============================================================

export class DeepBookV3Adapter implements ExternalPriceSource {
    name = 'deepbook';

    private client: SuiClient;
    private dbClient: any; // DeepBookClient — lazily initialized
    private env: 'testnet' | 'mainnet';
    private senderAddress: string;
    private poolConfigCache: Map<string, DeepBookPoolConfig> = new Map();
    private initialized = false;

    constructor(config: {
        client: SuiClient;
        env: 'testnet' | 'mainnet';
        senderAddress: string;
    }) {
        this.client = config.client;
        this.env = config.env;
        this.senderAddress = config.senderAddress;

        // Pre-load known pools
        for (const [key, pool] of Object.entries(DEEPBOOK_POOLS)) {
            this.poolConfigCache.set(key, pool);
        }
    }

    // --------------------------------------------------------
    // Initialization
    // --------------------------------------------------------

    private async ensureSDK(): Promise<boolean> {
        if (this.initialized && this.dbClient) return true;
        try {
            const { DeepBookClient } = await import('@mysten/deepbook-v3');
            this.dbClient = new DeepBookClient({
                address: this.senderAddress,
                env: this.env,
                client: this.client as any,
            });
            this.initialized = true;
            return true;
        } catch {
            // SDK not installed — adapter disabled
            return false;
        }
    }

    // --------------------------------------------------------
    // Pool Discovery
    // --------------------------------------------------------

    /**
     * Find the DeepBook pool config for a given asset pair.
     * Returns null if no pool exists for this pair.
     */
    findPool(assetA: string, assetB: string): DeepBookPoolConfig | null {
        for (const pool of this.poolConfigCache.values()) {
            if (
                (pool.baseAsset === assetA && pool.quoteAsset === assetB) ||
                (pool.baseAsset === assetB && pool.quoteAsset === assetA)
            ) {
                return pool;
            }
        }
        return null;
    }

    /**
     * Register a custom pool configuration.
     * Use for pairs not in the default DEEPBOOK_POOLS map.
     */
    registerPool(key: string, config: DeepBookPoolConfig): void {
        this.poolConfigCache.set(key, config);
    }

    // --------------------------------------------------------
    // Level 2 Book Reading
    // --------------------------------------------------------

    /**
     * Get the level 2 order book snapshot for a pool.
     * Returns bid/ask prices and quantities around the mid price.
     */
    async getLevel2(poolKey: string, ticks: number = 20): Promise<DeepBookLevel2 | null> {
        const ready = await this.ensureSDK();
        if (!ready) return null;

        try {
            const result = await this.dbClient.getLevel2TicksFromMid({ poolKey, ticks });
            return {
                bidPrices: result.bid_prices ?? result.bidPrices ?? [],
                bidQuantities: result.bid_quantities ?? result.bidQuantities ?? [],
                askPrices: result.ask_prices ?? result.askPrices ?? [],
                askQuantities: result.ask_quantities ?? result.askQuantities ?? [],
            };
        } catch {
            return null;
        }
    }

    /**
     * Walk the ask side of the book to compute the effective cost
     * of buying `baseAmount` of base asset.
     *
     * Returns the total quote cost and the volume-weighted average price.
     * This is a local simulation — no gas, no DEEP fees included.
     */
    walkAsks(
        book: DeepBookLevel2,
        baseAmount: number,
    ): { totalQuoteCost: number; vwap: number; filled: number } | null {
        let remaining = baseAmount;
        let totalCost = 0;

        for (let i = 0; i < book.askPrices.length; i++) {
            if (remaining <= 0) break;

            const price = book.askPrices[i];
            const qty = book.askQuantities[i];
            const fillQty = Math.min(remaining, qty);

            totalCost += fillQty * price;
            remaining -= fillQty;
        }

        if (remaining > 0) return null; // Insufficient liquidity

        const filled = baseAmount - remaining;
        return {
            totalQuoteCost: totalCost,
            vwap: totalCost / filled,
            filled,
        };
    }

    /**
     * Walk the bid side of the book to compute the effective proceeds
     * of selling `baseAmount` of base asset.
     */
    walkBids(
        book: DeepBookLevel2,
        baseAmount: number,
    ): { totalQuoteProceeds: number; vwap: number; filled: number } | null {
        let remaining = baseAmount;
        let totalProceeds = 0;

        for (let i = 0; i < book.bidPrices.length; i++) {
            if (remaining <= 0) break;

            const price = book.bidPrices[i];
            const qty = book.bidQuantities[i];
            const fillQty = Math.min(remaining, qty);

            totalProceeds += fillQty * price;
            remaining -= fillQty;
        }

        if (remaining > 0) return null; // Insufficient liquidity

        const filled = baseAmount - remaining;
        return {
            totalQuoteProceeds: totalProceeds,
            vwap: totalProceeds / filled,
            filled,
        };
    }

    // --------------------------------------------------------
    // ExternalPriceSource Implementation
    // --------------------------------------------------------

    /**
     * Get effective price from DeepBook for a given asset pair and amount.
     *
     * Implements ExternalPriceSource.getPrice():
     *   - receiveAssetType: the asset the user wants to receive
     *   - payAssetType: the asset the user pays with
     *   - receiveAmount: how much of receiveAsset the user wants
     *
     * Returns the Davy-scaled price (payAmount * 1e9 / receiveAmount),
     * or null if no liquidity.
     */
    async getPrice(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
    ): Promise<bigint | null> {
        const ready = await this.ensureSDK();
        if (!ready) return null;

        const pool = this.findPool(receiveAssetType, payAssetType);
        if (!pool) return null;

        try {
            // Determine direction: are we buying base or selling base?
            const buyingBase = pool.baseAsset === receiveAssetType;

            if (buyingBase) {
                // User wants base, pays quote → swapExactQuoteForBase dry run
                // Use getQuoteQuantityOut to estimate: how much quote for X base?
                const baseHuman = Number(receiveAmount) / (10 ** pool.baseDecimals);
                const result: DeepBookQuoteResult = await this.dbClient.getQuoteQuantityOut({
                    poolKey: pool.poolKey,
                    baseQuantity: baseHuman,
                });

                if (!result || result.quoteOut <= 0) return null;

                // Convert to Davy price format: payAmount * 1e9 / receiveAmount
                const quoteRaw = BigInt(Math.ceil(result.quoteOut * (10 ** pool.quoteDecimals)));
                return (quoteRaw * PRICE_SCALING) / receiveAmount;
            } else {
                // User wants quote, pays base → swapExactBaseForQuote dry run
                const quoteHuman = Number(receiveAmount) / (10 ** pool.quoteDecimals);
                const result: DeepBookQuoteResult = await this.dbClient.getBaseQuantityOut({
                    poolKey: pool.poolKey,
                    quoteQuantity: quoteHuman,
                });

                if (!result || result.baseOut <= 0) return null;

                const baseRaw = BigInt(Math.ceil(result.baseOut * (10 ** pool.baseDecimals)));
                return (baseRaw * PRICE_SCALING) / receiveAmount;
            }
        } catch {
            return null;
        }
    }

    /**
     * Get a detailed quote with all information needed for execution.
     * Returns null if no liquidity available.
     */
    async getDetailedQuote(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
    ): Promise<VenueQuote | null> {
        const ready = await this.ensureSDK();
        if (!ready) return null;

        const pool = this.findPool(receiveAssetType, payAssetType);
        if (!pool) return null;

        try {
            const buyingBase = pool.baseAsset === receiveAssetType;
            let payAmount: bigint;
            let deepRequired: number;

            if (buyingBase) {
                const baseHuman = Number(receiveAmount) / (10 ** pool.baseDecimals);
                const result = await this.dbClient.getQuoteQuantityOut({
                    poolKey: pool.poolKey,
                    baseQuantity: baseHuman,
                });
                if (!result || result.quoteOut <= 0) return null;
                payAmount = BigInt(Math.ceil(result.quoteOut * (10 ** pool.quoteDecimals)));
                deepRequired = result.deepRequired ?? 0;
            } else {
                const quoteHuman = Number(receiveAmount) / (10 ** pool.quoteDecimals);
                const result = await this.dbClient.getBaseQuantityOut({
                    poolKey: pool.poolKey,
                    quoteQuantity: quoteHuman,
                });
                if (!result || result.baseOut <= 0) return null;
                payAmount = BigInt(Math.ceil(result.baseOut * (10 ** pool.baseDecimals)));
                deepRequired = result.deepRequired ?? 0;
            }

            const effectivePrice = (payAmount * PRICE_SCALING) / receiveAmount;

            return {
                venue: 'deepbook',
                poolKey: pool.poolKey,
                receiveAmount,
                payAmount,
                effectivePrice,
                deepRequired,
                direction: buyingBase ? 'buy_base' : 'sell_base',
            };
        } catch {
            return null;
        }
    }

    // --------------------------------------------------------
    // PTB Fragment Generation
    // --------------------------------------------------------

    /**
     * Generate a PTB fragment that executes a DeepBook swap.
     *
     * The fragment adds moveCall instructions to the provided Transaction
     * and returns the output coin references.
     *
     * IMPORTANT: The caller is responsible for:
     * - Providing the input coin (payCoin) with sufficient balance
     * - Providing the DEEP fee coin (deepCoin)
     * - Transferring/merging the output coins
     */
    generateSwapPTB(
        tx: Transaction,
        params: {
            pool: DeepBookPoolConfig;
            direction: 'buy_base' | 'sell_base';
            amount: number;           // Human-readable amount to swap
            deepAmount: number;       // DEEP tokens for fees
            minOut: number;           // Minimum output (slippage protection)
            coinInput: TransactionObjectArgument;
        },
    ): PTBFragment {
        const { pool, direction, amount, deepAmount, minOut, coinInput } = params;

        if (direction === 'buy_base') {
            // Swap quote → base (swapExactQuoteForBase)
            // Input is quote coin
            const [baseOut, quoteOut, deepOut] = this.dbClient.swapExactQuoteForBase({
                poolKey: pool.poolKey,
                amount,
                deepAmount,
                minOut,
                quoteCoin: coinInput,
            })(tx);

            return {
                venue: 'deepbook',
                outputs: { baseOut, quoteOut, deepOut },
                description: `DeepBook: swap ${amount} quote → base (min ${minOut})`,
            };
        } else {
            // Swap base → quote (swapExactBaseForQuote)
            // Input is base coin
            const [baseOut, quoteOut, deepOut] = this.dbClient.swapExactBaseForQuote({
                poolKey: pool.poolKey,
                amount,
                deepAmount,
                minOut,
                baseCoin: coinInput,
            })(tx);

            return {
                venue: 'deepbook',
                outputs: { baseOut, quoteOut, deepOut },
                description: `DeepBook: swap ${amount} base → quote (min ${minOut})`,
            };
        }
    }

    // --------------------------------------------------------
    // Utility
    // --------------------------------------------------------

    /**
     * Get the mid price for a pool. Useful for display and sanity checks.
     */
    async getMidPrice(poolKey: string): Promise<number | null> {
        const ready = await this.ensureSDK();
        if (!ready) return null;

        try {
            const book = await this.getLevel2(poolKey, 1);
            if (!book) return null;

            const bestBid = book.bidPrices[0];
            const bestAsk = book.askPrices[0];

            if (bestBid == null || bestAsk == null) return null;
            return (bestBid + bestAsk) / 2;
        } catch {
            return null;
        }
    }
}
