'use client';

import { useMemo, useCallback } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import {
    DavyRouter,
    OfferCache,
    OfferStatus,
    FillPolicy,
    CetusAdapter,
} from '@davy/router-reference';
import type { CachedOffer, CachedIntent, RoutingDecision } from '@davy/router-reference';
import { DAVY_CONFIG } from '@/config';

// Singleton cache — survives re-renders
let _cache: OfferCache | null = null;

function getCache(): OfferCache {
    if (!_cache) {
        _cache = new OfferCache();
    }
    return _cache;
}

export function useDavyRouter() {
    const suiClient = useSuiClient();
    const cache = useMemo(() => getCache(), []);

    const router = useMemo(() => {
        let cetus: CetusAdapter | undefined;
        try {
            cetus = new CetusAdapter(DAVY_CONFIG.network as 'testnet' | 'mainnet');
        } catch {
            // Cetus SDK not available — router works without it
        }
        return new DavyRouter(cache, cetus ? [cetus] : []);
    }, [cache]);

    const refreshOffers = useCallback(async () => {
        const packageId = DAVY_CONFIG.packageId;

        const [createdEvents, filledEvents] = await Promise.all([
            suiClient.queryEvents({
                query: { MoveEventType: `${packageId}::events::OfferCreated` },
                order: 'descending',
                limit: 100,
            }),
            suiClient.queryEvents({
                query: { MoveEventType: `${packageId}::events::OfferFilled` },
                order: 'descending',
                limit: 100,
            }),
        ]);

        // Build offer map from OfferCreated events
        const offerMap = new Map<string, CachedOffer>();

        for (const ev of createdEvents.data) {
            const fields = ev.parsedJson as any;
            const offer: CachedOffer = {
                offerId: fields.offer_id,
                maker: fields.maker,
                offerAssetType: fields.offer_asset?.name ?? 'SUI',
                wantAssetType: fields.want_asset?.name ?? 'USDC',
                initialAmount: BigInt(fields.initial_offer_amount),
                remainingAmount: BigInt(fields.initial_offer_amount),
                minPrice: BigInt(fields.min_price),
                maxPrice: BigInt(fields.max_price),
                fillPolicy: Number(fields.fill_policy) as FillPolicy,
                minFillAmount: BigInt(fields.min_fill_amount),
                expiryTimestampMs: Number(fields.expiry_timestamp_ms),
                status: OfferStatus.Created,
                totalFilled: 0n,
                fillCount: 0,
            };
            offerMap.set(offer.offerId, offer);
        }

        // Apply fills
        for (const ev of filledEvents.data) {
            const fields = ev.parsedJson as any;
            const offer = offerMap.get(fields.offer_id);
            if (!offer) continue;

            offer.totalFilled += BigInt(fields.fill_amount);
            offer.fillCount += 1;
            offer.remainingAmount = BigInt(fields.remaining);
            if (fields.is_full) {
                offer.status = OfferStatus.Filled;
            } else {
                offer.status = OfferStatus.PartiallyFilled;
            }
        }

        // Rebuild cache
        for (const offer of offerMap.values()) {
            cache.upsert(offer);
        }
    }, [suiClient, cache]);

    const routeIntent = useCallback(
        async (intent: CachedIntent): Promise<RoutingDecision> => {
            return router.routeIntent(intent, Date.now());
        },
        [router],
    );

    return { router, cache, refreshOffers, routeIntent };
}
