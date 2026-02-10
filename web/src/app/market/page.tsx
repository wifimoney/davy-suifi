'use client';

import * as React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { useSuiClient } from '@mysten/dapp-kit';
import { ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';

const MOCK_DATA = Array.from({ length: 20 }).map((_, i) => ({
    time: i,
    price: 1.5 + Math.random() * 0.2,
    volume: Math.random() * 1000
}));

export default function MarketPage() {
    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            <div className="flex items-end justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2 font-secondary">SUI / USDC</h1>
                    <div className="flex items-center gap-4">
                        <span className="text-2xl font-bold text-white font-pixel">$1.642</span>
                        <div className="flex items-center gap-1 text-green-400 text-sm font-bold bg-green-500/10 px-2 py-1 rounded-lg">
                            <ArrowUpRight className="w-4 h-4" />
                            +2.45%
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 text-sm text-gray-400">
                    <div>
                        <div className="text-xs uppercase font-bold text-gray-600">24h Vol</div>
                        <div className="font-pixel text-white">$42.5M</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase font-bold text-gray-600">24h High</div>
                        <div className="font-pixel text-white">$1.68</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase font-bold text-gray-600">24h Low</div>
                        <div className="font-pixel text-white">$1.55</div>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="h-[400px] w-full bg-[#111111] border border-white/5 rounded-2xl p-6 mb-8 relative group">
                <div className="absolute top-4 right-4 flex gap-2">
                    {['1H', '1D', '1W', '1M', '1Y'].map(t => (
                        <button key={t} className="px-3 py-1 text-xs font-bold rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors font-secondary">
                            {t}
                        </button>
                    ))}
                </div>

                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={MOCK_DATA}>
                        <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis dataKey="time" hide />
                        <YAxis
                            domain={['auto', 'auto']}
                            orientation="right"
                            tick={{ fill: '#666', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(val) => `$${val.toFixed(2)}`}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#111', borderColor: '#333' }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(val: number | string | (number | string)[] | undefined) => [
                                val !== undefined ? (typeof val === 'number' ? val.toFixed(4) : val.toString()) : '0',
                                'Price'
                            ]}
                        />
                        <Line
                            type="monotone"
                            dataKey="price"
                            stroke="#06b6d4"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, fill: '#fff' }}
                            animationDuration={1000}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Order Book & Recent Trades (Mock layout) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Order Book */}
                <div className="lg:col-span-2 bg-[#111111] border border-white/5 rounded-2xl p-6">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2 font-secondary">
                        <Activity className="w-4 h-4 text-cyan-500" />
                        Order Book
                    </h2>

                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-2 font-bold uppercase">
                                <span>Size (SUI)</span>
                                <span>Price (USDC)</span>
                            </div>
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="flex justify-between text-xs py-1 relative">
                                    <div className="absolute right-0 top-0 bottom-0 bg-red-500/10 w-[40%]" />
                                    <span className="text-gray-300 relative z-10 font-secondary">{(Math.random() * 1000).toFixed(2)}</span>
                                    <span className="text-red-400 relative z-10 font-bold font-pixel">{(1.65 + i * 0.01).toFixed(4)}</span>
                                </div>
                            ))}
                        </div>

                        <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-2 font-bold uppercase">
                                <span>Price (USDC)</span>
                                <span>Size (SUI)</span>
                            </div>
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="flex justify-between text-xs py-1 relative">
                                    <div className="absolute left-0 top-0 bottom-0 bg-green-500/10 w-[60%]" />
                                    <span className="text-green-400 relative z-10 font-bold font-pixel">{(1.64 - i * 0.01).toFixed(4)}</span>
                                    <span className="text-gray-300 relative z-10 font-secondary">{(Math.random() * 1000).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Market Info */}
                <div className="bg-[#111111] border border-white/5 rounded-2xl p-6">
                    <h2 className="text-lg font-bold text-white mb-4 font-secondary">Stats</h2>
                    <div className="space-y-4">
                        {[
                            { label: 'Market Cap', value: '$3.2B' },
                            { label: 'FDV', value: '$16.4B' },
                            { label: 'Circulating Supply', value: '2.1B SUI' },
                            { label: 'Total Supply', value: '10B SUI' },
                        ].map((item) => (
                            <div key={item.label} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                                <span className="text-sm text-gray-500">{item.label}</span>
                                <span className="text-sm font-bold text-white">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
