/**
 * Davy Protocol Configuration
 *
 * Update these constants after deploying to Testnet/Mainnet.
 * See davy/DEPLOYMENT.md for the latest deployment details.
 */

export const DAVY_CONFIG = {
    // Network
    network: process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet',

    // Package ID
    packageId: '0xf69318140671d96b322d284301343091d030c1ad2d22bcdeb0e5dded356e5ecf',

    // Shared Objects
    adminCap: '0x72553cbedf73c71e2a1a7d178b0148bf5991609e140d48f9f03700c6d3b2cb75',
    upgradeCap: '0x7ec1fda4a77943f53d8cbc178408c47a49422ee9987ae56f40af60d839bf7dcc',

    // Pools
    pools: {
        suiUsdc: '', // Created via: sui client call --package <pkg> --module pool --function create --type-args 0x2::sui::SUI <USDC_TYPE> --args "SUI/USDC"
    },

    // Canonical coin type strings for testnet
    coinTypes: {
        SUI: '0x2::sui::SUI',
        USDC: '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
    },

    // Clock object (shared, well-known)
    clockId: '0x6',
} as const;
