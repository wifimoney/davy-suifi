'use client';

import * as React from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Star } from 'lucide-react';
import { SuiIcon, UsdcIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

export function Ticker() {
    const trending = [
        { name: 'SUI', price: '$0.9716', change: '-2.59%', isUp: false, icon: SuiIcon },
        { name: 'USDC', price: '$1.0000', change: '+0.01%', isUp: true, icon: UsdcIcon },
        { name: 'DEEP', price: '$0.0249', change: '-3.3%', isUp: false },
        { name: 'NS', price: '$0.0193', change: '-0.96%', isUp: false },
        { name: 'WBTC', price: '$70,095', change: '+1.89%', isUp: true },
        { name: 'MAGMA', price: '$0.1078', change: '+6.72%', isUp: true },
    ];

    return (
        <div className="fixed top-16 left-0 right-0 h-12 bg-[#0b0b0b] border-b border-white/5 z-40 flex items-center px-6 overflow-hidden select-none">
            <div className="flex items-center gap-2 mr-6 text-xs font-bold text-gray-500 whitespace-nowrap">
                <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="uppercase tracking-wider">Trending</span>
            </div>

            <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
                {trending.map((token, i) => (
                    <div key={token.name} className="flex items-center gap-2 group cursor-pointer">
                        <span className="text-[10px] font-bold text-gray-600">#{i + 1}</span>
                        <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                            {token.icon ? <token.icon className="w-3.5 h-3.5" /> : <div className="w-3 h-3 rounded-full bg-blue-400" />}
                        </div>
                        <span className="text-xs font-bold text-gray-200 group-hover:text-cyan-400 transition-colors font-secondary">
                            {token.name}
                        </span>
                        <span className="text-xs font-bold text-gray-400 font-pixel">{token.price}</span>
                        <span className={cn(
                            "text-[10px] font-bold flex items-center font-pixel",
                            token.isUp ? "text-green-500" : "text-red-500"
                        )}>
                            {token.isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {token.change}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
