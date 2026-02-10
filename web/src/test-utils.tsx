import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

// Mock dapp-kit hooks
vi.mock('@mysten/dapp-kit', () => ({
    useCurrentAccount: vi.fn(() => null),
    useSuiClient: vi.fn(() => ({
        getBalance: vi.fn(() => Promise.resolve({ totalBalance: '0' })),
        queryEvents: vi.fn(() => Promise.resolve({ data: [] })),
    })),
    useSignAndExecuteTransaction: vi.fn(() => ({
        mutateAsync: vi.fn(),
    })),
    ConnectButton: ({ className }: { className?: string }) => (
        <button className={className} data-testid="connect-button">Connect Wallet</button>
    ),
    createNetworkConfig: vi.fn(() => ({ networkConfig: {} })),
    SuiClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock router hook
vi.mock('@/hooks/use-davy-router', () => ({
    useDavyRouter: vi.fn(() => ({
        router: {} as any,
        cache: {} as any,
        routeIntent: vi.fn(() =>
            Promise.resolve({
                isSplit: false,
                legs: [],
                totalReceiveAmount: 0n,
                totalPayAmount: 0n,
                blendedPrice: 0n,
            }),
        ),
        getRoute: vi.fn(() => Promise.resolve(null)),
        getOffers: vi.fn(() => []),
    })),
}));

// Mock transaction hook
vi.mock('@/hooks/use-davy-transactions', () => ({
    useDavyTransactions: vi.fn(() => ({
        isConnected: false,
        address: undefined,
        createOffer: vi.fn(),
        createIntent: vi.fn(),
        fillOffer: vi.fn(),
        cancelIntent: vi.fn(),
    })),
}));

// Mock order events hook
vi.mock('@/hooks/use-order-events', () => ({
    useOrderEvents: vi.fn(() => ({
        data: [],
        isLoading: false,
        error: null,
    })),
}));

function createTestQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: 0,
            },
        },
    });
}

export function renderWithProviders(
    ui: React.ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>,
) {
    const queryClient = createTestQueryClient();

    function Wrapper({ children }: { children: React.ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    }

    return render(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
export { renderWithProviders as render };
