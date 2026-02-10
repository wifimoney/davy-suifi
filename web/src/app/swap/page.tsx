'use client';

import * as React from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { ArrowDown, Settings, AlertCircle, Wallet } from 'lucide-react';
import { DAVY_CONFIG } from '@/config';
import { RouteComparison, RouteQuote } from '@/components/layout/RouteComparison';
import { useDavyTransactions } from '@/hooks/use-davy-transactions';
import { toast } from 'sonner';
import { PrivacyToggle } from '@/components/privacy/PrivacyToggle';
import { EncryptedBadge } from '@/components/privacy/EncryptedBadge';
import { Lock } from 'lucide-react';

// Mock token list
const TOKENS = [
    { symbol: 'SUI', type: '0x2::sui::SUI', decimals: 9, logo: 'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg' },
    { symbol: 'USDC', type: '0xa19...::usdc::USDC', decimals: 6, logo: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png' },
    { symbol: 'CETUS', type: '0x068...::cetus::CETUS', decimals: 9, logo: 'https://assets.coingecko.com/coins/images/29470/small/cetus_logo.png' },
];

export default function SwapPage() {
    const account = useCurrentAccount();
    const { createIntent, isConnected } = useDavyTransactions();

    const [sellToken, setSellToken] = React.useState(TOKENS[0]);
    const [buyToken, setBuyToken] = React.useState(TOKENS[1]);
    const [sellAmount, setSellAmount] = React.useState('');
    const [buyAmount, setBuyAmount] = React.useState('');
    const [quotes, setQuotes] = React.useState<RouteQuote[]>([]);
    const [isLoadingQuotes, setIsLoadingQuotes] = React.useState(false);
    const [selectedVenue, setSelectedVenue] = React.useState<string | null>(null);
    const [isEncrypted, setIsEncrypted] = React.useState(false);

    // Mock quote fetching effect
    React.useEffect(() => {
        if (!sellAmount || parseFloat(sellAmount) <= 0) {
            setQuotes([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsLoadingQuotes(true);
            // Simulate API call to davy-router
            await new Promise(r => setTimeout(r, 1000));

            // Mock response
            const mockQuotes: RouteQuote[] = [
                {
                    venue: 'davy',
                    venueLabel: 'Davy P2P',
                    fillAmount: BigInt(Math.floor(parseFloat(sellAmount) * 1.5 * 1e9)), // 1.5 price
                    payAmount: BigInt(Math.floor(parseFloat(sellAmount) * 1e9)),
                    effectivePrice: 1.5,
                    priceImpact: 0.05,
                    legs: [{ venue: 'davy', amount: BigInt(Math.floor(parseFloat(sellAmount) * 1e9)), price: 1.5 }],
                    latencyMs: 120,
                    isBest: true
                },
                {
                    venue: 'deepbook',
                    venueLabel: 'DeepBook V3',
                    fillAmount: BigInt(Math.floor(parseFloat(sellAmount) * 1.48 * 1e9)),
                    payAmount: BigInt(Math.floor(parseFloat(sellAmount) * 1e9)),
                    effectivePrice: 1.48,
                    priceImpact: 0.12,
                    legs: [{ venue: 'deepbook', amount: BigInt(Math.floor(parseFloat(sellAmount) * 1e9)), price: 1.48 }],
                    latencyMs: 450,
                    isBest: false
                },
                {
                    venue: 'cetus',
                    venueLabel: 'Cetus CLMM',
                    fillAmount: BigInt(Math.floor(parseFloat(sellAmount) * 1.45 * 1e9)),
                    payAmount: BigInt(Math.floor(parseFloat(sellAmount) * 1e9)),
                    effectivePrice: 1.45,
                    priceImpact: 0.25,
                    legs: [{ venue: 'cetus', amount: BigInt(Math.floor(parseFloat(sellAmount) * 1e9)), price: 1.45 }],
                    latencyMs: 320,
                    isBest: false
                }
            ];

            setQuotes(mockQuotes);
            setSelectedVenue('davy');

            // Auto-fill buy amount from best quote
            const best = mockQuotes.find(q => q.isBest);
            if (best) {
                setBuyAmount((Number(best.fillAmount) / 1e9).toFixed(4));
            }

            setIsLoadingQuotes(false);
        }, 800);

        return () => clearTimeout(timer);
    }, [sellAmount, sellToken, buyToken]);

    const handleSwap = async () => {
        if (!isConnected) return toast.error('Connect wallet first');

        try {
            if (selectedVenue === 'davy') {
                const coinId = "0x..."; // from selector

                if (isEncrypted) {
                    // Encrypted path: In a real app, we'd encrypt parameters here with Seal
                    toast.promise(
                        new Promise(resolve => setTimeout(resolve, 1500)),
                        {
                            loading: 'Encrypting intent parameters with Seal...',
                            success: 'Encrypted intent submitted to Davy network!',
                            error: 'Failed to encrypt intent',
                        }
                    );
                    console.log('Encrypted intent submission simulation');
                } else {
                    await createIntent({
                        receiveAssetType: buyToken.type,
                        payAssetType: sellToken.type,
                        receiveAmount: BigInt(Math.floor(parseFloat(buyAmount) * Math.pow(10, buyToken.decimals))),
                        paymentCoinId: coinId,
                        minPrice: 0n, // Market
                        maxPrice: 1000000000000n, // Max
                        expiryMs: Date.now() + 600000,
                    });
                    toast.success('Intent submitted to Davy network');
                }
            } else {
                toast.info('Standard router swap execution placeholder');
            }
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    return (
        <div className="max-w-lg mx-auto py-12 px-4">
            {/* Swap Card */}
            <div className="bg-[#111111] border border-white/5 rounded-2xl p-4 relative mb-4">
                {/* Settings Header */}
                <div className="flex justify-between items-center mb-4 px-2">
                    <h1 className="text-white font-bold font-secondary">Swap</h1>
                    <button className="text-gray-500 hover:text-white transition-colors">
                        <Settings className="w-5 h-5" />
                    </button>
                </div>

                {/* Sell Input */}
                <div className="bg-white/5 rounded-xl p-4 mb-1">
                    <div className="flex justify-between mb-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">You Pay</label>
                        <span className="text-xs text-gray-500">Balance: 0.00</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <input
                            type="number"
                            value={sellAmount}
                            onChange={e => setSellAmount(e.target.value)}
                            placeholder="0"
                            className="bg-transparent text-3xl font-bold text-white placeholder:text-gray-600 focus:outline-none w-full font-pixel"
                        />
                        <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-full py-1.5 px-3 transition-colors shrink-0">
                            {/* <img src={sellToken.logo} className="w-6 h-6 rounded-full" /> */}
                            <span className="font-bold text-white font-secondary">{sellToken.symbol}</span>
                            <ArrowDown className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Switcher */}
                <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 z-10">
                    <button className="bg-[#111111] border border-white/10 p-2 rounded-xl hover:bg-white/5 transition-colors">
                        <ArrowDown className="w-4 h-4 text-cyan-500" />
                    </button>
                </div>

                {/* Buy Input */}
                <div className="bg-white/5 rounded-xl p-4 mt-1">
                    <div className="flex justify-between mb-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">You Receive</label>
                        <span className="text-xs text-gray-500">Balance: 0.00</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <input
                            type="number"
                            value={buyAmount}
                            readOnly
                            placeholder="0"
                            className="bg-transparent text-3xl font-bold text-white placeholder:text-gray-600 focus:outline-none w-full font-pixel"
                        />
                        <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-full py-1.5 px-3 transition-colors shrink-0">
                            {/* <img src={buyToken.logo} className="w-6 h-6 rounded-full" /> */}
                            <span className="font-bold text-white font-secondary">{buyToken.symbol}</span>
                            <ArrowDown className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </div>
                {/* Routing Info (if active) */}
                {quotes.length > 0 && (
                    <div className="mt-4">
                        <RouteComparison
                            offerSymbol={buyToken.symbol}
                            wantSymbol={sellToken.symbol}
                            requestAmount={sellAmount}
                            quotes={quotes}
                            isLoading={isLoadingQuotes}
                            selectedVenue={selectedVenue}
                            onSelect={setSelectedVenue}
                        />
                    </div>
                )}

                {/* Privacy Option */}
                {selectedVenue === 'davy' && sellAmount && (
                    <div className="mt-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2">
                        <PrivacyToggle
                            enabled={isEncrypted}
                            onToggle={setIsEncrypted}
                            mode="intent"
                        />
                    </div>
                )}

                <button
                    onClick={handleSwap}
                    disabled={!sellAmount || isLoadingQuotes || !account}
                    className="w-full mt-4 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:hover:bg-cyan-500 text-black font-bold h-14 rounded-xl transition-all font-secondary uppercase tracking-wider text-lg"
                >
                    {!account ? 'Connect Wallet' : isLoadingQuotes ? 'Finding Best Route...' : 'Swap'}
                </button>
            </div>
        </div>
    );
}
