/**
 * Davy Protocol — Router Demo
 *
 * End-to-end flow:
 * 1. Populate offer cache (simulates indexer)
 * 2. Create an intent
 * 3. Route: compare Davy vs mock DeepBook
 * 4. Print execution trace
 *
 * Run: npx tsx src/demo.ts
 */

import { OfferCache } from './offer-cache.js';
import { DavyRouter, ExternalPriceSource } from './router.js';
import { CachedIntent, ExecutionTrace } from './types.js';
import { quotePayAmount, quoteFillAmount, calcPayment, PRICE_SCALING_FACTOR } from './math.js';

// ============================================================
// 1. Mock DeepBook price source
// ============================================================

const mockDeepBook: ExternalPriceSource = {
    name: 'deepbook',
    async getPrice(_offerAsset, _wantAsset, _amount) {
        // Simulate DeepBook offering 2.05 USDC/SUI
        return 2_050_000_000n;
    },
};

// ============================================================
// 2. Setup
// ============================================================

const cache = new OfferCache();
const router = new DavyRouter(cache, [mockDeepBook]);

console.log('🏴☠️ Davy Router Reference — Demo');
console.log('='.repeat(50));

// ============================================================
// 3. Populate offer cache (simulates indexer events)
// ============================================================

console.log('\n📦 Populating offer cache from events...\n');

// Offer A: 100 SUI at 1.8–2.2 USDC/SUI (competitive)
cache.onOfferCreated({
    offerId: '0xAAAA0001',
    maker: '0xMAKER_A',
    offerAssetType: '0x2::sui::SUI',
    wantAssetType: '0xUSDC::usdc::USDC',
    initialAmount: 100_000_000_000n, // 100 SUI
    minPrice: 1_800_000_000n,        // 1.80
    maxPrice: 2_200_000_000n,        // 2.20
    fillPolicy: 1,                   // partial allowed
    minFillAmount: 1_000_000_000n,   // 1 SUI min
    expiryTimestampMs: Date.now() + 3_600_000,
});
console.log('  Offer A: 100 SUI @ 1.80–2.20 USDC/SUI (partial ok)');

// Offer B: 50 SUI at 2.0–2.5 USDC/SUI (more expensive)
cache.onOfferCreated({
    offerId: '0xBBBB0002',
    maker: '0xMAKER_B',
    offerAssetType: '0x2::sui::SUI',
    wantAssetType: '0xUSDC::usdc::USDC',
    initialAmount: 50_000_000_000n,
    minPrice: 2_000_000_000n,
    maxPrice: 2_500_000_000n,
    fillPolicy: 1,
    minFillAmount: 5_000_000_000n,
    expiryTimestampMs: Date.now() + 7_200_000,
});
console.log('  Offer B: 50 SUI @ 2.00–2.50 USDC/SUI (partial ok)');

// Offer C: expired (should be filtered out)
cache.onOfferCreated({
    offerId: '0xCCCC0003',
    maker: '0xMAKER_C',
    offerAssetType: '0x2::sui::SUI',
    wantAssetType: '0xUSDC::usdc::USDC',
    initialAmount: 200_000_000_000n,
    minPrice: 1_500_000_000n,
    maxPrice: 1_600_000_000n,
    fillPolicy: 0,
    minFillAmount: 200_000_000_000n,
    expiryTimestampMs: Date.now() - 1000, // already expired
});
console.log('  Offer C: 200 SUI @ 1.50–1.60 (EXPIRED — should be filtered)\n');

console.log(`  Cache size: ${cache.size} offers\n`);

// ============================================================
// 4. Create intent
// ============================================================

const intent: CachedIntent = {
    intentId: '0xINTENT_001',
    creator: '0xTAKER',
    receiveAssetType: '0x2::sui::SUI',
    payAssetType: '0xUSDC::usdc::USDC',
    receiveAmount: 10_000_000_000n,   // wants 10 SUI
    maxPayAmount: 25_000_000_000n,    // willing to pay up to 25 USDC
    escrowedAmount: 25_000_000_000n,  // 25 USDC escrowed
    minPrice: 1_500_000_000n,         // accepts 1.50+ USDC/SUI
    maxPrice: 2_500_000_000n,         // accepts up to 2.50
    expiryTimestampMs: Date.now() + 1_800_000,
    status: 'pending',
};

console.log('📝 Intent: Buy 10 SUI, willing to pay up to 25 USDC');
console.log(`   Price bounds: 1.50–2.50 USDC/SUI\n`);

// ============================================================
// 5. Route
// ============================================================

console.log('🔄 Routing...\n');

const decision = await router.routeIntent(intent, Date.now());

console.log('📊 Routing Decision:');
console.log(`   Source:    ${decision.source}`);
console.log(`   Fill:      ${Number(decision.fillAmount) / 1e9} SUI`);
console.log(`   Payment:   ${Number(decision.paymentAmount) / 1e9} USDC`);
console.log(`   Price:     ${Number(decision.effectivePrice) / 1e9} USDC/SUI`);
console.log(`   Reason:    ${decision.reason}\n`);

// ============================================================
// 6. Execution trace
// ============================================================

const trace: ExecutionTrace = {
    intentId: intent.intentId,
    decision,
    timestamp: Date.now(),
};

console.log('📋 Execution Trace:');
console.log(JSON.stringify(trace, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

// ============================================================
// 7. Math verification
// ============================================================

console.log('\n🧮 Math Verification:');
console.log(`   PRICE_SCALING_FACTOR: ${PRICE_SCALING_FACTOR}`);

const testFill = 10_000_000_000n;
const testPrice = 1_800_000_000n;
const payment = calcPayment(testFill, testPrice);
console.log(`   calcPayment(10 SUI, 1.80) = ${Number(payment) / 1e9} USDC`);

const budget = 20_000_000_000n;
const maxFill = quoteFillAmount(budget, 2_000_000_000n, 100_000_000_000n);
console.log(`   quoteFillAmount(20 USDC, 2.00, 100 remaining) = ${Number(maxFill) / 1e9} SUI`);

const roundTrip = quotePayAmount(maxFill, 2_000_000_000n);
console.log(`   quotePayAmount(${Number(maxFill) / 1e9} SUI, 2.00) = ${Number(roundTrip) / 1e9} USDC`);
console.log(`   Round-trip budget check: ${roundTrip} <= ${budget} ? ${roundTrip <= budget}`);

console.log('\n✅ Demo complete.\n');
