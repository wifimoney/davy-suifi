'use client';

import * as React from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import {
    Maximize2,
    Camera,
    Settings2,
    ChevronDown,
    RotateCcw,
    Undo2,
    Redo2,
    BarChart2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const data = [
    { time: '12:00', price: 0.9670 },
    { time: '13:00', price: 0.9716 },
    { time: '14:00', price: 0.9648 },
    { time: '15:00', price: 0.9780 },
    { time: '16:00', price: 0.9740 },
    { time: '17:00', price: 0.9850 },
    { time: '18:00', price: 0.9716 },
    { time: '19:00', price: 0.9790 },
    { time: '20:00', price: 0.9810 },
    { time: '21:00', price: 0.9840 },
    { time: '22:00', price: 0.9760 },
    { time: '23:00', price: 0.9820 },
    { time: '00:00', price: 0.9716 },
    { time: '01:00', price: 0.9716 },
];

export function MainChart() {
    return (
        <div className="flex-1 bg-[#0b0b0b] flex flex-col h-full overflow-hidden select-none">
            {/* Chart Toolbar */}
            <div className="h-10 border-b border-white/5 flex items-center px-4 gap-4 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1 border-r border-white/10 pr-4">
                    {['5m', '15m', '1h', '4h', '1D'].map((t) => (
                        <button
                            key={t}
                            className={cn(
                                "px-2 py-1 rounded text-[10px] font-bold transition-all font-secondary",
                                t === '15m' ? "bg-white/10 text-cyan-400" : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            {t}
                        </button>
                    ))}
                    <ChevronDown className="w-3 h-3 text-gray-600" />
                </div>

                <div className="flex items-center gap-4 border-r border-white/10 pr-4">
                    <BarChart2 className="w-4 h-4 text-cyan-400" />
                    <div className="flex items-center gap-1 text-[10px] font-bold text-gray-500 cursor-pointer font-secondary">
                        Indicators <ChevronDown className="w-3 h-3" />
                    </div>
                </div>

                <div className="flex items-center gap-4 border-r border-white/10 pr-4">
                    <Undo2 className="w-4 h-4 text-gray-600 hover:text-gray-400 cursor-pointer" />
                    <Redo2 className="w-4 h-4 text-gray-600 hover:text-gray-400 cursor-pointer" />
                </div>

                <div className="flex items-center gap-4 ml-auto">
                    <Settings2 className="w-4 h-4 text-gray-500 hover:text-gray-300 cursor-pointer" />
                    <Maximize2 className="w-4 h-4 text-gray-500 hover:text-gray-300 cursor-pointer" />
                    <Camera className="w-4 h-4 text-gray-500 hover:text-gray-300 cursor-pointer" />
                </div>
            </div>

            {/* Chart Overlay Info */}
            <div className="p-4 flex flex-col gap-1 relative z-10 pointer-events-none">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white font-secondary">SUI</span>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
                <div className="flex gap-3 text-[10px] font-mono font-pixel">
                    <span className="text-gray-500">O <span className="text-green-500">0.9670</span></span>
                    <span className="text-gray-500">H <span className="text-green-500">0.9716</span></span>
                    <span className="text-gray-500">L <span className="text-red-500">0.9648</span></span>
                    <span className="text-gray-500">C <span className="text-green-500">0.9716</span></span>
                    <span className="text-cyan-500">+0.48%</span>
                </div>
                <div className="text-[10px] text-gray-600 font-mono font-pixel">Volume 47.04K</div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.1} />
                                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                        <XAxis
                            dataKey="time"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#666' }}
                            dy={10}
                        />
                        <YAxis
                            orientation="right"
                            domain={['dataMin - 0.005', 'dataMax + 0.005']}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#666', fontWeight: 'bold' }}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#151515', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                            itemStyle={{ color: '#22d3ee' }}
                            labelStyle={{ color: '#666' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="price"
                            stroke="#22d3ee"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorPrice)"
                            animationDuration={1500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Bottom Status Ticker (Mock) */}
            <div className="h-8 border-t border-white/5 flex items-center justify-between px-4 text-[10px] font-bold text-gray-600">
                <div className="flex items-center gap-4">
                    <span className="text-cyan-500/80">09 Feb '26 01:45</span>
                    <span>UTC + 0</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span>Connected to Mainnet</span>
                </div>
            </div>
        </div>
    );
}
