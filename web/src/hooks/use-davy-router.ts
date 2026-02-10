'use client';

import { useMemo, useEffect } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import {
    DavyRouter,
    OfferCache,
    CetusAdapter,
} from '@davy/router-reference';
import type { CachedIntent, RoutingDecision } from '@davy/router-reference';
import { DAVY_CONFIG } from '@/config';

/**
 * Hook to interface with the Davy Routing Engine.
 * 
 * It manages an event-driven OfferCache that stays in sync with the chain
 * and provides the Router with real-time liquidity data.
 */

// Singleton cache & router — survives re-renders to maintain event subscription
let _cache: OfferCache | null = null;
let _router: DavyRouter | null = null;

export function useDavyRouter() {
    const suiClient = useSuiClient();

    // Initialize singleton cache and router
    const { cache, router } = useMemo(() => {
        if (!_cache) {
            _cache = new OfferCache({
                client: suiClient as any,
                packageId: DAVY_CONFIG.packageId
            });

            // Register external venues
            const venues = [];
            try {
                venues.push(new CetusAdapter({
                    client: suiClient as any,
                    network: DAVY_CONFIG.network as 'testnet' | 'mainnet',
                    slippageBps: 50 // 0.5%
                }));
            } catch (e) {
                console.warn('Cetus adapter failed to initialize:', e);
            }

            _router = new DavyRouter(_cache, venues);
        }
        return { cache: _cache, router: _router! };
    }, [suiClient]);

    // Start event listening on mount
    useEffect(() => {
        cache.start().catch(err => {
            console.error('Failed to start OfferCache:', err);
        });

        // No need to stop on every unmount if we want to keep it warm,
        // but for a hook strictly speaking we should or have a ref-count.
        // For simplicity in this demo, we keep it active.
    }, [cache]);

    /**
     * Finds the best route for a given swap intent.
     * 
     * @param receiveAssetType - The coin the user wants
     * @param payAssetType - The coin the user is paying with
     * @param amount - Raw amount of receive asset
     */
    const getRoute = async (
        receiveAssetType: string,
        payAssetType: string,
        amount: bigint
    ): Promise<RoutingDecision | null> => {
        return router.route(receiveAssetType, payAssetType, amount);
    };

    /**
     * Find best route for a specific Intent object.
     */
    const routeIntent = async (intent: CachedIntent): Promise<RoutingDecision | null> => {
        return router.route(
            intent.receiveAssetType,
            intent.payAssetType,
            intent.receiveAmount
        );
    };

    return {
        router,
        cache,
        getRoute,
        routeIntent,
        // Helper to get raw offers for UI display
        getOffers: (offerAsset: string, wantAsset: string) =>
            cache.getActiveOffersSorted(offerAsset, wantAsset)
    };
}
