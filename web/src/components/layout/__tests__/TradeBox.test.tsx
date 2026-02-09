import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, fireEvent } from '@/test-utils';
import { TradeBox } from '../TradeBox';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useDavyTransactions } from '@/hooks/use-davy-transactions';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('TradeBox', () => {
    it('renders buy/sell toggle', () => {
        renderWithProviders(<TradeBox />);

        expect(screen.getByText('Buy')).toBeInTheDocument();
        expect(screen.getByText('Sell')).toBeInTheDocument();
    });

    it('toggles buy/sell state', () => {
        renderWithProviders(<TradeBox />);

        const buyBtn = screen.getByText('Buy');
        const sellBtn = screen.getByText('Sell');

        // Initially buy is active (green)
        expect(buyBtn.className).toContain('green-500');

        fireEvent.click(sellBtn);
        expect(sellBtn.className).toContain('red-500');
    });

    it('renders swap/limit/dca tabs', () => {
        renderWithProviders(<TradeBox />);

        expect(screen.getByText('Swap')).toBeInTheDocument();
        expect(screen.getByText('Limit')).toBeInTheDocument();
        expect(screen.getByText('DCA')).toBeInTheDocument();
    });

    it('shows DCA coming soon placeholder', () => {
        renderWithProviders(<TradeBox />);

        const dcaTab = screen.getByText('DCA');
        fireEvent.click(dcaTab);

        expect(screen.getByText('Coming Soon')).toBeInTheDocument();
        expect(screen.getByText(/dollar-cost averaging/i)).toBeInTheDocument();
    });

    it('shows connect button when wallet not connected', () => {
        vi.mocked(useCurrentAccount).mockReturnValue(null);
        vi.mocked(useDavyTransactions).mockReturnValue({
            isConnected: false,
            address: undefined,
            createOffer: vi.fn(),
            createIntent: vi.fn(),
            fillOffer: vi.fn(),
            cancelIntent: vi.fn(),
        });

        renderWithProviders(<TradeBox />);

        expect(screen.getByTestId('connect-button')).toBeInTheDocument();
    });

    it('shows action button when wallet connected', () => {
        vi.mocked(useCurrentAccount).mockReturnValue({
            address: '0xabc123',
        } as any);
        vi.mocked(useDavyTransactions).mockReturnValue({
            isConnected: true,
            address: '0xabc123',
            createOffer: vi.fn(),
            createIntent: vi.fn(),
            fillOffer: vi.fn(),
            cancelIntent: vi.fn(),
        });

        renderWithProviders(<TradeBox />);

        expect(screen.getByText('Enter Amount')).toBeInTheDocument();
    });

    it('renders pay and receive inputs', () => {
        renderWithProviders(<TradeBox />);

        expect(screen.getByText('You Pay')).toBeInTheDocument();
        expect(screen.getByText('You Receive')).toBeInTheDocument();
    });

    it('shows info boxes', () => {
        renderWithProviders(<TradeBox />);

        expect(screen.getByText('Minimum Received')).toBeInTheDocument();
        expect(screen.getByText('Price Impact')).toBeInTheDocument();
        expect(screen.getByText('Trading Fee')).toBeInTheDocument();
        expect(screen.getByText('Route')).toBeInTheDocument();
    });
});
