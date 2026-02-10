/**
 * Davy Protocol — Phase 10: Seal Adapter
 *
 * Integrates Mysten's Seal protocol for encrypted intent decryption.
 * The executor bot uses this to:
 *   1. Detect encrypted intents (receive_amount === 0n sentinel)
 *   2. Request decryption keys from Seal key servers
 *   3. Decrypt {receive_amount, min_price, max_price}
 *   4. Build PTBs that call execute_encrypted_against_offer
 *
 * Seal flow:
 *   Key servers dry-run a PTB containing seal_policy::seal_approve()
 *   with the executor's ExecutorCap. If no abort → key released.
 *   Client decrypts locally using the released key shares.
 *
 * Dependencies: @mysten/seal (npm install @mysten/seal)
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SealClient, SessionKey, KeyServerConfig } from '@mysten/seal';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { CachedIntent } from './types.js';

// ============================================================
// Types
// ============================================================

/** Decrypted intent parameters — the sensitive fields hidden by Seal. */
export interface DecryptedIntentParams {
    receiveAmount: bigint;
    minPrice: bigint;
    maxPrice: bigint;
}

/** Configuration for the Seal adapter. */
export interface SealAdapterConfig {
    /** Sui RPC client */
    client: SuiClient;

    /** Package ID of the deployed davy_seal_policy package */
    sealPolicyPackageId: string;

    /** Object ID of the executor's ExecutorCap */
    executorCapId: string;

    /** Network: 'testnet' | 'mainnet' */
    env: 'testnet' | 'mainnet';

    /** Session key TTL in minutes (default: 30) */
    sessionTtlMinutes?: number;
}

// ============================================================
// Adapter
// ============================================================

export class SealAdapter {
    private client: SuiClient;
    private sealClient: SealClient | null = null;
    private sessionKey: SessionKey | null = null;
    private config: SealAdapterConfig;

    constructor(config: SealAdapterConfig) {
        this.config = config;
        this.client = config.client;
    }

    // --------------------------------------------------------
    // Initialization
    // --------------------------------------------------------

    /**
     * Initialize the Seal client and create a session key.
     *
     * Session keys are time-limited keypairs that can request
     * decryption keys from Seal key servers without exposing
     * the executor's main private key for each request.
     */
    async initialize(keypair: Ed25519Keypair): Promise<void> {
        // Mock getAllowlistedKeyServers as it's missing from current SDK types
        const keyServers: KeyServerConfig[] = this.config.env === 'testnet' ? [
            { objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', weight: 1 },
            { objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8', weight: 1 },
        ] : [];

        this.sealClient = new SealClient({
            suiClient: this.client as any,
            serverConfigs: keyServers,
            verifyKeyServers: true,
        });

        // Create a session key (valid for N minutes)
        // Note: SDK v1.0.0 uses SessionKey.create()
        this.sessionKey = await SessionKey.create({
            address: keypair.toSuiAddress(),
            packageId: this.config.sealPolicyPackageId,
            ttlMin: this.config.sessionTtlMinutes ?? 30,
            suiClient: this.client as any,
        });

        // Sign the session key with the executor's keypair
        const sessionMessage = this.sessionKey.getPersonalMessage();
        const { signature } = await keypair.signPersonalMessage(sessionMessage);
        await this.sessionKey.setPersonalMessageSignature(signature);

        console.log('[Seal] Initialized');
        console.log(`[Seal] Policy package: ${this.config.sealPolicyPackageId}`);
        console.log(`[Seal] Session TTL: ${this.config.sessionTtlMinutes ?? 30} min`);
        console.log(`[Seal] Key servers: ${keyServers.length}`);
    }

    // --------------------------------------------------------
    // Detection
    // --------------------------------------------------------

    /**
     * Check if a cached intent is encrypted.
     * Sentinel: receive_amount === 0 AND min_price === 0 AND max_price === 0.
     */
    isEncryptedIntent(intent: CachedIntent): boolean {
        return (
            intent.receiveAmount === 0n &&
            intent.minPrice === 0n &&
            intent.maxPrice === 0n
        );
    }

    // --------------------------------------------------------
    // Decryption
    // --------------------------------------------------------

    /**
     * Decrypt an encrypted intent's parameters.
     *
     * Flow:
     *   1. Fetch the encrypted_params blob from the intent's dynamic field
     *   2. Build the Seal identity = bcs(intent_object_id)
     *   3. Build a PTB with seal_approve(id, &ExecutorCap) for dry-run
     *   4. SealClient sends dry-run to key servers → gets key shares
     *   5. Decrypt locally → parse JSON → return typed params
     *
     * @param intentObjectId - The on-chain object ID of the encrypted intent
     * @returns Decrypted parameters, or null if decryption fails
     */
    async decryptIntent(intentObjectId: string): Promise<DecryptedIntentParams | null> {
        if (!this.sealClient || !this.sessionKey) {
            throw new Error('[Seal] Not initialized — call initialize() first');
        }

        try {
            // 1. Fetch the encrypted blob from the intent's dynamic field
            const encryptedBlob = await this.fetchEncryptedParams(intentObjectId);
            if (!encryptedBlob) {
                console.warn(`[Seal] No encrypted params found for intent ${intentObjectId}`);
                return null;
            }

            // 2. Build the seal_approve transaction for key server dry-run
            //    The key server will execute this to verify the caller has ExecutorCap
            const txb = new Transaction();
            const idBytes = this.intentIdToSealIdentity(intentObjectId);

            txb.moveCall({
                target: `${this.config.sealPolicyPackageId}::seal_policy::seal_approve`,
                arguments: [
                    txb.pure.vector('u8', idBytes),
                    txb.object(this.config.executorCapId),
                ],
            });

            // 3. Request decryption via Seal SDK
            //    The SDK handles: sending dry-run PTB to key servers,
            //    collecting threshold key shares, combining them
            const decryptedBytes = await this.sealClient.decrypt({
                data: new Uint8Array(encryptedBlob),
                sessionKey: this.sessionKey,
                txBytes: await txb.build({ client: this.client }),
            });

            // 4. Parse decrypted JSON
            const jsonStr = new TextDecoder().decode(decryptedBytes);
            const parsed = JSON.parse(jsonStr);

            const params: DecryptedIntentParams = {
                receiveAmount: BigInt(parsed.receive_amount),
                minPrice: BigInt(parsed.min_price),
                maxPrice: BigInt(parsed.max_price),
            };

            console.log(`[Seal] Decrypted intent ${intentObjectId.slice(0, 10)}...`);
            console.log(`  receive: ${params.receiveAmount}`);
            console.log(`  price:   [${params.minPrice}, ${params.maxPrice}]`);

            return params;

        } catch (err) {
            console.error(`[Seal] Decryption failed for ${intentObjectId}:`, err);
            return null;
        }
    }

    // --------------------------------------------------------
    // Encryption (for client-side use / testing)
    // --------------------------------------------------------

    /**
     * Encrypt intent parameters for submission.
     * Typically called by the frontend/app, not the executor bot.
     * Included here for completeness and testing.
     */
    async encryptParams(
        params: DecryptedIntentParams,
        intentIdentity: Uint8Array,
        keypair: Ed25519Keypair,
    ): Promise<Uint8Array> {
        if (!this.sealClient) {
            throw new Error('[Seal] Not initialized');
        }

        const jsonStr = JSON.stringify({
            receive_amount: params.receiveAmount.toString(),
            min_price: params.minPrice.toString(),
            max_price: params.maxPrice.toString(),
        });

        const plaintext = new TextEncoder().encode(jsonStr);

        // Convert identity bytes to hex string as expected by EncryptOptions
        const identityHex = Array.from(intentIdentity)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');

        // Construct the full Seal identity:
        // [policy_package_id_bytes][inner_id_bytes]
        // The Seal SDK handles the prefix automatically
        const result = await this.sealClient.encrypt({
            data: plaintext,
            packageId: this.config.sealPolicyPackageId,
            id: identityHex,
            threshold: 1, // Fixed: added mandatory threshold
        });

        return new Uint8Array(result.encryptedObject);
    }

    // --------------------------------------------------------
    // Helpers
    // --------------------------------------------------------

    /**
     * Convert an intent object ID to the Seal identity bytes.
     * Identity = bcs::to_bytes(intent_address) = raw 32 bytes of the address.
     *
     * Sui object IDs are 32-byte hex strings (with 0x prefix).
     * BCS serialization of an address is just the raw 32 bytes.
     */
    private intentIdToSealIdentity(intentObjectId: string): number[] {
        // Strip 0x prefix
        const hex = intentObjectId.startsWith('0x')
            ? intentObjectId.slice(2)
            : intentObjectId;

        // Convert hex to bytes
        const bytes: number[] = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.slice(i, i + 2), 16));
        }

        if (bytes.length !== 32) {
            throw new Error(`[Seal] Invalid intent ID length: expected 32 bytes, got ${bytes.length}`);
        }

        return bytes;
    }

    /**
     * Fetch the encrypted_params dynamic field from an intent object.
     *
     * The encrypted params are stored as a dynamic field with key type
     * `davy::intent::EncryptedParamsKey` (empty struct, used as sentinel).
     */
    private async fetchEncryptedParams(intentObjectId: string): Promise<number[] | null> {
        try {
            // Query dynamic fields on the intent object
            const dynamicFields = await this.client.getDynamicFields({
                parentId: intentObjectId,
            });

            // Find the EncryptedParamsKey field
            const encryptedField = dynamicFields.data.find((f: any) =>
                f.name.type.includes('EncryptedParamsKey')
            );

            if (!encryptedField) return null;

            // Fetch the field value
            const fieldObj = await this.client.getDynamicFieldObject({
                parentId: intentObjectId,
                name: encryptedField.name,
            });

            // Extract the vector<u8> value
            const content = fieldObj.data?.content;
            if (content?.dataType !== 'moveObject') return null;

            const fields = content.fields as Record<string, unknown>;
            const value = fields.value;

            if (Array.isArray(value)) {
                return value.map(Number);
            }

            return null;

        } catch (err) {
            console.error(`[Seal] Failed to fetch encrypted params:`, err);
            return null;
        }
    }

    // --------------------------------------------------------
    // Session Management
    // --------------------------------------------------------

    /** Check if the session key is still valid. */
    isSessionValid(): boolean {
        if (!this.sessionKey) return false;
        return !this.sessionKey.isExpired();
    }

    /** Refresh the session key (call when expired). */
    async refreshSession(keypair: Ed25519Keypair): Promise<void> {
        console.log('[Seal] Refreshing session key...');
        await this.initialize(keypair);
    }
}
