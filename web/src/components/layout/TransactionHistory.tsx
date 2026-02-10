'use client';

import * as React from 'react';
import {
    ArrowUpRight,
    ArrowDownRight,
    ArrowDownLeft,
    Clock,
    XCircle,
    CheckCircle2,
    ExternalLink,
    Filter,
    RefreshCcw,
    Loader2,
    History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { DAVY_CONFIG } from '@/config';

type EventType = 'offer_created' | 'offer_filled' | 'offer_withdrawn' | 'offer_expired'
    | 'intent_submitted' | 'intent_executed' | 'intent_cancelled' | 'intent_expired';

type EventFilter = 'all' | 'offers' | 'intents' | 'fills';

interface DavyEvent {
    id: string;
    type: EventType;
    description: string;
    amount: string;
    counterAmount: string;
    price: string;
    timestamp: number;
    txDigest: string;
    isIncoming: boolean; // User received assets
}

const EVENT_META: Record<EventType, { icon: typeof ArrowUpRight; color: string; label: string }> = {
    offer_created: { icon: ArrowUpRight, color: 'text-cyan-400', label: 'Offer Created' },
    offer_filled: { icon: ArrowDownLeft, color: 'text-green-400', label: 'Offer Filled' },
    offer_withdrawn: { icon: ArrowDownRight, color: 'text-amber-400', label: 'Withdrawn' },
    offer_expired: { icon: Clock, color: 'text-gray-400', label: 'Offer Expired' },
    intent_submitted: { icon: ArrowUpRight, color: 'text-purple-400', label: 'Intent Submitted' },
    intent_executed: { icon: CheckCircle2, color: 'text-green-400', label: 'Intent Executed' },
    intent_cancelled: { icon: XCircle, color: 'text-amber-400', label: 'Intent Cancelled' },
    intent_expired: { icon: Clock, color: 'text-gray-400', label: 'Intent Expired' },
};

function formatAmount(raw: string | bigint | number, decimals: number = 9): string {
    const n = Number(raw) / Math.pow(10, decimals);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
    if (n === 0) return '—';
    return n.toFixed(4);
}

function formatPrice(raw: string | bigint | number): string {
    const n = Number(raw) / 1e9;
    if (n === 0) return '—';
    return n.toFixed(4);
}

function formatTimestamp(ms: number): string {
    const d = new Date(ms);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return time;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function timeAgo(ms: number): string {
    const diff = Date.now() - ms;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function TransactionHistory() {
    const [filter, setFilter] = React.useState<EventFilter>('all');
    const account = useCurrentAccount();
    const suiClient = useSuiClient();

    const { data: events, isLoading, refetch } = useQuery({
        queryKey: ['tx-history', account?.address],
        queryFn: async (): Promise<DavyEvent[]> => {
            if (!account?.address) return [];

            const PKG = DAVY_CONFIG.packageId;
            const eventTypes = [
                'OfferCreated', 'OfferFilled', 'OfferWithdrawn', 'OfferExpired',
                'IntentSubmitted', 'IntentExecuted', 'IntentCancelled', 'IntentExpired',
            ];

            const results = await Promise.all(
                eventTypes.map((t) =>
                    suiClient.queryEvents({
                        query: { MoveEventType: `${PKG}::events::${t}` },
                        order: 'descending',
                        limit: 100,
                    })
                )
            );

            const allEvents: DavyEvent[] = [];

            for (let i = 0; i < results.length; i++) {
                const eventType = eventTypes[i];
                for (const ev of results[i].data) {
                    const f = ev.parsedJson as any;
                    const ts = Number(ev.timestampMs ?? Date.now());
                    const txDigest = ev.id?.txDigest ?? '';

                    // Filter to events involving this user
                    const isMaker = f.maker === account.address;
                    const isTaker = f.taker === account.address;
                    const isCreator = f.creator === account.address;
                    if (!isMaker && !isTaker && !isCreator) continue;

                    let mapped: DavyEvent | null = null;

                    switch (eventType) {
                        case 'OfferCreated':
                            if (isMaker) mapped = {
                                id: f.offer_id, type: 'offer_created',
                                description: `Escrowed ${formatAmount(f.initial_offer_amount)} SUI`,
                                amount: formatAmount(f.initial_offer_amount),
                                counterAmount: '—',
                                price: `${formatPrice(f.min_price)}${f.max_price !== f.min_price ? ` — ${formatPrice(f.max_price)}` : ''}`,
                                timestamp: ts, txDigest, isIncoming: false,
                            };
                            break;
                        case 'OfferFilled':
                            if (isMaker) mapped = {
                                id: f.offer_id, type: 'offer_filled',
                                description: `Sold ${formatAmount(f.fill_amount)} SUI`,
                                amount: formatAmount(f.fill_amount),
                                counterAmount: `+${formatAmount(f.payment_amount, 6)} USDC`,
                                price: formatPrice(f.price),
                                timestamp: ts, txDigest, isIncoming: true,
                            };
                            else if (isTaker) mapped = {
                                id: f.offer_id, type: 'offer_filled',
                                description: `Bought ${formatAmount(f.fill_amount)} SUI`,
                                amount: formatAmount(f.fill_amount),
                                counterAmount: `-${formatAmount(f.payment_amount, 6)} USDC`,
                                price: formatPrice(f.price),
                                timestamp: ts, txDigest, isIncoming: true,
                            };
                            break;
                        case 'OfferWithdrawn':
                            if (isMaker) mapped = {
                                id: f.offer_id, type: 'offer_withdrawn',
                                description: `Withdrew ${formatAmount(f.withdrawn_amount)} SUI`,
                                amount: formatAmount(f.withdrawn_amount),
                                counterAmount: '—', price: '—',
                                timestamp: ts, txDigest, isIncoming: true,
                            };
                            break;
                        case 'OfferExpired':
                            if (isMaker) mapped = {
                                id: f.offer_id, type: 'offer_expired',
                                description: `Offer expired, ${formatAmount(f.returned_amount)} SUI returned`,
                                amount: formatAmount(f.returned_amount),
                                counterAmount: '—', price: '—',
                                timestamp: ts, txDigest, isIncoming: true,
                            };
                            break;
                        case 'IntentSubmitted':
                            if (isCreator) mapped = {
                                id: f.intent_id, type: 'intent_submitted',
                                description: `Intent: Buy ${formatAmount(f.receive_amount)} SUI`,
                                amount: formatAmount(f.receive_amount),
                                counterAmount: `Escrowed ${formatAmount(f.escrowed_amount, 6)} USDC`,
                                price: `${formatPrice(f.min_price)} — ${formatPrice(f.max_price)}`,
                                timestamp: ts, txDigest, isIncoming: false,
                            };
                            break;
                        case 'IntentExecuted':
                            if (isCreator) mapped = {
                                id: f.intent_id, type: 'intent_executed',
                                description: `Received ${formatAmount(f.receive_amount)} SUI`,
                                amount: formatAmount(f.receive_amount),
                                counterAmount: `-${formatAmount(f.payment_amount, 6)} USDC`,
                                price: formatPrice(f.execution_price),
                                timestamp: ts, txDigest, isIncoming: true,
                            };
                            break;
                        case 'IntentCancelled':
                            if (isCreator) mapped = {
                                id: f.intent_id, type: 'intent_cancelled',
                                description: `Intent cancelled, escrow returned`,
                                amount: formatAmount(f.returned_amount, 6),
                                counterAmount: '—', price: '—',
                                timestamp: ts, txDigest, isIncoming: true,
                            };
                            break;
                        case 'IntentExpired':
                            if (isCreator) mapped = {
                                id: f.intent_id, type: 'intent_expired',
                                description: `Intent expired, escrow returned`,
                                amount: formatAmount(f.returned_amount, 6),
                                counterAmount: '—', price: '—',
                                timestamp: ts, txDigest, isIncoming: true,
                            };
                            break;
                    }

                    if (mapped) allEvents.push(mapped);
                }
            }

            return allEvents.sort((a, b) => b.timestamp - a.timestamp);
        },
        enabled: !!account?.address,
        refetchInterval: 15_000,
    });

    const filteredEvents = React.useMemo(() => {
        if (!events) return [];
        switch (filter) {
            case 'offers': return events.filter((e) => e.type.startsWith('offer_'));
            case 'intents': return events.filter((e) => e.type.startsWith('intent_'));
            case 'fills': return events.filter((e) => e.type === 'offer_filled' || e.type === 'intent_executed');
            default: return events;
        }
    }, [events, filter]);

    return (
        <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <History className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-secondary">
                        Transaction History
                    </span>
                    {events && (
                        <span className="text-[9px] text-gray-600 font-secondary">
                            ({filteredEvents.length})
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {(['all', 'fills', 'offers', 'intents'] as EventFilter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "px-2 py-1 rounded text-[9px] font-bold font-secondary transition-all",
                                filter === f
                                    ? "bg-white/5 text-white"
                                    : "text-gray-600 hover:text-gray-400"
                            )}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                    <button onClick={() => refetch()} className="p-1 rounded hover:bg-white/5">
                        <RefreshCcw className="w-3 h-3 text-gray-600" />
                    </button>
                </div>
            </div>

            {/* Events */}
            {isLoading ? (
                <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
                </div>
            ) : filteredEvents.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                    <p className="text-xs text-gray-600 font-secondary">No transactions yet</p>
                </div>
            ) : (
                <div className="divide-y divide-white/[0.03] max-h-[500px] overflow-y-auto">
                    {filteredEvents.map((ev, i) => {
                        const meta = EVENT_META[ev.type];
                        const Icon = meta.icon;

                        return (
                            <div
                                key={`${ev.id}-${ev.type}-${i}`}
                                className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors group"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn(
                                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                                        ev.isIncoming ? "bg-green-500/10" : "bg-white/5"
                                    )}>
                                        <Icon className={cn("w-3.5 h-3.5", meta.color)} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-white font-secondary truncate">
                                                {ev.description}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded font-secondary", meta.color, "bg-white/5")}>
                                                {meta.label}
                                            </span>
                                            {ev.price !== '—' && (
                                                <span className="text-[9px] text-gray-600 font-secondary">
                                                    @ {ev.price}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-right">
                                        {ev.counterAmount !== '—' && (
                                            <div className={cn(
                                                "text-xs font-bold font-pixel",
                                                ev.counterAmount.startsWith('+') ? "text-green-400" : "text-gray-300"
                                            )}>
                                                {ev.counterAmount}
                                            </div>
                                        )}
                                        <div className="text-[9px] text-gray-600 font-secondary">
                                            {timeAgo(ev.timestamp)}
                                        </div>
                                    </div>
                                    {ev.txDigest && (
                                        <a
                                            href={`https://suiscan.xyz/testnet/tx/${ev.txDigest}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 rounded hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <ExternalLink className="w-3 h-3 text-gray-600" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
