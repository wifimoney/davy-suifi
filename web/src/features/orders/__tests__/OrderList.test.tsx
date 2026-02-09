import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils';
import { OrderList } from '../OrderList';
import { useOrderEvents } from '@/hooks/use-order-events';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('OrderList', () => {
    it('renders empty state when no events', () => {
        vi.mocked(useOrderEvents).mockReturnValue({
            data: [],
            isLoading: false,
            error: null,
        } as any);

        renderWithProviders(<OrderList />);

        expect(screen.getByText('Activity')).toBeInTheDocument();
        expect(screen.getByText('No activity yet')).toBeInTheDocument();
        expect(screen.getByText('Your trades will appear here')).toBeInTheDocument();
    });

    it('renders loading skeleton', () => {
        vi.mocked(useOrderEvents).mockReturnValue({
            data: undefined,
            isLoading: true,
            error: null,
        } as any);

        renderWithProviders(<OrderList />);

        // Skeleton has animate-pulse divs
        const pulseElements = document.querySelectorAll('.animate-pulse');
        expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('renders order events', () => {
        vi.mocked(useOrderEvents).mockReturnValue({
            data: [
                {
                    id: '0x123',
                    type: 'offer_filled',
                    pair: 'SUI/USDC',
                    amountIn: '10.00',
                    amountOut: '15.00',
                    price: '1.5000',
                    status: 'filled',
                    timestamp: Date.now() - 120_000,
                    txDigest: '0xtx123',
                },
                {
                    id: '0x456',
                    type: 'intent_submitted',
                    pair: 'SUI/USDC',
                    amountIn: '50.00',
                    amountOut: '35.00',
                    price: '1.4200',
                    status: 'pending',
                    timestamp: Date.now() - 900_000,
                    txDigest: '0xtx456',
                },
            ],
            isLoading: false,
            error: null,
        } as any);

        renderWithProviders(<OrderList />);

        expect(screen.getByText('10.00')).toBeInTheDocument();
        expect(screen.getByText('50.00')).toBeInTheDocument();
        expect(screen.getByText('filled')).toBeInTheDocument();
        expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it('renders tab triggers', () => {
        vi.mocked(useOrderEvents).mockReturnValue({
            data: [],
            isLoading: false,
            error: null,
        } as any);

        renderWithProviders(<OrderList />);

        expect(screen.getByRole('tab', { name: /all/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /open/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument();
    });
});
