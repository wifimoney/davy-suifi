'use client';

import * as React from 'react';
import {
    Info,
    RotateCcw,
    ArrowLeftRight,
    Star,
    ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SuiIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

export function AssetSidePanel() {
    const stats = [
        { label: 'Price USD', value: '$0.9716' },
        { label: 'Liquidity', value: '$49.14M' },
        { label: 'FDV', value: '$9.72B' },
        { label: 'Market Cap', value: '$3.74B' },
        { label: 'Total Supply', value: '10.00B' },
        { label: 'Circ. Supply', value: '3.84B' },
    ];

    const timeStats = [
        { label: '30M', value: '+0.15%', isUp: true },
        { label: '1H', value: '-0.7%', isUp: false },
        { label: '4H', value: '-1.22%', isUp: false },
        { label: '24H', value: '-2.59%', isUp: false },
    ];

    return (
        <div className="w-[280px] bg-[#0b0b0b] border-r border-white/5 flex flex-col h-full select-none">
            {/* Header Info */}
            <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                            <SuiIcon className="w-7 h-7" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1">
                                <span className="text-sm font-bold text-white uppercase tracking-tight">SUI</span>
                                <ShieldCheck className="w-3 h-3 text-cyan-400 fill-cyan-400" />
                            </div>
                            <div className="text-[10px] text-gray-500 font-medium">SUI Token</div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/5">
                            <RotateCcw className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/5">
                            <ArrowLeftRight className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-yellow-500 hover:bg-white/5">
                            <Star className="w-4 h-4 fill-yellow-500" />
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-y-6 pt-2">
                    {stats.map((s) => (
                        <div key={s.label} className="space-y-1">
                            <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-gray-500 tracking-wider font-secondary">
                                {s.label} <Info className="w-2.5 h-2.5" />
                            </div>
                            <div className="text-sm font-bold text-gray-200 font-pixel">{s.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="px-6">
                <div className="bg-[#151515] rounded-xl grid grid-cols-4 p-1 border border-white/5">
                    {timeStats.map((s) => (
                        <div key={s.label} className={cn(
                            "flex flex-col items-center py-2 rounded-lg transition-colors cursor-pointer hover:bg-white/5",
                            s.label === '24H' ? "bg-white/5" : ""
                        )}>
                            <span className="text-[9px] font-black text-gray-600 mb-1 font-secondary">{s.label}</span>
                            <span className={cn(
                                "text-[10px] font-bold font-pixel",
                                s.isUp ? "text-green-500" : "text-red-500"
                            )}>
                                {s.value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Detailed Trading Stats */}
            <div className="p-6 space-y-6 flex-1">
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-secondary">Txns</div>
                            <div className="text-sm font-bold text-gray-200 font-pixel">117.91K</div>
                        </div>
                        <div className="text-right space-y-1">
                            <div className="flex justify-end gap-6">
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-secondary">Buys</div>
                                    <div className="text-sm font-bold text-gray-200 text-right font-pixel">58.80K</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-secondary">Sells</div>
                                    <div className="text-sm font-bold text-gray-200 text-right font-pixel">59.11K</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Visual Bar */}
                    <div className="h-1.5 w-full bg-red-500 rounded-full flex overflow-hidden">
                        <div className="h-full bg-green-500 transition-all duration-700" style={{ width: '49.8%' }} />
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-secondary">Volume</div>
                            <div className="text-sm font-bold text-gray-200 font-pixel">$12.62M</div>
                        </div>
                        <div className="text-right space-y-1">
                            <div className="flex justify-end gap-6">
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-secondary">Buy VOL</div>
                                    <div className="text-sm font-bold text-gray-200 text-right font-pixel">$5.99M</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-secondary">Sell VOL</div>
                                    <div className="text-sm font-bold text-gray-200 text-right font-pixel">$6.63M</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Visual Bar */}
                    <div className="h-1.5 w-full bg-red-500 rounded-full flex overflow-hidden">
                        <div className="h-full bg-green-500 transition-all duration-700" style={{ width: '47.4%' }} />
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-secondary">Makers</div>
                            <div className="text-sm font-bold text-gray-200 font-pixel">6.14K</div>
                        </div>
                        <div className="text-right space-y-1">
                            <div className="flex justify-end gap-6">
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-secondary">Buyers</div>
                                    <div className="text-sm font-bold text-gray-200 text-right font-pixel">4.53K</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-secondary">Sellers</div>
                                    <div className="text-sm font-bold text-gray-200 text-right font-pixel">4.67K</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Visual Bar */}
                    <div className="h-1.5 w-full bg-red-500 rounded-full flex overflow-hidden">
                        <div className="h-full bg-green-500 transition-all duration-700" style={{ width: '49.2%' }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Subcomponent or helper for icons
function ShieldCheck(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    );
}
