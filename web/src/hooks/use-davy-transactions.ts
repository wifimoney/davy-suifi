'use client';

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

    const fillOffer = useCallback(
        async (params: {
            offerId: string;
            offerAssetType: string;
            wantAssetType: string;
            paymentCoinId: string;
            fillAmount?: bigint; // If omitted, does full fill
        }) => {
            const tx = new Transaction();
            if (params.fillAmount) {
                tx.moveCall({
                    target: `${PKG}::offer::fill_partial_and_settle`,
                    typeArguments: [params.offerAssetType, params.wantAssetType],
                    arguments: [
                        tx.object(params.offerId),
                        tx.pure.u64(params.fillAmount),
                        tx.object(params.paymentCoinId),
                        tx.object(CLOCK),
                    ],
                });
            } else {
                tx.moveCall({
                    target: `${PKG}::offer::fill_full_and_settle`,
                    typeArguments: [params.offerAssetType, params.wantAssetType],
                    arguments: [
                        tx.object(params.offerId),
                        tx.object(params.paymentCoinId),
                        tx.object(CLOCK),
                    ],
                });
            }
            return signAndExecute({ transaction: tx });
        },
        [signAndExecute],
    );

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
                arguments: [tx.object(params.intentId)],
            });
            return signAndExecute({ transaction: tx });
        },
        [signAndExecute],
    );

    return { isConnected, address, createOffer, createIntent, fillOffer, cancelIntent };
}
