import { useState } from 'react';
import { DavyRouter, OfferCache, FillPolicy, OfferStatus } from '@davy/router-reference';
import type { CachedIntent, CachedOffer } from '@davy/router-reference';

// Mock Offers
const MOCK_OFFERS: CachedOffer[] = [
    {
        offerId: '0xabc123...',
        maker: '0xmaker1...',
        offerAssetType: 'SUI',
        wantAssetType: 'USDC',
        initialAmount: 10_000_000_000n, // 10 SUI
        remainingAmount: 5_000_000_000n, // 5 SUI remaining
        minPrice: 1_500_000_000n, // 1.5 USDC/SUI
        maxPrice: 2_000_000_000n, // 2.0 USDC/SUI
        fillPolicy: FillPolicy.PartialAllowed,
        minFillAmount: 1_000_000_000n, // 1 SUI
        expiryTimestampMs: Date.now() + 3600_000,
        status: OfferStatus.PartiallyFilled,
        totalFilled: 5_000_000_000n,
        fillCount: 1,
    },
    {
        offerId: '0xdef456...',
        maker: '0xmaker2...',
        offerAssetType: 'SUI',
        wantAssetType: 'USDC',
        initialAmount: 20_000_000_000n, // 20 SUI
        remainingAmount: 20_000_000_000n, // 20 SUI full
        minPrice: 1_450_000_000n, // 1.45 USDC/SUI (Cheaper!)
        maxPrice: 1_900_000_000n, // 1.9 USDC/SUI
        fillPolicy: FillPolicy.FullOnly,
        minFillAmount: 20_000_000_000n, // Must take all 20
        expiryTimestampMs: Date.now() + 3600_000,
        status: OfferStatus.Created,
        totalFilled: 0n,
        fillCount: 0,
    },
];

interface DemoResult {
    source: string;
    offerId?: string;
    fillAmount: number;
    payment: number;
    price: number;
    reason: string;
}

export function RouterDemo() {
    const [amount, setAmount] = useState('5');
    const [maxPrice, setMaxPrice] = useState('2.0');
    const [result, setResult] = useState<DemoResult | null>(null);

    const handleRoute = async () => {
        // 1. Init Router
        const cache = new OfferCache();
        MOCK_OFFERS.forEach(o => cache.upsert(o));
        const router = new DavyRouter(cache);

        // 2. Create Intent
        const receiveAmount = BigInt(parseFloat(amount) * 1e9);
        const maxPriceBigInt = BigInt(parseFloat(maxPrice) * 1e9);
        const intent: CachedIntent = {
            intentId: '0xsim...',
            creator: '0xme...',
            receiveAssetType: 'SUI',
            payAssetType: 'USDC',
            receiveAmount,
            maxPayAmount: receiveAmount * maxPriceBigInt / 1_000_000_000n, // Rough budget
            escrowedAmount: receiveAmount * maxPriceBigInt / 1_000_000_000n,
            minPrice: 1_000_000_000n,
            maxPrice: maxPriceBigInt,
            expiryTimestampMs: Date.now() + 600_000,
            status: 'pending',
        };

        // 3. Route
        const decision = await router.routeIntent(intent, Date.now());

        // Format for display
        setResult({
            source: decision.source,
            offerId: decision.offerId,
            fillAmount: Number(decision.fillAmount) / 1e9,
            payment: Number(decision.paymentAmount) / 1e9,
            price: Number(decision.effectivePrice) / 1e9,
            reason: decision.reason
        });
    };

    return (
        <div className="p-4 border rounded-lg bg-gray-50 max-w-md">
            <h2 className="text-lg font-bold mb-4">Router Playground</h2>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium">Want Amount (SUI)</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full p-2 border rounded"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium">Max Price (USDC/SUI)</label>
                    <input
                        type="number"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        className="w-full p-2 border rounded"
                    />
                </div>

                <button
                    onClick={handleRoute}
                    className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                    Find Best Route
                </button>

                {result && (
                    <div className="mt-4 p-3 bg-white border rounded">
                        <h3 className="font-semibold text-gray-800">Routing Decision:</h3>
                        <div className="text-sm mt-2 space-y-1">
                            <p><span className="font-medium">Source:</span> {result.source}</p>
                            <p><span className="font-medium">Fill:</span> {result.fillAmount} SUI</p>
                            <p><span className="font-medium">Payment:</span> {result.payment} USDC</p>
                            <p><span className="font-medium">Price:</span> {result.price} USDC/SUI</p>
                            <p className="text-xs text-gray-500 mt-2">{result.reason}</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-6 text-xs text-gray-500">
                <p>Mock Internal Liquidity:</p>
                <ul className="list-disc pl-4 mt-1">
                    <li>5 SUI @ 1.5 USDC (Partial OK)</li>
                    <li>20 SUI @ 1.45 USDC (Full Only)</li>
                </ul>
            </div>
        </div>
    );
}
