/**
 * Davy Protocol — Phase 10, Task 10.4: Private Offers Service
 *
 * Combines Seal (threshold encryption) + Walrus (decentralized storage)
 * to enable dark pool–style private offers:
 *
 *   1. Maker creates a standard on-chain offer (public amount + asset types)
 *   2. Maker encrypts sensitive terms (price bounds, notes) with Seal
 *      using the allowlist-gated policy (seal_approve_allowlist)
 *   3. Encrypted blob is stored on Walrus
 *   4. Walrus blobId is stored as a reference on-chain (or off-chain index)
 *   5. Allowlisted counterparties decrypt via Seal → see full terms
 *   6. Non-allowlisted users see only: "Private offer — X SUI available"
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SealAdapter } from './seal-adapter.js';
import {
    WalrusAdapter,
    WalrusUploadResult,
    EncryptedMetadataEnvelope,
} from './walrus-adapter.js';

// ============================================================
// Types
// ============================================================

/** Private offer terms — the sensitive data encrypted with Seal. */
export interface PrivateOfferTerms {
    /** Minimum price the maker will accept (Davy 1e9 scaled). */
    minPrice: string; // stringified bigint for JSON safety
    /** Maximum price the maker will accept. */
    maxPrice: string;
    /** Optional: preferred counterparty notes. */
    notes?: string;
    /** Optional: minimum fill amount the maker requires. */
    minFillAmount?: string;
}

/** Full private offer record tracked by the router/indexer. */
export interface PrivateOfferRecord {
    /** On-chain offer object ID. */
    offerId: string;
    /** On-chain allowlist object ID. */
    allowlistId: string;
    /** Walrus blob ID containing encrypted terms. */
    walrusBlobId: string;
    /** Walrus blob object ID (for deletion). */
    walrusBlobObjectId: string;
    /** Maker address. */
    maker: string;
    /** Offer asset type. */
    offerAssetType: string;
    /** Want asset type. */
    wantAssetType: string;
    /** Public offer amount (visible to everyone). */
    publicAmount: bigint;
    /** Creation timestamp. */
    createdAt: number;
    /** Whether terms have been decrypted by the current session. */
    decryptedTerms?: PrivateOfferTerms;
}

/** Config for the private offers service. */
export interface PrivateOffersConfig {
    client: SuiClient;
    sealAdapter: SealAdapter;
    walrusAdapter: WalrusAdapter;
    /** Davy core package ID. */
    davyPackageId: string;
    /** Seal policy package ID. */
    sealPolicyPackageId: string;
    env: 'testnet' | 'mainnet';
}

// ============================================================
// Service
// ============================================================

export class PrivateOffersService {
    private client: SuiClient;
    private seal: SealAdapter;
    private walrus: WalrusAdapter;
    private config: PrivateOffersConfig;

    /** In-memory index of private offers. */
    private offers: Map<string, PrivateOfferRecord> = new Map();

    constructor(config: PrivateOffersConfig) {
        this.config = config;
        this.client = config.client;
        this.seal = config.sealAdapter;
        this.walrus = config.walrusAdapter;
    }

    // --------------------------------------------------------
    // Maker Flow: Create Private Offer
    // --------------------------------------------------------

    /**
     * Create a private offer with encrypted terms.
     */
    async createPrivateOffer(params: {
        offerId: string;
        offerAssetType: string;
        wantAssetType: string;
        publicAmount: bigint;
        terms: PrivateOfferTerms;
        allowedAddresses: string[];
        keypair: Ed25519Keypair;
    }): Promise<PrivateOfferRecord> {
        const maker = params.keypair.toSuiAddress();
        console.log(`[PrivateOffers] Creating private offer for ${params.offerId.slice(0, 10)}...`);

        // ── Step 1: Create on-chain allowlist ──
        const allowlistId = await this.createAllowlist(
            params.offerId,
            params.allowedAddresses,
            params.keypair,
        );
        console.log(`[PrivateOffers] Allowlist created: ${allowlistId.slice(0, 10)}...`);

        // ── Step 2: Encrypt terms with Seal ──
        const identityBytes = this.objectIdToBytes(params.offerId);

        const ciphertext = await this.seal.encryptParams(
            {
                receiveAmount: 0n,
                minPrice: BigInt(params.terms.minPrice),
                maxPrice: BigInt(params.terms.maxPrice),
            },
            new Uint8Array(identityBytes),
            params.keypair,
        );

        console.log(`[PrivateOffers] Terms encrypted: ${ciphertext.length} bytes`);

        // ── Step 3: Upload to Walrus ──
        const ciphertextBase64 = Buffer.from(ciphertext).toString('base64');
        const envelope = WalrusAdapter.createPrivateOfferEnvelope({
            offerObjectId: params.offerId,
            sealPolicyPackageId: this.config.sealPolicyPackageId,
            ciphertextBase64,
            creator: maker,
        });

        const upload = await this.walrus.uploadEncryptedMetadata(
            envelope,
            params.keypair,
        );
        console.log(`[PrivateOffers] Uploaded to Walrus: ${upload.blobId.slice(0, 16)}...`);

        // ── Step 4: Build record ──
        const record: PrivateOfferRecord = {
            offerId: params.offerId,
            allowlistId,
            walrusBlobId: upload.blobId,
            walrusBlobObjectId: upload.blobObjectId,
            maker,
            offerAssetType: params.offerAssetType,
            wantAssetType: params.wantAssetType,
            publicAmount: params.publicAmount,
            createdAt: Date.now(),
        };

        this.offers.set(params.offerId, record);
        console.log(`[PrivateOffers] ✓ Private offer created successfully`);

        return record;
    }

    // --------------------------------------------------------
    // Taker Flow: View Private Offer
    // --------------------------------------------------------

    /**
     * Attempt to decrypt and view a private offer's terms.
     */
    async viewPrivateOffer(
        offerId: string,
        walrusBlobId?: string,
    ): Promise<PrivateOfferTerms | null> {
        const record = this.offers.get(offerId);
        const blobId = walrusBlobId ?? record?.walrusBlobId;

        if (!blobId) {
            console.warn(`[PrivateOffers] No Walrus blobId for offer ${offerId}`);
            return null;
        }

        try {
            // 1. Read from Walrus
            const envelope = await this.walrus.readEncryptedMetadata(blobId);
            if (!envelope) {
                console.warn(`[PrivateOffers] Failed to read envelope from Walrus`);
                return null;
            }

            // 2. Decode ciphertext
            const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

            // 3. Decrypt via Seal (placeholder logic as it requires SealClient dry-run wiring)
            console.log(`[PrivateOffers] Attempting Seal decryption for offer ${offerId.slice(0, 10)}...`);

            // In production, this would call a method that builds a PTB with seal_approve_allowlist
            // For now we return null or placeholder terms
            return null;

        } catch (err) {
            console.error(`[PrivateOffers] Failed to view offer ${offerId}:`, err);
            return null;
        }
    }

    // --------------------------------------------------------
    // Maker Flow: Manage Allowlist
    // --------------------------------------------------------

    async addToAllowlist(
        allowlistId: string,
        address: string,
        keypair: Ed25519Keypair,
    ): Promise<string> {
        const tx = new Transaction();

        tx.moveCall({
            target: `${this.config.sealPolicyPackageId}::seal_policy::add_to_allowlist`,
            arguments: [
                tx.object(allowlistId),
                tx.pure.address(address),
            ],
        });

        const response = await this.client.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
            options: { showEffects: true },
        });

        return response.digest;
    }

    async removeFromAllowlist(
        allowlistId: string,
        address: string,
        keypair: Ed25519Keypair,
    ): Promise<string> {
        const tx = new Transaction();

        tx.moveCall({
            target: `${this.config.sealPolicyPackageId}::seal_policy::remove_from_allowlist`,
            arguments: [
                tx.object(allowlistId),
                tx.pure.address(address),
            ],
        });

        const response = await this.client.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
            options: { showEffects: true },
        });

        return response.digest;
    }

    // --------------------------------------------------------
    // Internal
    // --------------------------------------------------------

    private async createAllowlist(
        offerId: string,
        allowedAddresses: string[],
        keypair: Ed25519Keypair,
    ): Promise<string> {
        const tx = new Transaction();

        tx.moveCall({
            target: `${this.config.sealPolicyPackageId}::seal_policy::create_and_share_allowlist`,
            arguments: [
                tx.pure.address(offerId),
                tx.pure.vector('address', allowedAddresses),
            ],
        });

        const response = await this.client.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
            options: { showEffects: true },
        });

        const created = response.effects?.created;
        if (!created || created.length === 0) {
            throw new Error('Failed to create allowlist — no objects created');
        }

        const sharedObj = created.find(
            (obj) => obj.owner && typeof obj.owner === 'object' && 'Shared' in obj.owner,
        );

        if (!sharedObj) {
            throw new Error('Failed to find shared allowlist object');
        }

        return sharedObj.reference.objectId;
    }

    private objectIdToBytes(objectId: string): number[] {
        const hex = objectId.startsWith('0x') ? objectId.slice(2) : objectId;
        const bytes: number[] = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.slice(i, i + 2), 16));
        }
        if (bytes.length !== 32) {
            throw new Error(`Invalid object ID length: ${bytes.length}`);
        }
        return bytes;
    }
}
