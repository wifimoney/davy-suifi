'use client';

import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { DAVY_CONFIG } from '@/config';

export interface OrderEvent {
    id: string;
    type: 'offer_created' | 'offer_filled' | 'offer_withdrawn' | 'offer_expired'
    | 'intent_submitted' | 'intent_executed' | 'intent_cancelled' | 'intent_expired';
    pair: string;
    amountIn: string;
    amountOut: string;
    price: string;
    status: 'filled' | 'pending' | 'expired' | 'cancelled' | 'withdrawn';
    timestamp: number;
    txDigest: string;
}

const PKG = DAVY_CONFIG.packageId;

const EVENT_TYPES = [
    'OfferCreated',
    'OfferFilled',
    'OfferWithdrawn',
    'OfferExpired',
    'IntentSubmitted',
    'IntentExecuted',
    'IntentCancelled',
    'IntentExpired',
] as const;

function mapEventToOrder(eventType: string, fields: any, txDigest: string, timestampMs: string | null | undefined): OrderEvent {
    const ts = timestampMs ? Number(timestampMs) : Date.now();

    switch (eventType) {
        case 'OfferCreated':
            return {
                id: fields.offer_id,
                type: 'offer_created',
                pair: 'SUI/USDC',
                amountIn: formatAmount(fields.initial_offer_amount),
                amountOut: '-',
                price: formatPrice(fields.min_price),
                status: 'pending',
                timestamp: ts,
                txDigest,
            };
        case 'OfferFilled':
            return {
                id: fields.offer_id,
                type: 'offer_filled',
                pair: 'SUI/USDC',
                amountIn: formatAmount(fields.fill_amount),
                amountOut: formatAmount(fields.payment_amount),
                price: formatPrice(fields.price),
                status: 'filled',
                timestamp: ts,
                txDigest,
            };
        case 'OfferWithdrawn':
            return {
                id: fields.offer_id,
                type: 'offer_withdrawn',
                pair: 'SUI/USDC',
                amountIn: formatAmount(fields.withdrawn_amount),
                amountOut: '-',
                price: '-',
                status: 'withdrawn',
                timestamp: ts,
                txDigest,
            };
        case 'OfferExpired':
            return {
                id: fields.offer_id,
                type: 'offer_expired',
                pair: 'SUI/USDC',
                amountIn: formatAmount(fields.remaining),
                amountOut: '-',
                price: '-',
                status: 'expired',
                timestamp: ts,
                txDigest,
            };
        case 'IntentSubmitted':
            return {
                id: fields.intent_id,
                type: 'intent_submitted',
                pair: 'SUI/USDC',
                amountIn: formatAmount(fields.escrowed_amount),
                amountOut: formatAmount(fields.receive_amount),
                price: formatPrice(fields.max_price),
                status: 'pending',
                timestamp: ts,
                txDigest,
            };
        case 'IntentExecuted':
            return {
                id: fields.intent_id,
                type: 'intent_executed',
                pair: 'SUI/USDC',
                amountIn: formatAmount(fields.amount_paid),
                amountOut: formatAmount(fields.amount_received),
                price: formatPrice(fields.price),
                status: 'filled',
                timestamp: ts,
                txDigest,
            };
        case 'IntentCancelled':
            return {
                id: fields.intent_id,
                type: 'intent_cancelled',
                pair: 'SUI/USDC',
                amountIn: formatAmount(fields.refund_amount),
                amountOut: '-',
                price: '-',
                status: 'cancelled',
                timestamp: ts,
                txDigest,
            };
        case 'IntentExpired':
            return {
                id: fields.intent_id,
                type: 'intent_expired',
                pair: 'SUI/USDC',
                amountIn: formatAmount(fields.refund_amount),
                amountOut: '-',
                price: '-',
                status: 'expired',
                timestamp: ts,
                txDigest,
            };
        default:
            return {
                id: 'unknown',
                type: 'offer_created',
                pair: 'SUI/USDC',
                amountIn: '-',
                amountOut: '-',
                price: '-',
                status: 'pending',
                timestamp: ts,
                txDigest,
            };
    }
}

function formatAmount(raw: string | number): string {
    const val = Number(raw) / 1e9;
    if (val === 0) return '0';
    return val < 0.01 ? val.toFixed(6) : val.toFixed(2);
}

function formatPrice(raw: string | number): string {
    const val = Number(raw) / 1e9;
    return val.toFixed(4);
}

function isUserEvent(fields: any, address: string | undefined): boolean {
    if (!address) return true; // Show all if not connected
    const lower = address.toLowerCase();
    return (
        fields.maker?.toLowerCase() === lower ||
        fields.taker?.toLowerCase() === lower ||
        fields.creator?.toLowerCase() === lower ||
        fields.executor?.toLowerCase() === lower
    );
}

export function useOrderEvents(filter: 'all' | 'open' | 'history' = 'all') {
    const suiClient = useSuiClient();
    const account = useCurrentAccount();

    return useQuery<OrderEvent[]>({
        queryKey: ['order-events', filter, account?.address],
        queryFn: async () => {
            const results = await Promise.all(
                EVENT_TYPES.map((type) =>
                    suiClient.queryEvents({
                        query: { MoveEventType: `${PKG}::events::${type}` },
                        order: 'descending',
                        limit: 50,
                    }),
                ),
            );

            const events: OrderEvent[] = [];

            results.forEach((result, i) => {
                const eventType = EVENT_TYPES[i];
                for (const ev of result.data) {
                    const fields = ev.parsedJson as any;
                    if (!isUserEvent(fields, account?.address)) continue;
                    events.push(mapEventToOrder(eventType, fields, ev.id.txDigest, ev.timestampMs));
                }
            });

            // Sort by timestamp descending
            events.sort((a, b) => b.timestamp - a.timestamp);

            // Apply tab filter
            if (filter === 'open') {
                return events.filter(
                    (e) => e.status === 'pending',
                );
            }
            if (filter === 'history') {
                return events.filter(
                    (e) => e.status === 'filled' || e.status === 'cancelled' || e.status === 'expired' || e.status === 'withdrawn',
                );
            }
            return events;
        },
        refetchInterval: 10_000,
    });
}
