'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, CheckCircle2, Clock, XCircle, ExternalLink, MinusCircle } from 'lucide-react';
import { useOrderEvents } from '@/hooks/use-order-events';
import type { OrderEvent } from '@/hooks/use-order-events';

const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
        filled: 'bg-green-500/10 text-green-500 border-green-500/20',
        pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        expired: 'bg-red-500/10 text-red-500 border-red-500/20',
        cancelled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
        withdrawn: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    }[status] || 'bg-gray-500/10 text-gray-500';

    const icon = {
        filled: <CheckCircle2 className="w-3 h-3" />,
        pending: <Clock className="w-3 h-3" />,
        expired: <XCircle className="w-3 h-3" />,
        cancelled: <MinusCircle className="w-3 h-3" />,
        withdrawn: <ArrowUpRight className="w-3 h-3" />,
    }[status];

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles} capitalize`}>
            {icon}
            {status}
        </span>
    );
};

function formatTimestamp(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} mins ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return `${Math.floor(diff / 86400_000)}d ago`;
}

function SkeletonLoader() {
    return (
        <div className="divide-y divide-border/50">
            {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 flex items-center gap-4 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-secondary" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-secondary rounded w-3/4" />
                        <div className="h-3 bg-secondary rounded w-1/2" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function EmptyState() {
    return (
        <div className="py-12 flex flex-col items-center text-gray-500">
            <Clock className="w-8 h-8 text-gray-600 mb-3" />
            <div className="font-secondary text-sm font-bold">No activity yet</div>
            <div className="text-[10px] text-gray-600 mt-1">Your trades will appear here</div>
        </div>
    );
}

function OrderRow({ order }: { order: OrderEvent }) {
    return (
        <div className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between group">
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
                        <span className="text-[10px] uppercase font-bold text-gray-500 font-secondary">
                            {order.type.replace('_', ' ')}
                        </span>
                        {' '}&middot;{' '}
                        <span className="text-[10px] text-gray-500">{formatTimestamp(order.timestamp)}</span>
                    </div>
                </div>
            </div>
            <div className="text-right flex items-center gap-3">
                <div>
                    <div className="font-pixel text-sm">{order.amountIn}</div>
                    {order.amountOut !== '-' && (
                        <div className="text-xs text-muted-foreground">&rarr; {order.amountOut}</div>
                    )}
                </div>
                {order.txDigest && (
                    <a
                        href={`https://suiscan.xyz/testnet/tx/${order.txDigest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                )}
            </div>
        </div>
    );
}

function OrderListContent({ filter }: { filter: 'all' | 'open' | 'history' }) {
    const { data: events, isLoading, error } = useOrderEvents(filter);

    if (isLoading) return <SkeletonLoader />;
    if (error) return <div className="p-4 text-red-500 text-sm">Failed to load events</div>;
    if (!events || events.length === 0) return <EmptyState />;

    return (
        <div className="divide-y divide-border/50">
            {events.map((order, i) => (
                <OrderRow key={`${order.id}-${order.type}-${i}`} order={order} />
            ))}
        </div>
    );
}

export function OrderList() {
    const [activeTab, setActiveTab] = useState('all');

    return (
        <Card className="h-full border-border bg-card/50 backdrop-blur-md shadow-xl flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xl font-bold">Activity</CardTitle>
                <Button variant="ghost" size="sm" className="text-xs text-blue-400">
                    View Explorer <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
            </CardHeader>
            <CardContent className="p-0 flex-1">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                        <OrderListContent filter="all" />
                    </TabsContent>
                    <TabsContent value="open" className="p-0 m-0">
                        <OrderListContent filter="open" />
                    </TabsContent>
                    <TabsContent value="history" className="p-0 m-0">
                        <OrderListContent filter="history" />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
