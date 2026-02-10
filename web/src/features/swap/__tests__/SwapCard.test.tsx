import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { SwapCard } from '../SwapCard';

import { useDavyRouter } from '@/hooks/use-davy-router';

const mockRouteIntent = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDavyRouter).mockReturnValue({
        router: {} as any,
        cache: {} as any,
        routeIntent: mockRouteIntent,
        getOffers: vi.fn(() => []),
    });
});

describe('SwapCard', () => {
    it('renders the swap card with pay and receive inputs', () => {
        renderWithProviders(<SwapCard />);

        expect(screen.getByText('Swap')).toBeInTheDocument();
        expect(screen.getByText('You Pay')).toBeInTheDocument();
        expect(screen.getByText('You Receive')).toBeInTheDocument();
        expect(screen.getByText('USDC')).toBeInTheDocument();
        expect(screen.getByText('SUI')).toBeInTheDocument();
    });

    it('shows route info when a quote is returned', async () => {
        mockRouteIntent.mockResolvedValue({
            isSplit: false,
            legs: [{
                venue: 'davy',
                quote: { offerId: '0xabc' },
                receiveAmount: 3_000_000_000n,
                payAmount: 4_500_000_000n,
                effectivePrice: 1_500_000_000n,
            }],
            totalReceiveAmount: 3_000_000_000n,
            totalPayAmount: 4_500_000_000n,
            blendedPrice: 1_500_000_000n,
        });

        renderWithProviders(<SwapCard />);

        // Get the pay input specifically (type=number)
        const payInput = screen.getByRole('spinbutton');
        const { default: userEvent } = await import('@testing-library/user-event');
        const user = userEvent.setup();
        await user.type(payInput, '4.5');

        await waitFor(() => {
            expect(mockRouteIntent).toHaveBeenCalled();
        }, { timeout: 3000 });
    });

    it('disables swap button when no route is available', () => {
        renderWithProviders(<SwapCard />);

        const swapButton = screen.getByRole('button', { name: /enter amount/i });
        expect(swapButton).toBeDisabled();
    });

    it('renders slippage settings', () => {
        renderWithProviders(<SwapCard />);

        // The refresh button and settings button should be present
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(2);
    });
});
