'use client';

/**
 * Extended Davy transaction hooks — adds withdrawOffer and expireOffer
 * to the existing use-davy-transactions.ts base.
 *
 * USAGE: Import from this file instead of the base hook when you need
 * offer lifecycle management (offers page, portfolio).
 *
 * Re-exports all base methods + adds:
 *   - withdrawOffer({ offerId, offerAssetType, wantAssetType })
 *   - expireOffer({ offerId, offerAssetType, wantAssetType })
 *   - cancelIntent({ intentId, receiveAssetType, payAssetType })
 */

import { useCallback } from 'react';
import {
    useSignAndExecuteTransaction,
    useCurrentAccount,
    useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { DAVY_CONFIG } from '@/config';

const PKG = DAVY_CONFIG.packageId;
const CLOCK = DAVY_CONFIG.clockId;

export function useDavyTransactions() {
    const account = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

    const isConnected = !!account;
    const address = account?.address;

    // --- Offer Creation ---

    const createOffer = useCallback(
        async (params: {
            offerCoinId: string;
            offerAssetType: string;
            wantAssetType: string;
            minPrice: bigint;
            maxPrice: bigint;
            expiryMs: number;
            fillPolicy: number;
            minFillAmount: bigint;
        }) => {
            const tx = new Transaction();
            tx.moveCall({
                target: `${PKG}::offer::create`,
                typeArguments: [params.offerAssetType, params.wantAssetType],
                arguments: [
                    tx.object(params.offerCoinId),
                    tx.pure.u64(params.minPrice),
                    tx.pure.u64(params.maxPrice),
                    tx.pure.u64(params.expiryMs),
                    tx.pure.u8(params.fillPolicy),
                    tx.pure.u64(params.minFillAmount),
                    tx.object(CLOCK),
                ],
            });
            return signAndExecute({ transaction: tx });
        },
        [signAndExecute],
    );

    // --- Direct Fill ---

    const fillOffer = useCallback(
        async (params: {
            offerId: string;
            offerAssetType: string;
            wantAssetType: string;
            paymentCoinId: string;
            fillAmount?: bigint;
        }) => {
            const tx = new Transaction();
            const target = params.fillAmount
                ? `${PKG}::offer::fill_partial_and_settle`
                : `${PKG}::offer::fill_full_and_settle`;

            const args = params.fillAmount
                ? [
                    tx.object(params.offerId),
                    tx.object(params.paymentCoinId),
                    tx.pure.u64(params.fillAmount),
                    tx.object(CLOCK),
                ]
                : [
                    tx.object(params.offerId),
                    tx.object(params.paymentCoinId),
                    tx.object(CLOCK),
                ];

            tx.moveCall({
                target,
                typeArguments: [params.offerAssetType, params.wantAssetType],
                arguments: args,
            });
            return signAndExecute({ transaction: tx });
        },
        [signAndExecute],
    );

    // --- Offer Withdrawal (Maker only) ---

    const withdrawOffer = useCallback(
        async (params: {
            offerId: string;
            offerAssetType: string;
            wantAssetType: string;
        }) => {
            const tx = new Transaction();
            tx.moveCall({
                target: `${PKG}::offer::withdraw`,
                typeArguments: [params.offerAssetType, params.wantAssetType],
                arguments: [
                    tx.object(params.offerId),
                    tx.object(CLOCK),
                ],
            });
            return signAndExecute({ transaction: tx });
        },
        [signAndExecute],
    );

    // --- Offer Expiry (Permissionless) ---

    const expireOffer = useCallback(
        async (params: {
            offerId: string;
            offerAssetType: string;
            wantAssetType: string;
        }) => {
            const tx = new Transaction();
            tx.moveCall({
                target: `${PKG}::offer::expire`,
                typeArguments: [params.offerAssetType, params.wantAssetType],
                arguments: [
                    tx.object(params.offerId),
                    tx.object(CLOCK),
                ],
            });
            return signAndExecute({ transaction: tx });
        },
        [signAndExecute],
    );

    // --- Intent Creation ---

    const createIntent = useCallback(
        async (params: {
            receiveAssetType: string;
            payAssetType: string;
            receiveAmount: bigint;
            paymentCoinId: string;
            minPrice: bigint;
            maxPrice: bigint;
            expiryMs: number;
        }) => {
            const tx = new Transaction();
            tx.moveCall({
                target: `${PKG}::intent::create_price_bounded`,
                typeArguments: [params.receiveAssetType, params.payAssetType],
                arguments: [
                    tx.pure.u64(params.receiveAmount),
                    tx.object(params.paymentCoinId),
                    tx.pure.u64(params.minPrice),
                    tx.pure.u64(params.maxPrice),
                    tx.pure.u64(params.expiryMs),
                    tx.object(CLOCK),
                ],
            });
            return signAndExecute({ transaction: tx });
        },
        [signAndExecute],
    );

    // --- Intent Cancellation ---

    const cancelIntent = useCallback(
        async (params: {
            intentId: string;
            receiveAssetType: string;
            payAssetType: string;
        }) => {
            const tx = new Transaction();
            tx.moveCall({
                target: `${PKG}::intent::cancel`,
                typeArguments: [params.receiveAssetType, params.payAssetType],
                arguments: [
                    tx.object(params.intentId),
                ],
            });
            return signAndExecute({ transaction: tx });
        },
        [signAndExecute],
    );

    return {
        isConnected,
        address,
        createOffer,
        fillOffer,
        withdrawOffer,
        expireOffer,
        createIntent,
        cancelIntent,
    };
}
