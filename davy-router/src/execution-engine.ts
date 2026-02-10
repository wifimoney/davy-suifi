/**
 * Davy Protocol — Phase 8: Execution Engine
 *
 * The main operational loop that ties together all router components:
 *
 *   Event Stream → OfferCache → Router → PTBBuilder → Sui TX
 *
 * Lifecycle:
 * 1. Start: Initialize cache, connect venues, begin polling
 * 2. Poll: Check for pending intents (from cache or direct RPC)
 * 3. Route: For each intent, find optimal execution path
 * 4. Build: Assemble PTB from routing decision
 * 5. Execute: Sign and submit the PTB
 * 6. Report: Log results, update metrics
 *
 * The engine operates as an "executor bot" — it holds an ExecutorCap
 * and earns execution fees by matching intents with offers/venues.
 */

import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { OfferCache } from './offer-cache.js';
import { DavyRouter, RouterConfig } from './router.js';
import { PTBBuilder } from './ptb-builder.js';
import { DeepBookV3Adapter } from './deepbook.js';
import { CetusAdapter } from './cetus.js';
import { SealAdapter, DecryptedIntentParams } from './seal-adapter.js';
import {
    ExecutionEngineConfig,
    ExecutionResult,
    CachedIntent,
    ExternalPriceSource,
} from './types.js';

// ============================================================
// Engine
// ============================================================

export class ExecutionEngine {
    private client: SuiClient;
    private config: ExecutionEngineConfig;
    private cache: OfferCache;
    private router: DavyRouter;
    private ptbBuilder: PTBBuilder;
    private keypair: Ed25519Keypair | null = null;
    private deepbook: DeepBookV3Adapter | null = null;
    private cetus: CetusAdapter | null = null;
    private seal: SealAdapter | null = null;

    private isRunning = false;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private executionLog: ExecutionResult[] = [];
    private metrics = {
        intentsProcessed: 0,
        intentsExecuted: 0,
        intentsFailed: 0,
        intentsSkipped: 0,
        totalGasUsed: 0n,
        startedAt: 0,
    };

    // Track intents currently being processed to avoid double-execution
    private processingIntents: Set<string> = new Set();
    // Track recently executed intents to avoid re-processing
    private recentlyExecuted: Map<string, number> = new Map();
    private readonly RECENT_EXECUTION_TTL_MS = 60_000; // 1 min

    constructor(config: ExecutionEngineConfig) {
        this.config = config;
        this.client = new SuiClient({ url: config.rpcUrl });

        // Initialize cache
        this.cache = new OfferCache({
            client: this.client,
            packageId: config.davyPackageId,
        });

        // Initialize venue adapters
        const venues: ExternalPriceSource[] = [];

        this.deepbook = new DeepBookV3Adapter({ client: this.client, env: config.env, senderAddress: '' }); // Sender address will be set on start or direct usage
        venues.push(this.deepbook);

        this.cetus = new CetusAdapter({
            client: this.client,
            network: config.env,
        });
        venues.push(this.cetus);

        // Initialize router
        this.router = new DavyRouter(this.cache, venues);

        // Initialize PTB builder
        this.ptbBuilder = new PTBBuilder({
            client: this.client,
            config,
            deepbook: this.deepbook,
            cetus: this.cetus,
        });

        // Initialize Seal adapter (if configured)
        if (config.sealPolicyPackageId) {
            this.seal = new SealAdapter({
                client: this.client,
                sealPolicyPackageId: config.sealPolicyPackageId,
                executorCapId: config.executorCapId,
                env: config.env,
            });
        }
    }

    // --------------------------------------------------------
    // Lifecycle
    // --------------------------------------------------------

    /**
     * Start the execution engine.
     *
     * @param keypair - Ed25519 keypair for signing transactions.
     *                  Must own the ExecutorCap and have SUI for gas.
     */
    async start(keypair: Ed25519Keypair): Promise<void> {
        if (this.isRunning) {
            console.warn('[Engine] Already running');
            return;
        }

        this.keypair = keypair;
        // Update sender address in DeepBook adapter
        if (this.deepbook) {
            // Re-initialize DeepBook adapter with correct sender address
            this.deepbook = new DeepBookV3Adapter({
                client: this.client,
                env: this.config.env,
                senderAddress: keypair.toSuiAddress()
            });
            // Update instances
            this.router = new DavyRouter(this.cache, [this.deepbook, this.cetus!]);
            this.ptbBuilder = new PTBBuilder({
                client: this.client,
                config: this.config,
                deepbook: this.deepbook,
                cetus: this.cetus!,
            });
        }

        this.isRunning = true;
        this.metrics.startedAt = Date.now();

        console.log('[Engine] Starting...');
        console.log(`[Engine] Package:     ${this.config.davyPackageId}`);
        console.log(`[Engine] ExecutorCap: ${this.config.executorCapId}`);
        console.log(`[Engine] Network:     ${this.config.env}`);
        console.log(`[Engine] RPC:         ${this.config.rpcUrl}`);

        // Start the offer cache
        await this.cache.start();
        console.log('[Engine] Offer cache started');

        // Initialize Seal session (if configured)
        if (this.seal) {
            await this.seal.initialize(keypair);
            console.log('[Engine] Seal adapter initialized');
        }

        // Wait briefly for cache to populate
        await this.delay(3000);
        console.log(`[Engine] Cache populated: ${this.cache.activeOfferCount} offers, ${this.cache.pendingIntentCount} intents`);

        // Start the polling loop
        this.poll();
        console.log(`[Engine] Polling every ${this.config.pollIntervalMs ?? 5000}ms`);
    }

    /** Stop the execution engine gracefully. */
    async stop(): Promise<void> {
        console.log('[Engine] Stopping...');
        this.isRunning = false;

        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }

        await this.cache.stop();
        console.log('[Engine] Stopped');
        this.printMetrics();
    }

    // --------------------------------------------------------
    // Main Loop
    // --------------------------------------------------------

    private poll(): void {
        if (!this.isRunning) return;

        this.tick()
            .catch((err) => {
                console.error('[Engine] Tick error:', err);
            })
            .finally(() => {
                if (this.isRunning) {
                    this.pollTimer = setTimeout(
                        () => this.poll(),
                        this.config.pollIntervalMs ?? 5000,
                    );
                }
            });
    }

    private async tick(): Promise<void> {
        // Clean up old "recently executed" entries
        this.cleanRecentlyExecuted();

        // Get pending intents
        const pendingIntents = this.cache.getPendingIntents();
        if (pendingIntents.length === 0) return;

        console.log(`[Engine] Found ${pendingIntents.length} pending intent(s)`);

        // Process each intent
        for (const intent of pendingIntents) {
            // Skip if already processing or recently executed
            if (this.processingIntents.has(intent.objectId)) continue;
            if (this.recentlyExecuted.has(intent.objectId)) continue;

            // Skip expired intents
            if (BigInt(Date.now()) >= intent.expiryMs) {
                this.metrics.intentsSkipped++;
                continue;
            }

            try {
                this.processingIntents.add(intent.objectId);
                await this.processIntent(intent);
            } catch (err) {
                console.error(`[Engine] Error processing intent ${intent.objectId}:`, err);
                this.metrics.intentsFailed++;
            } finally {
                this.processingIntents.delete(intent.objectId);
            }
        }
    }

    // --------------------------------------------------------
    // Intent Processing
    // --------------------------------------------------------

    private async processIntent(intent: CachedIntent): Promise<void> {
        this.metrics.intentsProcessed++;

        // ── Encrypted intent detection ──
        // Sentinel: receive_amount === 0 signals encrypted params
        if (this.seal && this.seal.isEncryptedIntent(intent)) {
            console.log(`[Engine] Encrypted intent ${intent.objectId.slice(0, 10)}... — decrypting via Seal`);

            // Refresh session if expired
            if (!this.seal.isSessionValid() && this.keypair) {
                await this.seal.refreshSession(this.keypair);
            }

            const decrypted = await this.seal.decryptIntent(intent.objectId);
            if (!decrypted) {
                console.log(`  → Seal decryption failed, skipping`);
                this.metrics.intentsSkipped++;
                return;
            }

            // Process with decrypted params
            return this.processEncryptedIntent(intent, decrypted);
        }

        // ── Standard (plaintext) intent processing ──
        console.log(`[Engine] Processing intent ${intent.objectId.slice(0, 10)}...`);
        console.log(`  receive: ${intent.receiveAmount} of ${intent.receiveAssetType}`);
        console.log(`  max pay: ${intent.maxPayAmount} of ${intent.payAssetType}`);
        console.log(`  price:   [${intent.minPrice}, ${intent.maxPrice}]`);

        // 1. Route: Find optimal execution path
        const routing = await this.router.route(
            intent.receiveAssetType,
            intent.payAssetType,
            intent.receiveAmount,
        );

        if (!routing) {
            console.log(`  → No route found (insufficient liquidity)`);
            this.metrics.intentsSkipped++;
            return;
        }

        console.log(`  → Route found: ${routing.legs.length} leg(s), ` +
            `blended price ${routing.blendedPrice}, ` +
            `total pay ${routing.totalPayAmount}`);

        // 2. Validate: Check that route satisfies intent constraints
        if (routing.blendedPrice < intent.minPrice || routing.blendedPrice > intent.maxPrice) {
            console.log(`  → Route price ${routing.blendedPrice} outside intent bounds [${intent.minPrice}, ${intent.maxPrice}]`);
            this.metrics.intentsSkipped++;
            return;
        }

        if (routing.totalPayAmount > intent.maxPayAmount) {
            console.log(`  → Route cost ${routing.totalPayAmount} exceeds intent max ${intent.maxPayAmount}`);
            this.metrics.intentsSkipped++;
            return;
        }

        // 3. Execution
        const result = await this.executeRouting(intent, routing);

        if (result.success) {
            console.log(`  ✓ Executed: ${result.txDigest}`);
            this.metrics.intentsExecuted++;
            this.recentlyExecuted.set(intent.objectId, Date.now());
        } else {
            console.log(`  ✗ Failed: ${result.error}`);
            this.metrics.intentsFailed++;
        }

        this.executionLog.push(result);
    }

    /**
     * Process an encrypted intent after Seal decryption.
     *
     * Builds a PTB that calls execute_encrypted_against_offer
     * with the decrypted params passed as function arguments.
     */
    private async processEncryptedIntent(
        intent: CachedIntent,
        decrypted: DecryptedIntentParams,
    ): Promise<void> {
        console.log(`[Engine] Routing encrypted intent with decrypted params:`);
        console.log(`  receive: ${decrypted.receiveAmount} of ${intent.receiveAssetType}`);
        console.log(`  price:   [${decrypted.minPrice}, ${decrypted.maxPrice}]`);

        // Route using decrypted amounts
        const routing = await this.router.route(
            intent.receiveAssetType,
            intent.payAssetType,
            decrypted.receiveAmount,
        );

        if (!routing) {
            console.log(`  → No route found`);
            this.metrics.intentsSkipped++;
            return;
        }

        // Validate against decrypted bounds
        if (routing.blendedPrice < decrypted.minPrice || routing.blendedPrice > decrypted.maxPrice) {
            console.log(`  → Price ${routing.blendedPrice} outside decrypted bounds`);
            this.metrics.intentsSkipped++;
            return;
        }

        // For Davy-only single-leg routes: build encrypted execution PTB
        if (routing.legs.length === 1 && routing.legs[0].venue === 'davy' && this.keypair) {
            try {
                const result = await this.executeEncryptedDavyFill(intent, decrypted, routing);

                if (result.success) {
                    console.log(`  ✓ Encrypted execute: ${result.txDigest}`);
                    this.metrics.intentsExecuted++;
                    this.recentlyExecuted.set(intent.objectId, Date.now());
                } else {
                    console.log(`  ✗ Failed: ${result.error}`);
                    this.metrics.intentsFailed++;
                }

                this.executionLog.push(result);
            } catch (err) {
                console.error(`  ✗ Error:`, err);
                this.metrics.intentsFailed++;
            }
        } else {
            console.log(`  → Multi-leg encrypted execution not yet supported`);
            this.metrics.intentsSkipped++;
        }
    }

    /**
     * Build and execute a PTB for an encrypted intent against a Davy offer.
     *
     * Calls davy::intent::execute_encrypted_against_offer with the
     * decrypted params as move call arguments.
     */
    private async executeEncryptedDavyFill(
        intent: CachedIntent,
        decrypted: DecryptedIntentParams,
        routing: import('./types.js').RoutingDecision,
    ): Promise<ExecutionResult> {
        if (!this.keypair) {
            return {
                success: false,
                intentId: intent.objectId,
                routing,
                error: 'No keypair',
                timestamp: Date.now(),
            };
        }

        const leg = routing.legs[0];
        const offerId = leg.quote.venue === 'davy' ? (leg.quote as any).offerObjectId : null;
        if (!offerId) {
            return {
                success: false,
                intentId: intent.objectId,
                routing,
                error: 'No offer ID in routing leg',
                timestamp: Date.now(),
            };
        }

        const tx = new Transaction();

        // Type arguments: <ReceiveAsset, PayAsset>
        const typeArgs = [intent.receiveAssetType, intent.payAssetType];

        tx.moveCall({
            target: `${this.config.davyPackageId}::intent::execute_encrypted_against_offer`,
            typeArguments: typeArgs,
            arguments: [
                tx.object(intent.objectId),                          // intent
                tx.object(offerId),                                  // offer
                tx.object(this.config.executorCapId),                // exec_cap
                tx.object(this.config.revocationRegistryId!),        // registry
                tx.pure.u64(decrypted.receiveAmount.toString()),     // receive_amount
                tx.pure.u64(decrypted.minPrice.toString()),          // min_price
                tx.pure.u64(decrypted.maxPrice.toString()),          // max_price
                tx.pure.u64(leg.effectivePrice.toString()),          // execution_price
                tx.object('0x6'),                                    // Clock
            ],
        });

        try {
            const response = await this.client.signAndExecuteTransaction({
                signer: this.keypair,
                transaction: tx,
                options: { showEffects: true, showEvents: true },
            });

            const gasUsed = this.extractGasUsed(response);
            this.metrics.totalGasUsed += gasUsed;

            return {
                success: response.effects?.status?.status === 'success',
                txDigest: response.digest,
                intentId: intent.objectId,
                routing,
                gasUsed,
                error: response.effects?.status?.status !== 'success'
                    ? response.effects?.status?.error
                    : undefined,
                timestamp: Date.now(),
            };
        } catch (err) {
            return {
                success: false,
                intentId: intent.objectId,
                routing,
                error: err instanceof Error ? err.message : String(err),
                timestamp: Date.now(),
            };
        }
    }

    // --------------------------------------------------------
    // Execution
    // --------------------------------------------------------

    private async executeRouting(
        intent: CachedIntent,
        routing: import('./types.js').RoutingDecision,
    ): Promise<ExecutionResult> {
        if (!this.keypair) {
            return {
                success: false,
                intentId: intent.objectId,
                routing,
                error: 'No keypair configured',
                timestamp: Date.now(),
            };
        }

        try {
            // For single Davy leg, use intent execution path
            if (routing.legs.length === 1 && routing.legs[0].venue === 'davy') {
                const tx = await this.ptbBuilder.buildFromDecision(
                    routing,
                    '', // no payment coin needed for intent execution
                    intent.creator,
                    intent.objectId,
                );

                const response = await this.client.signAndExecuteTransaction({
                    signer: this.keypair,
                    transaction: tx,
                    options: {
                        showEffects: true,
                        showEvents: true,
                    },
                });

                const gasUsed = this.extractGasUsed(response);
                this.metrics.totalGasUsed += gasUsed;

                return {
                    success: response.effects?.status?.status === 'success',
                    txDigest: response.digest,
                    intentId: intent.objectId,
                    routing,
                    gasUsed,
                    error: response.effects?.status?.status !== 'success'
                        ? response.effects?.status?.error
                        : undefined,
                    timestamp: Date.now(),
                };
            }

            // For multi-leg or external routes, we need more complex handling
            // The executor would need to source payment coins and handle the split
            // For now, log and skip these (future enhancement)
            console.log(`  → Multi-leg/external routes require payment sourcing (not yet implemented)`);
            return {
                success: false,
                intentId: intent.objectId,
                routing,
                error: 'Multi-leg execution not yet implemented',
                timestamp: Date.now(),
            };

        } catch (err) {
            return {
                success: false,
                intentId: intent.objectId,
                routing,
                error: err instanceof Error ? err.message : String(err),
                timestamp: Date.now(),
            };
        }
    }

    // --------------------------------------------------------
    // Profitability
    // --------------------------------------------------------

    /**
     * Estimate executor profit for filling an intent.
     *
     * The executor earns the spread between the intent's max price
     * and the actual execution price. Gas costs are subtracted.
     *
     * Example:
     *   Intent max price: 2.10 (willing to pay 210 USDC for 100 SUI)
     *   Route price:      2.01 (can get 100 SUI for 201 USDC)
     *   Spread:           9 USDC
     *   Gas:              ~0.01 SUI ≈ 0.02 USDC
     *   Profit:           ~8.98 USDC
     */
    private estimateProfit(
        intent: CachedIntent,
        routing: import('./types.js').RoutingDecision,
    ): bigint {
        // Spread between what intent allows and what routing costs
        const maxPayAllowed = intent.maxPayAmount;
        const actualPayRequired = routing.totalPayAmount;

        if (actualPayRequired >= maxPayAllowed) return 0n;

        const rawSpread = maxPayAllowed - actualPayRequired;

        // Rough gas estimate: 0.01 SUI = 10_000_000 MIST
        const estimatedGasCost = 10_000_000n;

        return rawSpread > estimatedGasCost ? rawSpread - estimatedGasCost : 0n;
    }

    // --------------------------------------------------------
    // Direct Execution (for external callers)
    // --------------------------------------------------------

    /**
     * Execute a direct fill against a Davy offer (no intent needed).
     * Used by the frontend for immediate taker fills.
     */
    async directFill(params: {
        receiveAssetType: string;
        payAssetType: string;
        receiveAmount: bigint;
        paymentCoinId: string;
        recipient: string;
        keypair: Ed25519Keypair;
    }): Promise<ExecutionResult> {
        const routing = await this.router.route(
            params.receiveAssetType,
            params.payAssetType,
            params.receiveAmount,
        );

        if (!routing) {
            return {
                success: false,
                intentId: 'direct-fill',
                routing: routing!,
                error: 'No route found',
                timestamp: Date.now(),
            };
        }

        try {
            const tx = await this.ptbBuilder.buildFromDecision(
                routing,
                params.paymentCoinId,
                params.recipient,
            );

            const response = await this.client.signAndExecuteTransaction({
                signer: params.keypair,
                transaction: tx,
                options: { showEffects: true },
            });

            return {
                success: response.effects?.status?.status === 'success',
                txDigest: response.digest,
                intentId: 'direct-fill',
                routing,
                gasUsed: this.extractGasUsed(response),
                timestamp: Date.now(),
            };
        } catch (err) {
            return {
                success: false,
                intentId: 'direct-fill',
                routing,
                error: err instanceof Error ? err.message : String(err),
                timestamp: Date.now(),
            };
        }
    }

    /**
     * Get a routing quote without executing.
     * Used by the frontend to display best prices.
     */
    async quote(
        receiveAssetType: string,
        payAssetType: string,
        receiveAmount: bigint,
    ): Promise<import('./types.js').RoutingDecision | null> {
        return this.router.route(receiveAssetType, payAssetType, receiveAmount);
    }

    // --------------------------------------------------------
    // Accessors
    // --------------------------------------------------------

    /** Get the underlying offer cache */
    getCache(): OfferCache {
        return this.cache;
    }

    /** Get the underlying router */
    getRouter(): DavyRouter {
        return this.router;
    }

    /** Get execution history */
    getExecutionLog(): ExecutionResult[] {
        return [...this.executionLog];
    }

    /** Get current metrics */
    getMetrics(): typeof this.metrics {
        return { ...this.metrics };
    }

    // --------------------------------------------------------
    // Utilities
    // --------------------------------------------------------

    private extractGasUsed(response: SuiTransactionBlockResponse): bigint {
        const effects = response.effects;
        if (!effects?.gasUsed) return 0n;
        const { computationCost, storageCost, storageRebate } = effects.gasUsed;
        return (
            BigInt(computationCost ?? '0') +
            BigInt(storageCost ?? '0') -
            BigInt(storageRebate ?? '0')
        );
    }

    private cleanRecentlyExecuted(): void {
        const now = Date.now();
        for (const [id, timestamp] of this.recentlyExecuted) {
            if (now - timestamp > this.RECENT_EXECUTION_TTL_MS) {
                this.recentlyExecuted.delete(id);
            }
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private printMetrics(): void {
        const elapsed = (Date.now() - this.metrics.startedAt) / 1000;
        console.log('\n=== Execution Engine Metrics ===');
        console.log(`Uptime:          ${elapsed.toFixed(0)}s`);
        console.log(`Processed:       ${this.metrics.intentsProcessed}`);
        console.log(`Executed:        ${this.metrics.intentsExecuted}`);
        console.log(`Failed:          ${this.metrics.intentsFailed}`);
        console.log(`Skipped:         ${this.metrics.intentsSkipped}`);
        console.log(`Total gas:       ${this.metrics.totalGasUsed} MIST`);
        console.log('================================\n');
    }
}
