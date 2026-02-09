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

    // Pools (if any created)
    pools: {
        suiUsdc: '', // To be filled if a pool is created
    }
};
