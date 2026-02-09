'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, CheckCircle2, Clock, XCircle } from 'lucide-react';

const MOCK_ORDERS = [
    {
        id: '0x123...abc',
        type: 'Limit Swap',
        pair: 'SUI → USDC',
        amountIn: '10 SUI',
        amountOut: '15 USDC',
        price: '1.5 USDC',
        status: 'filled',
        timestamp: '2 mins ago'
    },
    {
        id: '0x456...def',
        type: 'Intent',
        pair: 'USDC → SUI',
        amountIn: '50 USDC',
        amountOut: '35 SUI',
        price: '1.42 USDC',
        status: 'pending',
        timestamp: '15 mins ago'
    },
    {
        id: '0x789...ghi',
        type: 'Limit Swap',
        pair: 'SUI → USDC',
        amountIn: '100 SUI',
        amountOut: '200 USDC',
        price: '2.0 USDC',
        status: 'expired',
        timestamp: '1 day ago'
    }
];

const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
        filled: 'bg-green-500/10 text-green-500 border-green-500/20',
        pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        expired: 'bg-red-500/10 text-red-500 border-red-500/20',
    }[status] || 'bg-gray-500/10 text-gray-500';

    const icon = {
        filled: <CheckCircle2 className="w-3 h-3" />,
        pending: <Clock className="w-3 h-3" />,
        expired: <XCircle className="w-3 h-3" />
    }[status];

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles} capitalize`}>
            {icon}
            {status}
        </span>
    );
};

export function OrderList() {
    return (
        <Card className="h-full border-border bg-card/50 backdrop-blur-md shadow-xl flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xl font-bold">Activity</CardTitle>
                <Button variant="ghost" size="sm" className="text-xs text-blue-400">View Explorer <ArrowUpRight className="w-3 h-3 ml-1" /></Button>
            </CardHeader>
            <CardContent className="p-0 flex-1">
                <Tabs defaultValue="all" className="w-full">
                    <div className="px-6 border-b border-border/50">
                        <TabsList className="bg-transparent h-10 p-0 space-x-6">
                            {['all', 'open', 'history'].map((tab) => (
                                <TabsTrigger
                                    key={tab}
                                    value={tab}
                                    className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-0 py-2 text-muted-foreground hover:text-foreground transition-colors capitalize"
                                >
                                    {tab}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>

                    <TabsContent value="all" className="p-0 m-0">
                        <div className="divide-y divide-border/50">
                            {MOCK_ORDERS.map((order) => (
                                <div key={order.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group">
                                    <div className="flex gap-4 items-center">
                                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                                            {order.pair.startsWith('SUI') ? 'S' : 'U'}
                                        </div>
                                        <div>
                                            <div className="font-medium flex items-center gap-2">
                                                {order.pair}
                                                <StatusBadge status={order.status} />
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                {order.type} • {order.timestamp}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-medium">{order.amountIn}</div>
                                        <div className="text-xs text-muted-foreground">→ {order.amountOut}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
