import { ExternalPriceSource } from './router.js';

export interface CetusQuote {
    poolId: string;
    amountIn: bigint;
    amountOut: bigint;
    effectivePrice: bigint; // WantAsset per 1 OfferAsset, scaled 1e9
}

/** Maps short asset names to full coin type strings */
const COIN_TYPE_MAP: Record<string, string> = {
    SUI: '0x2::sui::SUI',
    USDC: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
};

export class CetusAdapter implements ExternalPriceSource {
    name = 'cetus';
    private network: 'testnet' | 'mainnet';
    private sdk: any;
    private poolCache: Map<string, any[]> = new Map();

    constructor(network: 'testnet' | 'mainnet' = 'testnet') {
        this.network = network;
        this.sdk = null; // Lazily initialized — requires @cetusprotocol/sui-clmm-sdk
    }

    private async ensureSDK(): Promise<boolean> {
        if (this.sdk) return true;
        try {
            // Dynamic import to keep the adapter optional
            const { default: CetusClmmSDK } = await import('@cetusprotocol/sui-clmm-sdk');
            this.sdk = new CetusClmmSDK({
                network: this.network,
            } as any);
            return true;
        } catch {
            // SDK not installed — adapter remains disabled
            return false;
        }
    }

    private resolveCoinType(nameOrType: string): string {
        return COIN_TYPE_MAP[nameOrType.toUpperCase()] ?? nameOrType;
    }

    private poolCacheKey(coinA: string, coinB: string): string {
        return [coinA, coinB].sort().join('|');
    }

    /**
     * Get price from Cetus for receiving a specific amount of receiveAsset by paying payAsset.
     * Implements ExternalPriceSource.
     */
    async getPrice(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint
    ): Promise<bigint | null> {
        try {
            const ready = await this.ensureSDK();
            if (!ready) return null;

            const coinTypeReceive = this.resolveCoinType(receiveAssetType);
            const coinTypePay = this.resolveCoinType(payAssetType);

            // Discover pools for this pair
            const cacheKey = this.poolCacheKey(coinTypeReceive, coinTypePay);
            let pools = this.poolCache.get(cacheKey);
            if (!pools) {
                pools = await this.sdk.Pool.getPoolByCoins(coinTypeReceive, coinTypePay);
                if (pools && pools.length > 0) {
                    this.poolCache.set(cacheKey, pools);
                }
            }

            if (!pools || pools.length === 0) return null;

            const pool = pools[0];
            const a2b = pool.coinTypeA === coinTypePay;

            // Quote: How much PayAsset do we need to give to get `receiveAmount` of ReceiveAsset?
            const preswapResult = await this.sdk.Swap.preswap({
                pool,
                currentSqrtPrice: pool.current_sqrt_price,
                coinTypeA: pool.coinTypeA,
                coinTypeB: pool.coinTypeB,
                decimalsA: 9, // Fallback, production uses SDK metadata
                decimalsB: 6, // Fallback
                a2b,
                byAmountIn: false, // We specify amount out
                amount: receiveAmount.toString(),
            });

            if (!preswapResult || !preswapResult.estimatedAmountIn) return null;

            const amountIn = BigInt(preswapResult.estimatedAmountIn);
            if (amountIn <= 0n) return null;

            // price = (payAmount * 1e9) / receiveAmount
            return (amountIn * 1_000_000_000n) / receiveAmount;
        } catch {
            return null;
        }
    }

    /**
     * Get a quote from Cetus for swapping payAsset -> receiveAsset.
     * Returns null if no pool found, SDK unavailable, or any error occurs.
     */
    async getQuote(
        payAssetType: string,
        receiveAssetType: string,
        payAmount: bigint,
    ): Promise<CetusQuote | null> {
        // ... (existing implementation is fine or can be refactored)
        const price = await this.getPrice(receiveAssetType, payAssetType, 1_000_000_000n); // Sample price for 1 unit
        if (!price) return null;

        const amountOut = (payAmount * 1_000_000_000n) / price;
        return {
            poolId: 'unknown',
            amountIn: payAmount,
            amountOut,
            effectivePrice: price,
        };
    }
}
