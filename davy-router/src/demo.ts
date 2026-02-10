/**
 * Davy Protocol — Phase 8: Demo
 *
 * Runs the execution engine against mainnet to look for opportunities.
 * (Read-only mode unless private key is provided)
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { ExecutionEngine } from './execution-engine.js';
import { ExecutionEngineConfig } from './types.js';

// Configuration
const CONFIG: ExecutionEngineConfig = {
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
    env: 'mainnet',
    davyPackageId: '0xa72da630c7e2f5ff51dd43c72b2260ff00216441703e38714392410a8c253b27', // Replace with real package ID if different
    executorCapId: '0x...', // Replace with your ExecutorCap ID
    pollIntervalMs: 2000,
    maxGasBudget: 50_000_000,
};

async function main() {
    console.log('=== Davy Protocol Phase 8 Router Demo ===');

    // 1. Setup Engine
    const engine = new ExecutionEngine(CONFIG);

    // 2. Start (Read-Only Mode if no keypair)
    // To run in execution mode, provide a keypair:
    // const keypair = Ed25519Keypair.fromSecretKey(fromB64('...'));
    // await engine.start(keypair);

    // For demo, we just start without keypair which will fail execution but show logs
    const dummyKeypair = new Ed25519Keypair();
    await engine.start(dummyKeypair);

    // 3. Monitor
    const cache = engine.getCache();

    setInterval(() => {
        console.clear();
        console.log('=== Live Status ===');
        console.log(`Offers:  ${cache.activeOfferCount}`);
        console.log(`Intents: ${cache.pendingIntentCount}`);

        const metrics = engine.getMetrics();
        console.log('\nMetrics:', JSON.stringify(metrics, null, 2));

        if (cache.activeOfferCount > 0) {
            console.log('\nTop Offers:');
            const offers = cache.getActiveOffersSorted(
                '0x2::sui::SUI',
                '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
            ).slice(0, 5);

            offers.forEach(o => {
                console.log(`- ${o.maker.slice(0, 6)}...: ${o.remainingBalance} SUI @ ${Number(o.minPrice) / 1e9} USDC`);
            });
        }
    }, 5000);

    // Keep running
    await new Promise(() => { });
}

main().catch(console.error);
