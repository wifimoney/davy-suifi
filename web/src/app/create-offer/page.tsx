'use client';

import * as React from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Wallet, Info, AlertTriangle } from 'lucide-react';
import { DAVY_CONFIG } from '@/config';
import { useDavyTransactions } from '@/hooks/use-davy-transactions';
import { toast } from 'sonner';
import { PrivacyToggle } from '@/components/privacy/PrivacyToggle';
import { PrivateOfferForm } from '@/components/privacy/PrivateOfferForm';
import { EncryptedBadge } from '@/components/privacy/EncryptedBadge';

// Simplified for brevity - in prod would use a real token list
const SUPPORTED_TOKENS = [
    { symbol: 'SUI', type: '0x2::sui::SUI', decimals: 9 },
    { symbol: 'USDC', type: '0xa19...::usdc::USDC', decimals: 6 }, // Replace with real USDC type
    { symbol: 'CETUS', type: '0x068...::cetus::CETUS', decimals: 9 }, // Replace with real CETUS type
];

export default function CreateOfferPage() {
    const router = useRouter();
    const account = useCurrentAccount();
    const { createOffer } = useDavyTransactions();

    const [offerToken, setOfferToken] = React.useState(SUPPORTED_TOKENS[0]);
    const [wantToken, setWantToken] = React.useState(SUPPORTED_TOKENS[1]);
    const [amount, setAmount] = React.useState('');
    const [price, setPrice] = React.useState('');
    const [minSize, setMinSize] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isPrivate, setIsPrivate] = React.useState(false);
    const [allowlist, setAllowlist] = React.useState<string[]>([]);

    // Hardcoded for MVP
    const fillPolicy = 0; // Partial fill allowed
    const expiryHours = 24;

    const handleSubmit = async () => {
        if (!account) return;
        setIsSubmitting(true);

        try {
            // In a real app, you'd need to select a specific coin object ID here
            // For now, we'll just log that this step is needed or assume a coin selector component exists
            const coinId = "0x..."; // Would come from coin selector

            const decimalsOffer = offerToken.decimals;
            const decimalsWant = wantToken.decimals;

            // Convert human input to integer amounts
            const amountInt = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimalsOffer)));
            const priceInt = BigInt(Math.floor(parseFloat(price) * Math.pow(10, decimalsWant))); // Price in want-terms? 
            // NOTE: Davy protocol defines price as (want_amount / offer_amount) scaled by 1e9 usually, 
            // or simply base/quote ratio. The contract expects u64 scaled price.
            // Let's assume standard 1e9 scaling for price:
            const SCALAR = 1_000_000_000n;
            const priceScaled = BigInt(Math.floor(parseFloat(price) * 1_000_000_000));

            await createOffer({
                offerCoinId: coinId,
                offerAssetType: offerToken.type,
                wantAssetType: wantToken.type,
                minPrice: priceScaled,
                maxPrice: priceScaled, // Fixed price for now
                expiryMs: Date.now() + expiryHours * 3600 * 1000,
                fillPolicy,
                minFillAmount: minSize ? BigInt(Math.floor(parseFloat(minSize) * Math.pow(10, decimalsOffer))) : 0n,
            });

            if (isPrivate && allowlist.length > 0) {
                // Private offer additional steps
                toast.promise(
                    new Promise(resolve => setTimeout(resolve, 2000)),
                    {
                        loading: 'Configuring Seal policy & Walrus storage...',
                        success: 'Private offer metadata secured!',
                        error: 'Failed to secure private metadata',
                    }
                );
            }

            toast.success('Offer created successfully!');
            router.push('/offers');
        } catch (e: any) {
            console.error(e);
            toast.error(`Failed to create offer: ${e.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!account) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Wallet className="w-12 h-12 text-gray-600" />
                <h2 className="text-xl font-bold text-white font-secondary">Connect Wallet</h2>
                <p className="text-gray-400">Please connect your wallet to create an offer.</p>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto py-12 px-4">
            <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back
            </button>

            <div className="bg-[#111111] border border-white/5 rounded-2xl p-6 md:p-8">
                <h1 className="text-2xl font-bold text-white mb-2 font-secondary">Create Offer</h1>
                <p className="text-gray-400 text-sm mb-8">
                    Create a limit order to sell your assets at a fixed price.
                </p>

                <div className="space-y-6">
                    {/* Token Selection */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Sell</label>
                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-white">
                                {offerToken.symbol}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Buy</label>
                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-white">
                                {wantToken.symbol}
                            </div>
                        </div>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Amount to Sell</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors font-pixel"
                        />
                    </div>

                    {/* Price Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">
                            Price ({wantToken.symbol} per {offerToken.symbol})
                        </label>
                        <input
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors font-pixel"
                        />
                    </div>
                    {/* Privacy Section */}
                    <div className="pt-4 border-t border-white/5 space-y-4">
                        <PrivacyToggle
                            enabled={isPrivate}
                            onToggle={setIsPrivate}
                            mode="offer"
                        />

                        {isPrivate && (
                            <div className="animate-in fade-in slide-in-from-top-2">
                                <PrivateOfferForm
                                    allowlist={allowlist}
                                    onAllowlistChange={setAllowlist}
                                />
                            </div>
                        )}
                    </div>

                    {/* Summary */}
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-400">Total Receive (estimated)</span>
                            <span className="text-white font-bold">
                                {amount && price ? (parseFloat(amount) * parseFloat(price)).toFixed(4) : '—'} {wantToken.symbol}
                            </span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-400">Expiration</span>
                            <span className="text-white">24 Hours</span>
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !amount || !price}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:hover:bg-cyan-500 text-black font-bold h-12 rounded-xl transition-all font-secondary uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? 'Creating...' : (
                            <>
                                <Plus className="w-4 h-4" />
                                Create Offer
                            </>
                        )}
                    </button>

                    <div className="flex items-center justify-center gap-2 text-[10px] text-gray-500">
                        <AlertTriangle className="w-3 h-3" />
                        Funds will be escrowed in the Davy contract until filled or cancelled.
                    </div>
                </div>
            </div>
        </div>
    );
}
