'use client';

import * as React from 'react';
import {
    Zap,
    ArrowRight,
    CheckCircle2,
    TrendingDown,
    Layers,
    Loader2,
    Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RouteQuote {
    venue: string;
    venueLabel: string;
    fillAmount: bigint;
    payAmount: bigint;
    effectivePrice: number;
    priceImpact: number;
    legs: { venue: string; amount: bigint; price: number }[];
    latencyMs: number;
    isBest: boolean;
}

interface RouteComparisonProps {
    offerSymbol: string;
    wantSymbol: string;
    requestAmount: string;
    quotes: RouteQuote[];
    isLoading: boolean;
    onSelect: (venue: string) => void;
    selectedVenue: string | null;
}

const VENUE_COLORS: Record<string, { accent: string; bg: string; border: string }> = {
    davy: { accent: 'text-cyan-400', bg: 'bg-cyan-500/5', border: 'border-cyan-500/20' },
    'davy-split': { accent: 'text-cyan-400', bg: 'bg-cyan-500/5', border: 'border-cyan-500/20' },
    deepbook: { accent: 'text-blue-400', bg: 'bg-blue-500/5', border: 'border-blue-500/20' },
    cetus: { accent: 'text-purple-400', bg: 'bg-purple-500/5', border: 'border-purple-500/20' },
    turbos: { accent: 'text-orange-400', bg: 'bg-orange-500/5', border: 'border-orange-500/20' },
};

function formatPrice(n: number): string {
    if (n === 0) return '—';
    return n.toFixed(6);
}

function formatAmount(raw: bigint, decimals: number = 9): string {
    const n = Number(raw) / Math.pow(10, decimals);
    return n.toFixed(4);
}

function savingsPercent(best: number, other: number): string {
    if (other === 0 || best === 0) return '0.00';
    const pct = ((other - best) / other) * 100;
    return pct.toFixed(2);
}

export function RouteComparison({
    offerSymbol,
    wantSymbol,
    requestAmount,
    quotes,
    isLoading,
    onSelect,
    selectedVenue,
}: RouteComparisonProps) {
    const bestQuote = quotes.find((q) => q.isBest);

    if (isLoading) {
        return (
            <div className="bg-[#111111] border border-white/5 rounded-2xl p-6">
                <div className="flex items-center gap-3">
                    <Loader2 className="w-4 h-4 text-cyan-500 animate-spin" />
                    <span className="text-xs text-gray-400 font-secondary">
                        Comparing routes across venues…
                    </span>
                </div>
                {/* Skeleton */}
                <div className="mt-4 space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 rounded-xl bg-white/[0.02] animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (quotes.length === 0) return null;

    return (
        <div className="bg-[#111111] border border-white/5 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-cyan-500" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-secondary">
                        Route Comparison
                    </span>
                </div>
                <span className="text-[10px] text-gray-600 font-secondary">
                    {requestAmount} {wantSymbol} → {offerSymbol}
                </span>
            </div>

            {/* Routes */}
            <div className="p-3 space-y-2">
                {quotes.map((q) => {
                    const colors = VENUE_COLORS[q.venue] ?? VENUE_COLORS.davy;
                    const isSelected = selectedVenue === q.venue;
                    const savings = bestQuote && !q.isBest
                        ? savingsPercent(bestQuote.effectivePrice, q.effectivePrice)
                        : null;

                    return (
                        <button
                            key={q.venue}
                            onClick={() => onSelect(q.venue)}
                            className={cn(
                                "w-full text-left rounded-xl border p-4 transition-all",
                                isSelected
                                    ? `${colors.bg} ${colors.border}`
                                    : "border-white/5 hover:border-white/10 hover:bg-white/[0.02]"
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    {/* Venue name + badge */}
                                    <div className="flex items-center gap-2">
                                        <span className={cn("text-xs font-bold font-secondary", colors.accent)}>
                                            {q.venueLabel}
                                        </span>
                                        {q.isBest && (
                                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[9px] font-bold font-secondary">
                                                <CheckCircle2 className="w-2.5 h-2.5" />
                                                Best Price
                                            </span>
                                        )}
                                        {q.legs.length > 1 && (
                                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 text-gray-400 text-[9px] font-bold font-secondary">
                                                <Layers className="w-2.5 h-2.5" />
                                                Split Route
                                            </span>
                                        )}
                                    </div>

                                    {/* Route legs */}
                                    {q.legs.length > 1 && (
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {q.legs.map((leg, i) => (
                                                <React.Fragment key={i}>
                                                    <span className="text-[9px] text-gray-500 font-secondary bg-white/5 px-1.5 py-0.5 rounded">
                                                        {formatAmount(leg.amount)} @ {leg.price.toFixed(4)} via {leg.venue}
                                                    </span>
                                                    {i < q.legs.length - 1 && (
                                                        <ArrowRight className="w-2.5 h-2.5 text-gray-700" />
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Price + savings */}
                                <div className="text-right space-y-1">
                                    <div className="text-sm font-bold text-white font-pixel">
                                        {formatAmount(q.fillAmount)}
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-secondary">
                                        {offerSymbol}
                                    </div>
                                    {savings && parseFloat(savings) > 0 && (
                                        <div className="flex items-center justify-end gap-1">
                                            <TrendingDown className="w-2.5 h-2.5 text-red-400" />
                                            <span className="text-[9px] text-red-400 font-secondary">
                                                -{savings}%
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Details row */}
                            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
                                {[
                                    { label: 'Eff. Price', value: `${formatPrice(q.effectivePrice)} ${wantSymbol}` },
                                    { label: 'Impact', value: `${q.priceImpact.toFixed(3)}%` },
                                    { label: 'Latency', value: `${q.latencyMs}ms` },
                                    { label: 'Pay', value: `${formatAmount(q.payAmount, 6)} ${wantSymbol}` },
                                ].map((d) => (
                                    <div key={d.label}>
                                        <span className="text-[8px] text-gray-600 font-secondary uppercase">{d.label}</span>
                                        <div className="text-[10px] text-gray-400 font-pixel">{d.value}</div>
                                    </div>
                                ))}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Footer savings callout */}
            {bestQuote && quotes.length > 1 && (
                <div className="px-5 py-3 border-t border-white/5 flex items-center gap-2">
                    <Info className="w-3 h-3 text-gray-600 shrink-0" />
                    <p className="text-[10px] text-gray-500 font-secondary">
                        {bestQuote.venue.includes('davy') ? (
                            <>Davy offers save you up to <span className="text-green-400 font-bold">
                                {savingsPercent(
                                    bestQuote.effectivePrice,
                                    quotes.filter(q => !q.isBest)[0]?.effectivePrice ?? bestQuote.effectivePrice
                                )}%
                            </span> vs external venues on this trade.</>
                        ) : (
                            <>No Davy offers currently beat external venues for this size. Consider submitting an intent for execution.</>
                        )}
                    </p>
                </div>
            )}
        </div>
    );
}
