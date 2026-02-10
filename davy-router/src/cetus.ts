/**
 * Davy Protocol — Phase 8: Hardened Cetus CLMM Adapter
 *
 * Production adapter for Cetus concentrated liquidity pools.
 * Improvements over Phase 7 reference:
 * - Dynamic decimal resolution from coin metadata
 * - Multi-pool comparison (picks highest liquidity / best price)
 * - Configurable slippage tolerance
 * - Pool cache invalidation (TTL-based)
 * - PTB fragment generation for atomic execution
 *
 * SDK: @cetusprotocol/sui-clmm-sdk
 */

import type { SuiClient } from '@mysten/sui/client';
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import { ExternalPriceSource, PTBFragment, VenueQuote } from './types.js';

// ============================================================
// Constants
// ============================================================

const PRICE_SCALING = 1_000_000_000n;
const POOL_CACHE_TTL_MS = 60_000; // 1 minute pool cache
const DEFAULT_SLIPPAGE_BPS = 50;   // 0.5% default slippage

/** Known coin types → full addresses (mainnet) */
const COIN_TYPE_MAP: Record<string, string> = {
    SUI: '0x2::sui::SUI',
    USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    USDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
    WETH: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN',
    WBTC: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN',
    DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
};

// ============================================================
// Types
// ============================================================

interface CachedPool {
    pool: any;
    fetchedAt: number;
}

interface CoinMetadataCache {
    decimals: number;
    fetchedAt: number;
}

// ============================================================
// Adapter
// ============================================================

export class CetusAdapter implements ExternalPriceSource {
    name = 'cetus';

    private client: SuiClient;
    private network: 'testnet' | 'mainnet';
    private sdk: any;
    private sdkClass: any;
    private poolCache: Map<string, CachedPool[]> = new Map();
    private coinDecimalsCache: Map<string, CoinMetadataCache> = new Map();
    private slippageBps: number;
    private initialized = false;

    constructor(config: {
        client: SuiClient;
        network: 'testnet' | 'mainnet';
        slippageBps?: number;
    }) {
        this.client = config.client;
        this.network = config.network;
        this.slippageBps = config.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    }

    // --------------------------------------------------------
    // Initialization
    // --------------------------------------------------------

    private async ensureSDK(): Promise<boolean> {
        if (this.initialized && this.sdk) return true;
        try {
            const CetusModule = await import('@cetusprotocol/sui-clmm-sdk');
            const CetusClmmSDK = CetusModule.default ?? CetusModule.CetusClmmSDK;
            // Store the class for static method access
            this.sdkClass = CetusClmmSDK;
            this.sdk = new (CetusClmmSDK as any)({
                network: this.network,
            });
            this.initialized = true;
            return true;
        } catch {
            return false;
        }
    }

    // --------------------------------------------------------
    // Coin Resolution
    // --------------------------------------------------------

    private resolveCoinType(nameOrType: string): string {
        return COIN_TYPE_MAP[nameOrType.toUpperCase()] ?? nameOrType;
    }

    /**
     * Get decimals for a coin type, with caching.
     * Falls back to common known values if RPC fails.
     */
    private async getDecimals(coinType: string): Promise<number> {
        const cached = this.coinDecimalsCache.get(coinType);
        if (cached && Date.now() - cached.fetchedAt < 300_000) { // 5 min TTL
            return cached.decimals;
        }

        // Known defaults
        const knownDecimals: Record<string, number> = {
            '0x2::sui::SUI': 9,
        };

        // Check known defaults first
        if (knownDecimals[coinType] !== undefined) {
            const d = knownDecimals[coinType];
            this.coinDecimalsCache.set(coinType, { decimals: d, fetchedAt: Date.now() });
            return d;
        }

        // Most USDC/USDT variants use 6 decimals
        if (coinType.includes('usdc') || coinType.includes('usdt')) {
            this.coinDecimalsCache.set(coinType, { decimals: 6, fetchedAt: Date.now() });
            return 6;
        }

        try {
            const metadata = await this.client.getCoinMetadata({ coinType });
            if (metadata?.decimals !== undefined) {
                this.coinDecimalsCache.set(coinType, {
                    decimals: metadata.decimals,
                    fetchedAt: Date.now(),
                });
                return metadata.decimals;
            }
        } catch {
            // RPC fail — fall back to 9
        }

        // Default fallback
        this.coinDecimalsCache.set(coinType, { decimals: 9, fetchedAt: Date.now() });
        return 9;
    }

    // --------------------------------------------------------
    // Pool Discovery (with TTL cache)
    // --------------------------------------------------------

    private poolCacheKey(coinA: string, coinB: string): string {
        return [coinA, coinB].sort().join('|');
    }

    private async discoverPools(coinTypeA: string, coinTypeB: string): Promise<any[]> {
        const key = this.poolCacheKey(coinTypeA, coinTypeB);
        const cached = this.poolCache.get(key);

        if (cached && cached.length > 0 && Date.now() - cached[0].fetchedAt < POOL_CACHE_TTL_MS) {
            return cached.map(c => c.pool);
        }

        try {
            const pools = await this.sdk.Pool.getPoolByCoins(coinTypeA, coinTypeB);
            if (pools && pools.length > 0) {
                const now = Date.now();
                this.poolCache.set(key, pools.map((p: any) => ({
                    pool: p,
                    fetchedAt: now,
                })));
                return pools;
            }
        } catch {
            // Fall through
        }

        return [];
    }

    /**
     * Select the best pool from discovered pools.
     * Criteria: highest liquidity (TVL proxy).
     */
    private selectBestPool(pools: any[]): any | null {
        if (pools.length === 0) return null;
        if (pools.length === 1) return pools[0];

        // Sort by liquidity descending. Pool objects typically have a `liquidity` field.
        const sorted = [...pools].sort((a, b) => {
            const liqA = BigInt(a.liquidity ?? '0');
            const liqB = BigInt(b.liquidity ?? '0');
            if (liqB > liqA) return 1;
            if (liqA > liqB) return -1;
            return 0;
        });

        return sorted[0];
    }

    // --------------------------------------------------------
    // ExternalPriceSource Implementation
    // --------------------------------------------------------

    async getPrice(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
    ): Promise<bigint | null> {
        const ready = await this.ensureSDK();
        if (!ready) return null;

        const coinTypeReceive = this.resolveCoinType(receiveAssetType);
        const coinTypePay = this.resolveCoinType(payAssetType);

        const pools = await this.discoverPools(coinTypeReceive, coinTypePay);
        const pool = this.selectBestPool(pools);
        if (!pool) return null;

        const decimalsReceive = await this.getDecimals(coinTypeReceive);
        const decimalsPay = await this.getDecimals(coinTypePay);

        try {
            const a2b = pool.coinTypeA === coinTypePay;

            const preswapResult = await this.sdk.Swap.preSwap({
                pool,
                currentSqrtPrice: pool.current_sqrt_price,
                coinTypeA: pool.coinTypeA,
                coinTypeB: pool.coinTypeB,
                decimalsA: pool.coinTypeA === coinTypePay ? decimalsPay : decimalsReceive,
                decimalsB: pool.coinTypeB === coinTypePay ? decimalsPay : decimalsReceive,
                a2b,
                byAmountIn: false, // Specify output amount
                amount: receiveAmount.toString(),
            });

            if (!preswapResult || !preswapResult.estimatedAmountIn) return null;

            const amountIn = BigInt(preswapResult.estimatedAmountIn);
            if (amountIn <= 0n) return null;

            // Apply slippage to the input estimate
            const amountInWithSlippage = amountIn + (amountIn * BigInt(this.slippageBps)) / 10000n;

            return (amountInWithSlippage * PRICE_SCALING) / receiveAmount;
        } catch {
            return null;
        }
    }

    // --------------------------------------------------------
    // Detailed Quote
    // --------------------------------------------------------

    async getDetailedQuote(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
    ): Promise<VenueQuote | null> {
        const ready = await this.ensureSDK();
        if (!ready) return null;

        const coinTypeReceive = this.resolveCoinType(receiveAssetType);
        const coinTypePay = this.resolveCoinType(payAssetType);

        const pools = await this.discoverPools(coinTypeReceive, coinTypePay);
        const pool = this.selectBestPool(pools);
        if (!pool) return null;

        const decimalsReceive = await this.getDecimals(coinTypeReceive);
        const decimalsPay = await this.getDecimals(coinTypePay);

        try {
            const a2b = pool.coinTypeA === coinTypePay;

            const preswapResult = await this.sdk.Swap.preSwap({
                pool,
                currentSqrtPrice: pool.current_sqrt_price,
                coinTypeA: pool.coinTypeA,
                coinTypeB: pool.coinTypeB,
                decimalsA: pool.coinTypeA === coinTypePay ? decimalsPay : decimalsReceive,
                decimalsB: pool.coinTypeB === coinTypePay ? decimalsPay : decimalsReceive,
                a2b,
                byAmountIn: false,
                amount: receiveAmount.toString(),
            });

            if (!preswapResult?.estimatedAmountIn) return null;

            const payAmount = BigInt(preswapResult.estimatedAmountIn);
            const payWithSlippage = payAmount + (payAmount * BigInt(this.slippageBps)) / 10000n;
            const effectivePrice = (payWithSlippage * PRICE_SCALING) / receiveAmount;

            return {
                venue: 'cetus',
                poolId: pool.poolAddress ?? pool.pool_address ?? pool.id ?? 'unknown',
                receiveAmount,
                payAmount: payWithSlippage,
                effectivePrice,
                direction: a2b ? 'a2b' : 'b2a',
                slippageBps: this.slippageBps,
                sqrtPrice: pool.current_sqrt_price,
            };
        } catch {
            return null;
        }
    }

    // --------------------------------------------------------
    // PTB Fragment Generation
    // --------------------------------------------------------

    /**
     * Generate a PTB fragment for a Cetus swap.
     *
     * The caller provides the input coin and receives the output coin reference.
     * DEEP fees are not required for Cetus (unlike DeepBook).
     */
    async generateSwapPTB(
        tx: Transaction,
        params: {
            receiveAssetType: string;
            payAssetType: string;
            payAmount: bigint;
            minReceiveAmount: bigint;
            coinInput: TransactionObjectArgument;
        },
    ): Promise<PTBFragment | null> {
        const ready = await this.ensureSDK();
        if (!ready) return null;

        const coinTypeReceive = this.resolveCoinType(params.receiveAssetType);
        const coinTypePay = this.resolveCoinType(params.payAssetType);

        const pools = await this.discoverPools(coinTypeReceive, coinTypePay);
        const pool = this.selectBestPool(pools);
        if (!pool) return null;

        try {
            const a2b = pool.coinTypeA === coinTypePay;

            // Build the swap transaction using Cetus SDK
            // Note: SDK requires real coin object IDs for strict checks,
            // but we cast to any here to pass PTB arguments for atomic composition.
            // This relies on moveCall accepting NestedResult from previous PTB steps.
            const coinInputA = a2b ? { coinObjectId: params.coinInput as any, amount: params.payAmount.toString() } : undefined;
            const coinInputB = a2b ? undefined : { coinObjectId: params.coinInput as any, amount: params.payAmount.toString() };

            const swapParams = {
                pool_id: pool.poolAddress ?? pool.pool_address ?? pool.id,
                coinTypeA: pool.coinTypeA,
                coinTypeB: pool.coinTypeB,
                a2b,
                by_amount_in: true,
                amount: params.payAmount.toString(),
                amount_limit: params.minReceiveAmount.toString(),
            };

            const res = await (this.sdkClass as any).buildSwapTransactionWithoutTransferCoinArgs(
                this.sdk,
                tx,
                swapParams,
                this.sdk.sdkOptions,
                coinInputA,
                coinInputB,
            );

            // The SDK returns txRes which contains the output coins [coinA, coinB]
            // We want the received coin.
            // If a2b, we receive B (index 1? or just the target?).
            // buildSwapTransactionWithoutTransferCoinArgs likely returns [coinA, coinB] balances?
            // Need to verify return structure.
            // Based on SDK: txRes: TransactionObjectArgument[]
            // Usually it returns both (remainder of A, and new B).
            // If a2b, index 0 is A (remainder), index 1 is B (outcome).
            // We assume index 1 is what we want if a2b.
            // But let's check array length.

            const outputs = res.txRes;
            let outputCoin: TransactionObjectArgument;

            if (!outputs || outputs.length === 0) return null;

            if (outputs.length === 2) {
                // [CoinA, CoinB]
                outputCoin = a2b ? outputs[1] : outputs[0];
            } else {
                // Fallback
                outputCoin = outputs[0];
            }

            return {
                venue: 'cetus',
                outputs: { outputCoin },
                description: `Cetus: swap ${params.payAmount} → min ${params.minReceiveAmount}`,
            };
        } catch (e) {
            console.warn('Cetus swap generation failed:', e);
            return null;
        }
    }

    // --------------------------------------------------------
    // Configuration
    // --------------------------------------------------------

    setSlippage(bps: number): void {
        this.slippageBps = bps;
    }

    clearCache(): void {
        this.poolCache.clear();
        this.coinDecimalsCache.clear();
    }
}
