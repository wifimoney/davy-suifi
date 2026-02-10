'use client';

import * as React from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { DAVY_CONFIG } from '@/config';
import Link from 'next/link';
import {
    Plus,
    Search,
    Filter,
    ArrowRight,
    ExternalLink,
    Clock,
    User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDavyTransactions } from '@/hooks/use-davy-transactions';
import { toast } from 'sonner';
import { EncryptedBadge } from '@/components/privacy/EncryptedBadge';

export default function OffersPage() {
    const account = useCurrentAccount();
    const suiClient = useSuiClient();
    const { fillOffer, isConnected } = useDavyTransactions();
    const [searchTerm, setSearchTerm] = React.useState('');

    // Fetch active offers
    const { data: offers, isLoading, refetch } = useQuery({
        queryKey: ['active-offers'],
        queryFn: async () => {
            const PKG = DAVY_CONFIG.packageId;
            // In a real app, query by type or indexer. 
            // For now, fetching events or known objects is a placeholder pattern.
            // Let's assume we have an indexer endpoint or simple object fetch if we knew IDs.
            // Since we don't have a real indexer connected in this snippet, we'll return mock data
            // to demonstrate the UI structure.

            // MOCK DATA for visualization
            return [
                {
                    id: '0x123...abc',
                    maker: '0xabc...123',
                    offerSymbol: 'SUI',
                    wantSymbol: 'USDC',
                    amount: 100_000_000_000n, // 100 SUI
                    price: 1_500_000_000n,     // 1.5 USDC/SUI
                    expiry: Date.now() + 3600000,
                    isMaker: account?.address === '0xabc...123'
                },
                {
                    id: '0x456...def',
                    maker: '0xdef...456',
                    offerSymbol: 'CETUS',
                    wantSymbol: 'SUI',
                    amount: 500_000_000_000n, // 500 CETUS
                    price: 200_000_000n,      // 0.2 SUI/CETUS
                    expiry: Date.now() + 7200000,
                    isMaker: account?.address === '0xdef...456',
                    isPrivate: true
                }
            ];
        },
        refetchInterval: 10_000
    });

    const handleBuy = async (offer: any) => {
        if (!isConnected) return toast.error('Connect wallet first');

        try {
            // Logic to pick a coin of type 'wantSymbol' would happen here
            const paymentCoinId = "0x..."; // Placeholder

            await fillOffer({
                offerId: offer.id,
                offerAssetType: `0x...::${offer.offerSymbol.toLowerCase()}::${offer.offerSymbol}`,
                wantAssetType: `0x...::${offer.wantSymbol.toLowerCase()}::${offer.wantSymbol}`,
                paymentCoinId,
                // fillAmount: undefined for full fill
            });
            toast.success('Offer filled!');
            refetch();
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2 font-secondary">Market Offers</h1>
                    <p className="text-gray-400 text-sm">
                        Browse active liquidity offers from Davy users.
                    </p>
                </div>
                <Link
                    href="/create-offer"
                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-4 py-2 rounded-xl transition-all font-secondary uppercase tracking-wide flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Create Offer
                </Link>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search by token symbol..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[#111111] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50 font-secondary"
                    />
                </div>
                <button className="p-2 rounded-xl border border-white/10 hover:bg-white/5 text-gray-400 transition-colors">
                    <Filter className="w-4 h-4" />
                </button>
            </div>

            {/* Offers Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-48 bg-[#111111] rounded-2xl animate-pulse border border-white/5" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {offers?.map((offer) => (
                        <div key={offer.id} className="bg-[#111111] border border-white/5 hover:border-white/10 rounded-2xl p-5 transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-xs">
                                        {offer.offerSymbol[0]}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white flex items-center gap-2">
                                            {offer.offerSymbol}
                                            {offer.isPrivate && <EncryptedBadge type="offer" compact />}
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-secondary uppercase">Selling</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-white font-pixel">
                                        {(Number(offer.amount) / 1e9).toFixed(2)}
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-secondary">
                                        ≈ ${(Number(offer.amount) / 1e9 * Number(offer.price) / 1e9).toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 mb-5">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Price</span>
                                    <span className="text-white font-bold">
                                        {(Number(offer.price) / 1e9).toFixed(4)} {offer.wantSymbol}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Expires in</span>
                                    <span className="text-gray-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {Math.floor((offer.expiry - Date.now()) / 3600000)}h
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Maker</span>
                                    <a
                                        href={`https://suiscan.xyz/testnet/account/${offer.maker}`}
                                        target="_blank"
                                        rel="noopener"
                                        className="text-cyan-500 hover:text-cyan-400 flex items-center gap-1"
                                    >
                                        <User className="w-3 h-3" />
                                        {offer.maker.slice(0, 4)}...{offer.maker.slice(-4)}
                                    </a>
                                </div>
                            </div>

                            {offer.isMaker ? (
                                <button className="w-full bg-white/5 hover:bg-white/10 text-gray-400 font-bold py-2 rounded-xl text-xs transition-colors font-secondary uppercase">
                                    Manage Offer
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleBuy(offer)}
                                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-2 rounded-xl text-xs transition-colors font-secondary uppercase flex items-center justify-center gap-2"
                                >
                                    Buy Now <ArrowRight className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
