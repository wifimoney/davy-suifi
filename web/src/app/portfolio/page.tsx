'use client';

import * as React from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import {
    Wallet,
    ArrowUpRight,
    ArrowDownLeft,
    Clock,
    MoreHorizontal,
    Trash2,
    PieChart,
    Activity
} from 'lucide-react';
import { DAVY_CONFIG } from '@/config';
import { useDavyTransactions } from '@/hooks/use-davy-transactions';
import { TransactionHistory } from '@/components/layout/TransactionHistory';
import { toast } from 'sonner';

export default function PortfolioPage() {
    const account = useCurrentAccount();
    const { withdrawOffer, cancelIntent } = useDavyTransactions();

    // In a real app, you'd fetch user's active offers and intents from indexer/chain
    // Mock data for display
    const activeOffers = [
        { id: '0x1...', pair: 'SUI/USDC', type: 'Sell', amount: '1,000 SUI', price: '1.65 USDC', expiry: '22h' },
        { id: '0x2...', pair: 'CETUS/SUI', type: 'Buy', amount: '5,000 CETUS', price: '0.12 SUI', expiry: '5h' },
    ];

    const activeIntents = [
        { id: '0x3...', intent: 'Buy SUI', amount: '500 USDC', limit: 'Max 1.60', status: 'Pending' },
    ];

    const handleWithdraw = async (id: string) => {
        try {
            // Mock call - needs actual types in real app
            await withdrawOffer({
                offerId: id,
                offerAssetType: '0x...',
                wantAssetType: '0x...'
            });
            toast.success('Offer withdrawn');
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const handleCancelIntent = async (id: string) => {
        try {
            await cancelIntent({
                intentId: id,
                receiveAssetType: '0x...',
                payAssetType: '0x...'
            });
            toast.success('Intent cancelled');
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    if (!account) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Wallet className="w-12 h-12 text-gray-600" />
                <h2 className="text-xl font-bold text-white font-secondary">Connect Wallet</h2>
                <p className="text-gray-400">View your active positions and history.</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
            <h1 className="text-2xl font-bold text-white font-secondary">Portfolio</h1>

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#111111] border border-white/5 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
                            <Wallet className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-bold text-gray-400 uppercase font-secondary">Total Value</span>
                    </div>
                    <div className="text-2xl font-bold text-white font-pixel">$12,450.00</div>
                    <div className="text-xs text-green-400 mt-1 flex items-center gap-1">
                        <ArrowUpRight className="w-3 h-3" /> +$450 (24h)
                    </div>
                </div>

                <div className="bg-[#111111] border border-white/5 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                            <Activity className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-bold text-gray-400 uppercase font-secondary">Open Orders</span>
                    </div>
                    <div className="text-2xl font-bold text-white font-pixel">3</div>
                    <div className="text-xs text-gray-500 mt-1">2 Offers, 1 Intent</div>
                </div>

                <div className="bg-[#111111] border border-white/5 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
                            <PieChart className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-bold text-gray-400 uppercase font-secondary">Asset Allocation</span>
                    </div>
                    <div className="flex gap-2">
                        {['SUI', 'USDC', 'CETUS'].map(t => (
                            <span key={t} className="text-xs bg-white/5 px-2 py-1 rounded text-gray-400">{t}</span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Active Orders */}
                <div className="space-y-6">
                    <div>
                        <h2 className="text-lg font-bold text-white mb-4 font-secondary">Active Offers</h2>
                        <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden">
                            {activeOffers.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 text-sm">No active offers</div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {activeOffers.map((offer, i) => (
                                        <div key={i} className="p-4 flex items-center justify-between hover:bg-white/[0.02]">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded uppercase ${offer.type === 'Sell' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                                                        {offer.type}
                                                    </span>
                                                    <span className="text-sm font-bold text-white">{offer.pair}</span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {offer.amount} @ {offer.price}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <div className="text-xs text-gray-500 flex items-center gap-1 justify-end">
                                                        <Clock className="w-3 h-3" /> {offer.expiry}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleWithdraw(offer.id)}
                                                    className="p-2 hover:bg-red-500/10 rounded-lg group transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4 text-gray-600 group-hover:text-red-400" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-bold text-white mb-4 font-secondary">Active Intents</h2>
                        <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden">
                            {activeIntents.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 text-sm">No active intents</div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {activeIntents.map((intent, i) => (
                                        <div key={i} className="p-4 flex items-center justify-between hover:bg-white/[0.02]">
                                            <div>
                                                <span className="text-sm font-bold text-white block">{intent.intent}</span>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {intent.amount} • {intent.limit}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                                                    {intent.status}
                                                </span>
                                                <button
                                                    onClick={() => handleCancelIntent(intent.id)}
                                                    className="p-2 hover:bg-red-500/10 rounded-lg group transition-colors"
                                                >
                                                    <XCircle className="w-4 h-4 text-gray-600 group-hover:text-red-400" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* History */}
                <div>
                    <TransactionHistory />
                </div>
            </div>
        </div>
    );
}

// Helper for icon
function XCircle({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>
    )
}
