'use client';

import * as React from 'react';
import {
    Settings,
    Info,
    RefreshCcw,
    ChevronDown,
    ArrowDownUp,
    Zap,
    Merge,
    Clock,
    Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TokenSUI, TokenUSDC } from '@web3icons/react';
import { cn } from '@/lib/utils';
import { useCurrentAccount, ConnectButton, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { useDavyRouter } from '@/hooks/use-davy-router';
import { useDavyTransactions } from '@/hooks/use-davy-transactions';
import { DAVY_CONFIG } from '@/config';
import type { CachedIntent, RoutingDecision } from '@davy/router-reference';

export function TradeBox() {
    const [side, setSide] = React.useState<'buy' | 'sell'>('buy');
    const [type, setType] = React.useState('swap');
    const [payAmount, setPayAmount] = React.useState('');
    const [receiveAmount, setReceiveAmount] = React.useState('');
    const [route, setRoute] = React.useState<RoutingDecision | null>(null);
    const [isQuoting, setIsQuoting] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const account = useCurrentAccount();
    const suiClient = useSuiClient();
    const { routeIntent, refreshOffers } = useDavyRouter();
    const { isConnected, createIntent, fillOffer } = useDavyTransactions();

    // Balance queries
    const { data: suiBalance } = useQuery({
        queryKey: ['balance', 'sui', account?.address],
        queryFn: async () => {
            if (!account?.address) return '0.00';
            const bal = await suiClient.getBalance({ owner: account.address });
            return (Number(bal.totalBalance) / 1e9).toFixed(2);
        },
        enabled: !!account?.address,
        refetchInterval: 15_000,
    });

    const { data: usdcBalance } = useQuery({
        queryKey: ['balance', 'usdc', account?.address],
        queryFn: async () => {
            if (!account?.address) return '0.00';
            try {
                const bal = await suiClient.getBalance({
                    owner: account.address,
                    coinType: DAVY_CONFIG.coinTypes.USDC,
                });
                return (Number(bal.totalBalance) / 1e6).toFixed(2);
            } catch {
                return '0.00';
            }
        },
        enabled: !!account?.address,
        refetchInterval: 15_000,
    });

    // Debounced quoting
    React.useEffect(() => {
        if (!payAmount || isNaN(parseFloat(payAmount))) {
            setRoute(null);
            setReceiveAmount('');
            return;
        }

        const timer = setTimeout(async () => {
            setIsQuoting(true);
            try {
                const payBig = BigInt(Math.floor(parseFloat(payAmount) * 1e9));
                const intent: CachedIntent = {
                    intentId: '0xquote',
                    creator: account?.address ?? '0x0',
                    receiveAssetType: side === 'buy' ? 'SUI' : 'USDC',
                    payAssetType: side === 'buy' ? 'USDC' : 'SUI',
                    receiveAmount: BigInt(Math.floor(parseFloat(payAmount) / 1.5 * 1e9)),
                    maxPayAmount: payBig,
                    escrowedAmount: payBig,
                    minPrice: 1_000_000_000n,
                    maxPrice: 3_000_000_000n,
                    expiryTimestampMs: Date.now() + 600_000,
                    status: 'pending',
                };

                const decision = await routeIntent(intent);
                if (decision.source !== 'skip') {
                    setRoute(decision);
                    setReceiveAmount((Number(decision.fillAmount) / 1e9).toFixed(4));
                } else {
                    setRoute(null);
                    setReceiveAmount('');
                }
            } catch {
                setRoute(null);
            } finally {
                setIsQuoting(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [payAmount, side, account?.address, routeIntent]);

    const handleSubmit = async () => {
        if (type === 'dca') return;
        if (!route || isSubmitting) return;

        setIsSubmitting(true);
        try {
            if (type === 'swap' && route.offerId) {
                await fillOffer({
                    offerId: route.offerId,
                    offerAssetType: DAVY_CONFIG.coinTypes.SUI,
                    wantAssetType: DAVY_CONFIG.coinTypes.USDC,
                    paymentCoinId: '', // Would need coin selection in production
                    fillAmount: route.fillAmount > 0n ? route.fillAmount : undefined,
                });
            } else if (type === 'limit') {
                await createIntent({
                    receiveAssetType: DAVY_CONFIG.coinTypes.SUI,
                    payAssetType: DAVY_CONFIG.coinTypes.USDC,
                    receiveAmount: route.fillAmount,
                    paymentCoinId: '', // Would need coin selection in production
                    minPrice: 1_000_000_000n,
                    maxPrice: route.effectivePrice,
                    expiryMs: Date.now() + 3600_000,
                });
            }
            await refreshOffers();
        } catch (e) {
            console.error('Transaction failed:', e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const slippage = 0.005; // 0.5%
    const minReceived = route
        ? (Number(route.fillAmount) / 1e9 * (1 - slippage)).toFixed(4)
        : '-';
    const priceImpact = route ? '< 0.01%' : '-';
    const tradingFee = route ? '~0.01 SUI' : '-';
    const routeSource = route ? route.source.toUpperCase() : '-';

    return (
        <div className="w-[360px] bg-[#0b0b0b] border-l border-white/5 flex flex-col h-full select-none">
            <div className="p-4 flex gap-2">
                <button
                    onClick={() => setSide('buy')}
                    className={cn(
                        "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border",
                        side === 'buy'
                            ? "bg-green-500/10 border-green-500/50 text-green-500"
                            : "border-transparent text-gray-500 hover:text-gray-300"
                    )}
                >
                    Buy
                </button>
                <button
                    onClick={() => setSide('sell')}
                    className={cn(
                        "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border",
                        side === 'sell'
                            ? "bg-red-500/10 border-red-500/50 text-red-500"
                            : "border-transparent text-gray-500 hover:text-gray-300"
                    )}
                >
                    Sell
                </button>
            </div>

            <div className="px-4 pb-2 border-b border-white/5 flex items-center justify-between">
                <div className="flex gap-4">
                    {['Swap', 'Limit', 'DCA'].map((t) => (
                        <button
                            key={t}
                            onClick={() => setType(t.toLowerCase())}
                            className={cn(
                                "text-xs font-bold pb-2 transition-all relative",
                                type === t.toLowerCase() ? "text-cyan-400" : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            {t}
                            {type === t.toLowerCase() && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-gray-200">
                        <Merge className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-gray-200">
                        <Zap className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {type === 'dca' ? (
                <div className="p-4 flex-1 flex items-center justify-center">
                    <div className="bg-secondary/50 rounded-xl p-8 text-center space-y-3">
                        <Clock className="w-8 h-8 text-gray-600 mx-auto" />
                        <div className="font-secondary text-[10px] uppercase font-bold text-gray-500 tracking-widest">
                            Coming Soon
                        </div>
                        <p className="font-sans text-sm text-gray-400 max-w-[240px]">
                            Dollar-cost averaging will allow you to split large orders into smaller periodic trades.
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500">
                                Aggregator Mode
                                <div className="w-8 h-4 bg-cyan-500/20 rounded-full p-0.5 relative cursor-pointer border border-cyan-500/30">
                                    <div className="w-3 h-3 bg-cyan-400 rounded-full ml-auto" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400">0.5%</span>
                                <Settings className="w-3.5 h-3.5 text-gray-500 cursor-pointer hover:text-gray-200" />
                                <RefreshCcw
                                    className={cn(
                                        "w-3.5 h-3.5 text-gray-500 cursor-pointer hover:text-gray-200",
                                        isQuoting && "animate-spin"
                                    )}
                                    onClick={() => refreshOffers()}
                                />
                            </div>
                        </div>

                        {/* Inputs */}
                        <div className="space-y-1 relative">
                            <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-gray-500">You Pay</span>
                                    {account && (
                                        <span className="font-pixel text-[10px] text-gray-500">
                                            Balance: {side === 'buy' ? usdcBalance ?? '0.00' : suiBalance ?? '0.00'}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <input
                                        type="text"
                                        placeholder="0.0"
                                        value={payAmount}
                                        onChange={(e) => setPayAmount(e.target.value)}
                                        className="bg-transparent text-2xl font-bold text-white outline-none w-full"
                                    />
                                    <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/10 transition-colors">
                                        {side === 'buy' ? (
                                            <TokenUSDC size={20} variant="mono" />
                                        ) : (
                                            <TokenSUI size={20} variant="mono" />
                                        )}
                                        <span className="text-sm font-bold text-white">
                                            {side === 'buy' ? 'USDC' : 'SUI'}
                                        </span>
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>
                            </div>

                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                                <div className="bg-[#0b0b0b] p-2 rounded-xl border border-white/10 text-gray-400 hover:text-cyan-400 cursor-pointer shadow-lg transition-colors">
                                    <ArrowDownUp className="w-4 h-4" />
                                </div>
                            </div>

                            <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-gray-500">You Receive</span>
                                    {account && (
                                        <span className="font-pixel text-[10px] text-gray-500">
                                            Balance: {side === 'buy' ? suiBalance ?? '0.00' : usdcBalance ?? '0.00'}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <input
                                        type="text"
                                        placeholder="0.0"
                                        value={isQuoting ? '...' : receiveAmount}
                                        readOnly
                                        className="bg-transparent text-2xl font-bold text-white outline-none w-full"
                                    />
                                    <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/10 transition-colors">
                                        {side === 'buy' ? (
                                            <TokenSUI size={20} variant="mono" />
                                        ) : (
                                            <TokenUSDC size={20} variant="mono" />
                                        )}
                                        <span className="text-sm font-bold text-white">
                                            {side === 'buy' ? 'SUI' : 'USDC'}
                                        </span>
                                        <ChevronDown className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {!isConnected ? (
                            <ConnectButton
                                className="w-full h-14 bg-cyan-400 hover:bg-cyan-500 text-[#0b0b0b] font-black text-lg rounded-2xl shadow-lg shadow-cyan-400/20 transition-all active:scale-95"
                            />
                        ) : (
                            <Button
                                className="w-full h-14 bg-cyan-400 hover:bg-cyan-500 text-[#0b0b0b] font-black text-lg rounded-2xl shadow-lg shadow-cyan-400/20 transition-all active:scale-95"
                                disabled={!route || isQuoting || isSubmitting}
                                onClick={handleSubmit}
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : isQuoting ? (
                                    'Quoting...'
                                ) : !payAmount ? (
                                    'Enter Amount'
                                ) : !route ? (
                                    'No Route Found'
                                ) : type === 'limit' ? (
                                    'Place Limit Order'
                                ) : (
                                    `Swap ${side === 'buy' ? 'USDC → SUI' : 'SUI → USDC'}`
                                )}
                            </Button>
                        )}
                    </div>

                    {/* Info Boxes */}
                    <div className="p-4 space-y-3 flex-1 overflow-y-auto no-scrollbar">
                        {[
                            { label: 'Minimum Received', value: route ? `${minReceived} ${side === 'buy' ? 'SUI' : 'USDC'}` : '-' },
                            { label: 'Price Impact', value: priceImpact, color: 'text-green-500' },
                            { label: 'Trading Fee', value: tradingFee },
                            { label: 'Route', value: routeSource, icon: true },
                        ].map((item) => (
                            <div key={item.label} className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest font-secondary">{item.label}</span>
                                <div className={cn("text-xs font-bold font-pixel text-gray-300", item.color)}>
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
