/**
 * Davy Protocol — Phase 8: PTB Builder
 *
 * Takes a RoutingDecision (potentially split across multiple venues)
 * and assembles a single atomic Sui Programmable Transaction Block (PTB).
 *
 * This is "the big win" — a single transaction that:
 * 1. Splits the payment coin as needed
 * 2. Fills Davy offers (fill_full / fill_partial)
 * 3. Executes external venue swaps (DeepBook / Cetus)
 * 4. Merges all received assets
 * 5. Transfers everything to the recipient
 *
 * The PTB is atomic: if any leg fails, the entire transaction reverts.
 *
 * Example split route:
 *   Intent: Buy 100 SUI
 *   Leg 1: Davy offer A — 60 SUI @ 1.95 = 117 USDC
 *   Leg 2: DeepBook    — 40 SUI @ 2.01 = 80.4 USDC
 *   Total: 197.4 USDC (vs 201 all-DeepBook)
 *   → Single PTB, atomic settlement
 */

import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import {
    RoutingDecision,
    RoutingLeg,
    DavyQuote,
    VenueQuote,
    ExecutionEngineConfig,
    DAVY_MODULES,
    DAVY_FUNCTIONS,
} from './types.js';
import { DeepBookV3Adapter, DeepBookPoolConfig } from './deepbook.js';
import { CetusAdapter } from './cetus.js';

// ============================================================
// PTB Builder
// ============================================================

export class PTBBuilder {
    private client: SuiClient;
    private config: ExecutionEngineConfig;
    private deepbook: DeepBookV3Adapter | null;
    private cetus: CetusAdapter | null;

    constructor(params: {
        client: SuiClient;
        config: ExecutionEngineConfig;
        deepbook?: DeepBookV3Adapter;
        cetus?: CetusAdapter;
    }) {
        this.client = params.client;
        this.config = params.config;
        this.deepbook = params.deepbook ?? null;
        this.cetus = params.cetus ?? null;
    }

    // --------------------------------------------------------
    // Direct Fill PTB (Path A — no intent, permissionless)
    // --------------------------------------------------------

    /**
     * Build a PTB for a direct fill against a Davy offer.
     * This is the simplest case: one taker, one offer, immediate settlement.
     *
     * @param routing - Single-leg Davy routing decision
     * @param paymentCoinId - Object ID of the taker's payment coin
     * @param recipient - Address to receive the filled assets
     */
    buildDirectFillPTB(
        routing: RoutingDecision,
        paymentCoinId: string,
        recipient: string,
    ): Transaction {
        const tx = new Transaction();

        if (routing.legs.length !== 1 || routing.legs[0].venue !== 'davy') {
            throw new Error('Direct fill requires exactly one Davy leg');
        }

        const leg = routing.legs[0];
        const quote = leg.quote as DavyQuote;

        // Split exact payment from the coin
        const [paymentCoin] = tx.splitCoins(
            tx.object(paymentCoinId),
            [tx.pure.u64(leg.payAmount)],
        );

        if (quote.fillType === 'full') {
            tx.moveCall({
                target: `${this.config.davyPackageId}::${DAVY_MODULES.OFFER}::${DAVY_FUNCTIONS.FILL_FULL}`,
                arguments: [
                    tx.object(quote.offerObjectId),
                    paymentCoin,
                    tx.object('0x6'), // Clock
                ],
                typeArguments: [
                    routing.receiveAssetType,
                    routing.payAssetType,
                ],
            });
        } else {
            tx.moveCall({
                target: `${this.config.davyPackageId}::${DAVY_MODULES.OFFER}::${DAVY_FUNCTIONS.FILL_PARTIAL}`,
                arguments: [
                    tx.object(quote.offerObjectId),
                    paymentCoin,
                    tx.pure.u64(leg.fillAmount),
                    tx.object('0x6'), // Clock
                ],
                typeArguments: [
                    routing.receiveAssetType,
                    routing.payAssetType,
                ],
            });
        }

        tx.setGasBudget(this.config.maxGasBudget ?? 50_000_000);
        return tx;
    }

    // --------------------------------------------------------
    // Intent Execution PTB (Path B — requires ExecutorCap)
    // --------------------------------------------------------

    /**
     * Build a PTB to execute an intent against a single Davy offer.
     * Uses execute_against_offer_v2 which takes explicit price.
     */
    buildIntentExecutionPTB(
        intentObjectId: string,
        offerObjectId: string,
        executionPrice: bigint,
    ): Transaction {
        const tx = new Transaction();

        tx.moveCall({
            target: `${this.config.davyPackageId}::${DAVY_MODULES.INTENT}::${DAVY_FUNCTIONS.EXECUTE_V2}`,
            arguments: [
                tx.object(intentObjectId),
                tx.object(offerObjectId),
                tx.object(this.config.executorCapId),
                tx.pure.u64(executionPrice),
                tx.object('0x6'), // Clock
            ],
        });

        tx.setGasBudget(this.config.maxGasBudget ?? 50_000_000);
        return tx;
    }

    // --------------------------------------------------------
    // Split-Route PTB (The Big Win)
    // --------------------------------------------------------

    /**
     * Build a composite PTB that executes a split-route decision.
     *
     * Handles:
     * - Multiple Davy offer fills in sequence
     * - External venue swaps (DeepBook, Cetus)
     * - Coin splitting for payment distribution
     * - Coin merging for received assets
     * - Final transfer to recipient
     *
     * All legs execute atomically in a single transaction.
     */
    async buildSplitRoutePTB(
        routing: RoutingDecision,
        paymentCoinId: string,
        recipient: string,
    ): Promise<Transaction> {
        const tx = new Transaction();

        // Track received asset coins for final merge
        const receivedCoins: TransactionObjectArgument[] = [];

        // Track remaining payment coin (shrinks as we split)
        let paymentCoin: TransactionObjectArgument = tx.object(paymentCoinId);

        // Process each leg
        for (let i = 0; i < routing.legs.length; i++) {
            const leg = routing.legs[i];
            const isLastLeg = i === routing.legs.length - 1;

            // Split the payment for this leg (unless it's the last leg — use remainder)
            let legPayment: TransactionObjectArgument;
            if (isLastLeg) {
                legPayment = paymentCoin;
            } else {
                const [split] = tx.splitCoins(paymentCoin, [tx.pure.u64(leg.payAmount)]);
                legPayment = split;
            }

            if (leg.venue === 'davy') {
                const received = this.addDavyFillLeg(tx, leg, legPayment, routing);
                if (received) receivedCoins.push(received);
            } else if (leg.venue === 'deepbook') {
                const received = this.addDeepBookLeg(tx, leg, legPayment, routing);
                if (received) receivedCoins.push(received);
            } else if (leg.venue === 'cetus') {
                const received = await this.addCetusLeg(tx, leg, legPayment, routing);
                if (received) receivedCoins.push(received);
            }
        }

        // Merge all received coins into one
        if (receivedCoins.length > 1) {
            const primary = receivedCoins[0];
            tx.mergeCoins(primary, receivedCoins.slice(1));
            tx.transferObjects([primary], tx.pure.address(recipient));
        } else if (receivedCoins.length === 1) {
            tx.transferObjects([receivedCoins[0]], tx.pure.address(recipient));
        }

        tx.setGasBudget(this.config.maxGasBudget ?? 100_000_000);
        return tx;
    }

    // --------------------------------------------------------
    // Individual Leg Builders
    // --------------------------------------------------------

    /**
     * Add a Davy offer fill leg to the PTB.
     * Returns the received coin reference.
     */
    private addDavyFillLeg(
        tx: Transaction,
        leg: RoutingLeg,
        paymentCoin: TransactionObjectArgument,
        routing: RoutingDecision,
    ): TransactionObjectArgument | null {
        const quote = leg.quote as DavyQuote;

        if (quote.fillType === 'full') {
            // fill_full_and_settle returns (Coin<OfferAsset>, Coin<WantAsset>)
            const [receivedCoin] = tx.moveCall({
                target: `${this.config.davyPackageId}::${DAVY_MODULES.OFFER}::${DAVY_FUNCTIONS.FILL_FULL}`,
                arguments: [
                    tx.object(quote.offerObjectId),
                    paymentCoin,
                    tx.object('0x6'),
                ],
                typeArguments: [
                    routing.receiveAssetType,
                    routing.payAssetType,
                ],
            });
            return receivedCoin;
        } else {
            // fill_partial_and_settle
            const [receivedCoin] = tx.moveCall({
                target: `${this.config.davyPackageId}::${DAVY_MODULES.OFFER}::${DAVY_FUNCTIONS.FILL_PARTIAL}`,
                arguments: [
                    tx.object(quote.offerObjectId),
                    paymentCoin,
                    tx.pure.u64(leg.fillAmount),
                    tx.object('0x6'),
                ],
                typeArguments: [
                    routing.receiveAssetType,
                    routing.payAssetType,
                ],
            });
            return receivedCoin;
        }
    }

    /**
     * Add a DeepBook swap leg to the PTB.
     */
    private addDeepBookLeg(
        tx: Transaction,
        leg: RoutingLeg,
        paymentCoin: TransactionObjectArgument,
        routing: RoutingDecision,
    ): TransactionObjectArgument | null {
        if (!this.deepbook) {
            throw new Error('DeepBook adapter required for DeepBook legs');
        }

        const pool = this.deepbook.findPool(routing.receiveAssetType, routing.payAssetType);
        if (!pool) {
            throw new Error(`No DeepBook pool for ${routing.receiveAssetType}/${routing.payAssetType}`);
        }

        const buyingBase = pool.baseAsset === routing.receiveAssetType;
        const amountHuman = Number(leg.payAmount) / (10 ** (buyingBase ? pool.quoteDecimals : pool.baseDecimals));
        const minOutHuman = Number(leg.fillAmount) / (10 ** (buyingBase ? pool.baseDecimals : pool.quoteDecimals));
        const deepAmountHuman = 0.1; // Conservative DEEP fee estimate

        const fragment = this.deepbook.generateSwapPTB(tx, {
            pool,
            direction: buyingBase ? 'buy_base' : 'sell_base',
            amount: amountHuman,
            deepAmount: deepAmountHuman,
            minOut: minOutHuman * 0.995, // 0.5% slippage buffer
            coinInput: paymentCoin,
        });

        // Return the output coin (base if buying base, quote if selling base)
        return buyingBase ? fragment.outputs.baseOut : fragment.outputs.quoteOut;
    }

    /**
     * Add a Cetus swap leg to the PTB.
     */
    private async addCetusLeg(
        tx: Transaction,
        leg: RoutingLeg,
        paymentCoin: TransactionObjectArgument,
        routing: RoutingDecision,
    ): Promise<TransactionObjectArgument | null> {
        if (!this.cetus) {
            throw new Error('Cetus adapter required for Cetus legs');
        }

        const minReceive = leg.fillAmount * 995n / 1000n; // 0.5% slippage

        const fragment = await this.cetus.generateSwapPTB(tx, {
            receiveAssetType: routing.receiveAssetType,
            payAssetType: routing.payAssetType,
            payAmount: leg.payAmount,
            minReceiveAmount: minReceive,
            coinInput: paymentCoin,
        });

        return fragment?.outputs?.outputCoin ?? null;
    }

    // --------------------------------------------------------
    // Convenience Builders
    // --------------------------------------------------------

    /**
     * Build the simplest possible PTB for a routing decision.
     * Automatically picks direct fill, intent execution, or split route.
     */
    async buildFromDecision(
        routing: RoutingDecision,
        paymentCoinId: string,
        recipient: string,
        intentObjectId?: string,
    ): Promise<Transaction> {
        // Single Davy leg + intent → intent execution
        if (
            intentObjectId &&
            routing.legs.length === 1 &&
            routing.legs[0].venue === 'davy'
        ) {
            const quote = routing.legs[0].quote as DavyQuote;
            return this.buildIntentExecutionPTB(
                intentObjectId,
                quote.offerObjectId,
                routing.blendedPrice,
            );
        }

        // Single Davy leg, no intent → direct fill
        if (routing.legs.length === 1 && routing.legs[0].venue === 'davy') {
            return this.buildDirectFillPTB(routing, paymentCoinId, recipient);
        }

        // Anything else → split route PTB
        return this.buildSplitRoutePTB(routing, paymentCoinId, recipient);
    }
}
