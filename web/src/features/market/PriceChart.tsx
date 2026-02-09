'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';

// Mock Data Generator
const generateData = (count: number) => {
    let price = 1.0;
    const data = [];
    for (let i = 0; i < count; i++) {
        const change = (Math.random() - 0.5) * 0.05;
        price += change;
        data.push({
            time: i,
            price: price
        });
    }
    return data;
};

const data = generateData(100);

export function PriceChart() {
    const [activeTimeframe, setActiveTimeframe] = useState('1H');

    return (
        <Card className="h-full border-border bg-card/50 backdrop-blur-md shadow-xl flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-2 text-xl font-bold">
                        SUI / USDC
                        <span className="text-sm font-normal text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">
                            Testnet
                        </span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold font-mono text-foreground">$1.024</span>
                        <span className="text-sm font-medium text-green-500">+2.4%</span>
                    </div>
                </div>

                <Tabs defaultValue="1H" value={activeTimeframe} onValueChange={setActiveTimeframe}>
                    <TabsList className="bg-secondary/50">
                        {['1H', '4H', '1D', '1W'].map((tf) => (
                            <TabsTrigger key={tf} value={tf} className="text-xs px-2 h-7">
                                {tf}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </CardHeader>

            <CardContent className="flex-1 min-h-[300px] p-0 pb-4">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
                        <XAxis dataKey="time" hide />
                        <YAxis
                            domain={['auto', 'auto']}
                            orientation="right"
                            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(val) => `$${val.toFixed(2)}`}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--popover)',
                                borderColor: 'var(--border)',
                                borderRadius: 'var(--radius)',
                                color: 'var(--popover-foreground)'
                            }}
                            itemStyle={{ color: 'var(--primary)' }}
                            formatter={(val: any) => [`$${Number(val).toFixed(4)}`, 'Price']}
                            labelFormatter={() => ''}
                        />
                        <Area
                            type="monotone"
                            dataKey="price"
                            stroke="var(--primary)"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorPrice)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
