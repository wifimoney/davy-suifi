'use client';

import * as React from 'react';
import {
    Settings,
    Info,
    RefreshCcw,
    ChevronDown,
    ArrowDownUp,
    Zap,
    Merge
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SuiIcon, UsdcIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

export function TradeBox() {
    const [side, setSide] = React.useState<'buy' | 'sell'>('buy');
    const [type, setType] = React.useState('swap');

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
                        <RefreshCcw className="w-3.5 h-3.5 text-gray-500 cursor-pointer hover:text-gray-200" />
                    </div>
                </div>

                {/* Inputs */}
                <div className="space-y-1 relative">
                    <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-gray-500">You Pay</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <input
                                type="text"
                                placeholder="0.0"
                                className="bg-transparent text-2xl font-bold text-white outline-none w-full"
                            />
                            <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/10 transition-colors">
                                <UsdcIcon className="w-5 h-5" />
                                <span className="text-sm font-bold text-white">USDC</span>
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
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <input
                                type="text"
                                placeholder="0.0"
                                className="bg-transparent text-2xl font-bold text-white outline-none w-full"
                            />
                            <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/10 transition-colors">
                                <SuiIcon className="w-5 h-5" />
                                <span className="text-sm font-bold text-white">SUI</span>
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                    </div>
                </div>

                <Button className="w-full h-14 bg-cyan-400 hover:bg-cyan-500 text-[#0b0b0b] font-black text-lg rounded-2xl shadow-lg shadow-cyan-400/20 transition-all active:scale-95">
                    Connect Wallet
                </Button>
            </div>

            {/* Info Boxes */}
            <div className="p-4 space-y-3 flex-1 overflow-y-auto no-scrollbar">
                {[
                    { label: 'Minimum Received', value: '45.22 SUI' },
                    { label: 'Price Impact', value: '< 0.01%', color: 'text-green-500' },
                    { label: 'Trading Fee', value: '$0.12' },
                    { label: 'Route', value: 'USDC -> SUI', icon: true },
                ].map((item) => (
                    <div key={item.label} className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest font-secondary">{item.label}</span>
                        <div className={cn("text-xs font-bold font-pixel text-gray-300", item.color)}>
                            {item.value}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
