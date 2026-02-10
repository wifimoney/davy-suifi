/**
 * Davy Protocol — Phase 10, Task 10.3: Walrus Adapter
 *
 * Stores and retrieves encrypted offer/intent metadata on Walrus
 * (Mysten's decentralized blob storage). This keeps large encrypted
 * payloads off-chain while maintaining a content-addressable reference
 * (blobId) on-chain via dynamic fields.
 *
 * Use cases:
 *   1. Encrypted intent metadata that's too large for on-chain storage
 *   2. Private offer terms (encrypted with Seal, stored on Walrus)
 *   3. Event archive / historical data backup
 *
 * Dependencies: @mysten/walrus (npm install @mysten/walrus)
 *               @mysten/sui   (already installed)
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { WalrusClient } from '@mysten/walrus';

// ============================================================
// Types
// ============================================================

/** Result of uploading a blob to Walrus. */
export interface WalrusUploadResult {
    /** Content-addressable blob ID (used for reads). */
    blobId: string;
    /** Sui object ID of the blob metadata object. */
    blobObjectId: string;
    /** Size of the uploaded data in bytes. */
    sizeBytes: number;
    /** Number of epochs the blob is stored for. */
    epochs: number;
}

/** Metadata envelope stored on Walrus. */
export interface EncryptedMetadataEnvelope {
    /** Protocol version for forward compat. */
    version: 1;
    /** What type of data is encrypted. */
    type: 'intent_params' | 'offer_terms' | 'private_offer';
    /** On-chain object ID this metadata belongs to. */
    objectId: string;
    /** Seal policy package used for encryption. */
    sealPolicyPackageId: string;
    /** The Seal-encrypted ciphertext (base64). */
    ciphertext: string;
    /** Unix timestamp (ms) of encryption. */
    encryptedAt: number;
    /** Creator address. */
    creator: string;
}

/** Configuration for the Walrus adapter. */
export interface WalrusAdapterConfig {
    /** Sui RPC client. */
    client: SuiClient;
    /** Network: 'testnet' | 'mainnet'. */
    env: 'testnet' | 'mainnet';
    /** Number of Walrus epochs to store blobs (default: 5). */
    storageEpochs?: number;
    /** Whether blobs should be deletable by the uploader (default: true). */
    deletable?: boolean;
    /** Optional upload relay URL for production performance. */
    uploadRelayUrl?: string;
    /** Max upload relay tip in MIST (default: 1000). */
    maxRelayTip?: number;
}

// ============================================================
// Adapter
// ============================================================

export class WalrusAdapter {
    private config: WalrusAdapterConfig;
    private walrusClient: WalrusClient;

    constructor(config: WalrusAdapterConfig) {
        this.config = config;

        // Initialize Walrus client
        // The SDK auto-discovers package/object IDs for known networks
        const walrusConfig: ConstructorParameters<typeof WalrusClient>[0] = {
            network: config.env,
            suiClient: config.client as any,
        };

        this.walrusClient = new WalrusClient(walrusConfig);
    }

    // --------------------------------------------------------
    // Upload
    // --------------------------------------------------------

    /**
     * Upload an encrypted metadata envelope to Walrus.
     *
     * @param envelope - The metadata to store (will be JSON-serialized)
     * @param signer  - Keypair that pays for storage (needs SUI + WAL)
     * @returns Upload result with blobId for future reads
     */
    async uploadEncryptedMetadata(
        envelope: EncryptedMetadataEnvelope,
        signer: Ed25519Keypair,
    ): Promise<WalrusUploadResult> {
        const jsonStr = JSON.stringify(envelope);
        const bytes = new TextEncoder().encode(jsonStr);

        console.log(`[Walrus] Uploading ${bytes.length} bytes for ${envelope.type} (${envelope.objectId.slice(0, 10)}...)`);

        const { blobId, blobObject } = await this.walrusClient.writeBlob({
            blob: bytes,
            deletable: this.config.deletable ?? true,
            epochs: this.config.storageEpochs ?? 5,
            signer,
        });

        const result: WalrusUploadResult = {
            blobId,
            blobObjectId: blobObject.id,
            sizeBytes: bytes.length,
            epochs: this.config.storageEpochs ?? 5,
        };

        console.log(`[Walrus] ✓ Uploaded: blobId=${blobId.slice(0, 16)}...`);
        console.log(`[Walrus]   objectId=${result.blobObjectId}`);

        return result;
    }

    /**
     * Upload raw encrypted bytes to Walrus (no envelope wrapping).
     * Used when the caller manages their own serialization.
     */
    async uploadRawBlob(
        data: Uint8Array,
        signer: Ed25519Keypair,
        label?: string,
    ): Promise<WalrusUploadResult> {
        console.log(`[Walrus] Uploading raw blob: ${data.length} bytes${label ? ` (${label})` : ''}`);

        const { blobId, blobObject } = await this.walrusClient.writeBlob({
            blob: data,
            deletable: this.config.deletable ?? true,
            epochs: this.config.storageEpochs ?? 5,
            signer,
        });

        return {
            blobId,
            blobObjectId: blobObject.id,
            sizeBytes: data.length,
            epochs: this.config.storageEpochs ?? 5,
        };
    }

    // --------------------------------------------------------
    // Download
    // --------------------------------------------------------

    /**
     * Read an encrypted metadata envelope from Walrus.
     *
     * @param blobId - Content-addressable blob ID from upload
     * @returns Parsed envelope, or null if not found / invalid
     */
    async readEncryptedMetadata(blobId: string): Promise<EncryptedMetadataEnvelope | null> {
        try {
            console.log(`[Walrus] Reading blob ${blobId.slice(0, 16)}...`);

            const blob = await this.walrusClient.readBlob({ blobId });
            const jsonStr = new TextDecoder().decode(blob);
            const envelope: EncryptedMetadataEnvelope = JSON.parse(jsonStr);

            // Basic validation
            if (envelope.version !== 1) {
                console.warn(`[Walrus] Unknown envelope version: ${envelope.version}`);
                return null;
            }

            console.log(`[Walrus] ✓ Read: type=${envelope.type}, object=${envelope.objectId.slice(0, 10)}...`);
            return envelope;

        } catch (err) {
            console.error(`[Walrus] Read failed for blob ${blobId}:`, err);
            return null;
        }
    }

    /**
     * Read raw blob bytes from Walrus.
     */
    async readRawBlob(blobId: string): Promise<Uint8Array | null> {
        try {
            const blob = await this.walrusClient.readBlob({ blobId });
            return new Uint8Array(blob);
        } catch (err) {
            console.error(`[Walrus] Raw read failed:`, err);
            return null;
        }
    }

    // --------------------------------------------------------
    // Delete
    // --------------------------------------------------------

    /**
     * Delete a blob from Walrus (only works if deletable=true at upload).
     */
    async deleteBlob(
        blobObjectId: string,
        signer: Ed25519Keypair,
    ): Promise<boolean> {
        try {
            const { digest } = await this.walrusClient.executeDeleteBlobTransaction({
                blobObjectId,
                signer,
            });
            console.log(`[Walrus] ✓ Deleted blob object ${blobObjectId}, tx: ${digest}`);
            return true;
        } catch (err) {
            console.error(`[Walrus] Delete failed:`, err);
            return false;
        }
    }

    // --------------------------------------------------------
    // Helpers
    // --------------------------------------------------------

    /**
     * Create an envelope for encrypted intent params.
     */
    static createIntentEnvelope(params: {
        intentObjectId: string;
        sealPolicyPackageId: string;
        ciphertextBase64: string;
        creator: string;
    }): EncryptedMetadataEnvelope {
        return {
            version: 1,
            type: 'intent_params',
            objectId: params.intentObjectId,
            sealPolicyPackageId: params.sealPolicyPackageId,
            ciphertext: params.ciphertextBase64,
            encryptedAt: Date.now(),
            creator: params.creator,
        };
    }

    /**
     * Create an envelope for private offer terms.
     */
    static createPrivateOfferEnvelope(params: {
        offerObjectId: string;
        sealPolicyPackageId: string;
        ciphertextBase64: string;
        creator: string;
    }): EncryptedMetadataEnvelope {
        return {
            version: 1,
            type: 'private_offer',
            objectId: params.offerObjectId,
            sealPolicyPackageId: params.sealPolicyPackageId,
            ciphertext: params.ciphertextBase64,
            encryptedAt: Date.now(),
            creator: params.creator,
        };
    }

    /**
     * Aggregator URL for reading blobs via HTTP GET (no SDK needed).
     * Useful for frontend reads where the full SDK is too heavy.
     */
    static aggregatorUrl(blobId: string, env: 'testnet' | 'mainnet'): string {
        const base = env === 'mainnet'
            ? 'https://aggregator.walrus.space'
            : 'https://aggregator.testnet.walrus.space';
        return `${base}/v1/blobs/${blobId}`;
    }
}
