import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
// import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Config options for the networks you want to connect to
const { networkConfig } = createNetworkConfig({
    localnet: { url: 'http://127.0.0.1:9000', network: 'localnet' },
    testnet: { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' },
    mainnet: { url: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet' },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <SuiClientProvider networks={networkConfig} defaultNetwork={import.meta.env.VITE_SUI_NETWORK as "testnet" || "localnet"}>
                <WalletProvider>
                    {children}
                </WalletProvider>
            </SuiClientProvider>
        </QueryClientProvider>
    );
}
