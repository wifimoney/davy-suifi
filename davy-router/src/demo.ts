import { DavyRouter } from './router';
import { OfferCache } from './offer-cache';
import { CachedOffer, CachedIntent, OfferStatus, FillPolicy } from './types';

/**
 * Davy Protocol — Router Demo
 *
 * Simulates an end-to-end execution flow:
 * 1. Populate mock offer cache (representing indexed on-chain state)
 * 2. Create a user intent (representing a `create_price_bounded` TX)
 * 3. Route the intent to find the best execution path
 * 4. Print the execution trace
 */

async function main() {
    console.log('--- Davy Protocol Router Demo ---\n');

    // 1. Initialize Cache
    const cache = new OfferCache();
    const router = new DavyRouter(cache);

    // 2. Mock Data: Offers
    const offers: CachedOffer[] = [
        {
            offerId: '0xabc123...',
            maker: '0xmaker1...',
            offerAssetType: 'SUI',
            wantAssetType: 'USDC',
            initialAmount: 10_000_000_000n, // 10 SUI
            remainingAmount: 5_000_000_000n, // 5 SUI remaining
            minPrice: 980_000_000n, // 0.98 USDC/SUI (Competitive!)
            maxPrice: 1_200_000_000n, // 1.2 USDC/SUI
            fillPolicy: FillPolicy.PartialAllowed,
            minFillAmount: 1_000_000_000n, // 1 SUI
            expiryTimestampMs: Date.now() + 3600_000,
            status: OfferStatus.PartiallyFilled,
            totalFilled: 5_000_000_000n,
            fillCount: 1,
        },
        {
            offerId: '0xdef456...',
            maker: '0xmaker2...',
            offerAssetType: 'SUI',
            wantAssetType: 'USDC',
            initialAmount: 20_000_000_000n, // 20 SUI
            remainingAmount: 20_000_000_000n, // 20 SUI full
            minPrice: 950_000_000n, // 0.95 USDC/SUI (Even cheaper!)
            maxPrice: 1_900_000_000n, // 1.9 USDC/SUI
            fillPolicy: FillPolicy.FullOnly,
            minFillAmount: 20_000_000_000n, // Must take all 20
            expiryTimestampMs: Date.now() + 3600_000,
            status: OfferStatus.Created,
            totalFilled: 0n,
            fillCount: 0,
        },
    ];

    offers.forEach(o => cache.upsert(o));
    console.log(`Initialized cache with ${offers.length} offers.`);

    // 3. Create Intent (User wants 5 SUI, willing to pay up to 2.0 USDC/SUI)
    const intent: CachedIntent = {
        intentId: '0xintent789...',
        creator: '0xtaker1...',
        receiveAssetType: 'SUI',
        payAssetType: 'USDC',
        receiveAmount: 5_000_000_000n, // 5 SUI
        maxPayAmount: 10_000_000_000n, // Max budget: 10 USDC (implied 2.0 price)
        escrowedAmount: 10_000_000_000n, // Fully funded
        minPrice: 1_000_000_000n, // 1.0 min
        maxPrice: 2_000_000_000n, // 2.0 max
        expiryTimestampMs: Date.now() + 600_000, // 10m expiry
        status: 'pending',
    };

    console.log(`\nProcessing Intent ${intent.intentId}:`);
    console.log(`  Generic: Want 5 SUI for max 10 USDC (Price limit: 2.0)`);

    // 4. Route
    const decision = await router.routeIntent(intent, Date.now());

    // 5. Output Result
    console.log('\n--- Routing Decision ---');
    console.log(`Source:         ${decision.source.toUpperCase()}`);
    if (decision.offerId) {
        console.log(`Offer ID:       ${decision.offerId}`);
    }
    console.log(`Fill Amount:    ${Number(decision.fillAmount) / 1e9} SUI`);
    console.log(`Payment Amount: ${Number(decision.paymentAmount) / 1e9} USDC`);
    console.log(`Effective Price: ${Number(decision.effectivePrice) / 1e9} USDC/SUI`);
    console.log(`Reason:         ${decision.reason}`);

    // Explanation of logic:
    // Offer 1 (0xabc...): 5 SUI available @ 1.5 USDC. Cost = 7.5 USDC.
    // Offer 2 (0xdef...): 20 SUI available @ 1.45 USDC. FULL ONLY. User only wants 5. Skipped.
    // External: Random mock. If strict < 1.5, it might win.
}

main().catch(console.error);
