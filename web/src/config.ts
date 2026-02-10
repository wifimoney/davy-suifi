/**
 * Davy Protocol Configuration
 *
 * Update these constants after deploying to Testnet/Mainnet.
 * See davy/DEPLOYMENT.md for the latest deployment details.
 */

export const DAVY_CONFIG = {
    // Network
    network: process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet',

    // Package ID (Mainnet Upgrade 2026-02-10)
    packageId: '0xd066082103e81d89e645d9b52b2ec7bbf08a73eca04aeeeba5e5cb240764d705',

    // Shared Objects
    adminCap: '0xdcb54d1a4a25834e91692f93347a20b75cfcfbbbae8f261f69715c493bad53e4',
    upgradeCap: '0xa83899812743da0e2a3a4780a38fd447d00fbe8ba40f5c6cca36e1a0b17aa9f7',
    revocationRegistry: '0x0f8eb4b33d0bd59d3344f57c116ae0683e5178e00aa3a9dfb432ef3a7910d9c1',

    // Pools
    pools: {
        suiUsdc: '', // Created via: sui client call --package <pkg> --module pool --function create --type-args 0x2::sui::SUI <USDC_TYPE> --args "SUI/USDC"
    },

    // Canonical coin type strings for testnet
    coinTypes: {
        SUI: '0x2::sui::SUI',
        USDC: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
    },

    // Privacy (Seal/Walrus) - PHASE 10
    sealPolicyPackageId: '0x...',
    executorCapId: '0x...',
    walrusPublisherId: '0x...',

    // Clock object (shared, well-known)
    clockId: '0x6',
} as const;
