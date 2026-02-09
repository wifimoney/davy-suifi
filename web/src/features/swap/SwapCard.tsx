'use client';

import { useState, useEffect } from 'react';
import { ArrowDown, Settings, Info, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { SuiIcon, UsdcIcon } from '@/components/icons';
import { DavyRouter, OfferCache, FillPolicy, OfferStatus } from '@davy/router-reference';
import type { CachedIntent, CachedOffer } from '@davy/router-reference';

// Mock Oracle Data (Router Cache)
const MOCK_OFFERS: CachedOffer[] = [
    {
        offerId: '0xabc123...',
        maker: '0xmaker1...',
        offerAssetType: 'SUI',
        wantAssetType: 'USDC',
        initialAmount: 10_000_000_000n, // 10 SUI
        remainingAmount: 5_000_000_000n, // 5 SUI remaining
        minPrice: 1_500_000_000n, // 1.5 USDC/SUI
        maxPrice: 2_000_000_000n, // 2.0 USDC/SUI
        fillPolicy: FillPolicy.PartialAllowed,
        minFillAmount: 1_000_000_000n, // 1 SUI
        expiryTimestampMs: Date.now() + 3600_000,
        status: OfferStatus.PartiallyFilled,
        totalFilled: 5_000_000_000n,
        fillCount: 1,
    },
    {
        offerId: '0xdef456...',
        maker: '0xmaker2...',
        offerAssetType: 'SUI',
        wantAssetType: 'USDC',
        initialAmount: 20_000_000_000n, // 20 SUI
        remainingAmount: 20_000_000_000n, // 20 SUI full
        minPrice: 1_450_000_000n, // 1.45 USDC/SUI
        maxPrice: 1_900_000_000n, // 1.9 USDC/SUI
        fillPolicy: FillPolicy.FullOnly,
        minFillAmount: 20_000_000_000n, // Must take all 20
        expiryTimestampMs: Date.now() + 3600_000,
        status: OfferStatus.Created,
        totalFilled: 0n,
        fillCount: 0,
    },
];

export function SwapCard() {
    const [payAmount, setPayAmount] = useState<string>('');
    const [receiveAmount, setReceiveAmount] = useState<string>('');
    const [priceImpact, setPriceImpact] = useState<number>(0);
    const [route, setRoute] = useState<any>(null);
    const [isQuoting, setIsQuoting] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Settings
    const [slippage, setSlippage] = useState('0.5');
    const [deadline, setDeadline] = useState('10'); // minutes

    // Initialize Router
    const cache = new OfferCache();
    MOCK_OFFERS.forEach(o => cache.upsert(o));
    const router = new DavyRouter(cache);

    const handleQuote = async (amount: string) => {
        if (!amount || isNaN(parseFloat(amount))) {
            setRoute(null);
            setReceiveAmount('');
            return;
        }

        setIsQuoting(true);

        // Simulate network delay
        await new Promise(r => setTimeout(r, 500));

        try {
            const payAmountBig = BigInt(Math.floor(parseFloat(amount) * 1e9));

            // We want to Receive X for Pay Y. But router logic is usually "I want X, pay max Y" or "I pay Y, get min X".
            // The current router reference implementation `routeIntent` takes an intent which specifies `receiveAmount` (exact output) and `maxPayAmount`.
            // Let's adapt: The user inputs Pay Amount (SUI). We want to find the best Receive Amount (USDC).
            // Since the current router logic is `routeIntent` (Exact Output), we might need to iterate or approximate for Exact Input.
            // FOR DEMO: We will assume a price and reverse calculate, then verify with router.

            // Let's use the best market price from cache to estimate receive amount
            const bestPrice = 1.5; // From mock offers (1 SUI = 1.5 USDC)
            const estimatedReceive = parseFloat(amount) * bestPrice;
            const receiveBig = BigInt(Math.floor(estimatedReceive * 1e9));

            // Now constructs an intent to buy `estimatedReceive` USDC for `payAmountBig` SUI
            // Wait, the router handles `SUI` -> `USDC` swap? 
            // Existing mock data: offerAsset=SUI, wantAsset=USDC. 
            // Maker offers SUI, wants USDC. 
            // Taker (User) wants SUI, pays USDC.
            // So the current mock data supports BUYING SUI with USDC.

            // Let's flip it for the UI: User PAY USDC -> RECEIVE SUI.
            // User inputs USDC amount.

            // Log for debugging (and to use variables)
            console.log('Quoting for:', { payAmountBig, receiveBig, priceImpact });

            const intent: CachedIntent = {
                intentId: '0xquote...',
                creator: '0xuser...',
                receiveAssetType: 'SUI',
                payAssetType: 'USDC',
                receiveAmount: BigInt(Math.floor(parseFloat(amount) / 1.5 * 1e9)), // Trying to buy SUI
                maxPayAmount: BigInt(Math.floor(parseFloat(amount) * 1e9)), // Max pay is input
                escrowedAmount: BigInt(Math.floor(parseFloat(amount) * 1e9)),
                minPrice: 1_000_000_000n,
                maxPrice: 2_000_000_000n,
                expiryTimestampMs: Date.now() + 60000,
                status: 'pending'
            };

            const decision = await router.routeIntent(intent, Date.now());

            if (decision.source !== 'skip') {
                setRoute(decision);
                // If we input Pay Amount, the router told us if it's possible.
                // Effectively we are getting `fillAmount` SUI for `paymentAmount` USDC.
                setReceiveAmount((Number(decision.fillAmount) / 1e9).toFixed(4));
                setPriceImpact(0.1); // Mock
            } else {
                setRoute(null);
            }

        } catch (e) {
            console.error(e);
        } finally {
            setIsQuoting(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (payAmount) handleQuote(payAmount);
        }, 500);
        return () => clearTimeout(timer);
    }, [payAmount]);

    return (
        <Card className="w-full max-w-md mx-auto border-border bg-card/50 backdrop-blur-md shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xl font-bold">Swap</CardTitle>
                <div className="flex gap-2 text-muted-foreground">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleQuote(payAmount)}>
                        <RefreshCcw className={`h-4 w-4 ${isQuoting ? 'animate-spin' : ''}`} />
                    </Button>
                    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Settings className="h-4 w-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Transaction Settings</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Slippage Tolerance</label>
                                    <div className="flex gap-2">
                                        {['0.1', '0.5', '1.0'].map((val) => (
                                            <Button
                                                key={val}
                                                variant={slippage === val ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => setSlippage(val)}
                                            >
                                                {val}%
                                            </Button>
                                        ))}
                                        <div className="relative flex-1">
                                            <Input
                                                value={slippage}
                                                onChange={(e) => setSlippage(e.target.value)}
                                                className="h-9 pr-8 text-right"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">%</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Transaction Deadline</label>
                                    <div className="relative">
                                        <Input
                                            value={deadline}
                                            onChange={(e) => setDeadline(e.target.value)}
                                            className="h-9 pr-12 text-right"
                                        />
                                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">min</span>
                                    </div>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Pay Input */}
                <div className="space-y-2 bg-secondary/50 p-4 rounded-xl border border-transparent hover:border-primary/20 transition-colors">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span>You Pay</span>
                        <span>Balance: 1,000.00</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Input
                            type="number"
                            placeholder="0.00"
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            className="border-none bg-transparent text-2xl font-bold p-0 shadow-none focus-visible:ring-0 h-auto placeholder:text-muted-foreground/50"
                        />
                        <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-full border border-border shadow-sm shrink-0">
                            <UsdcIcon className="w-6 h-6" />
                            <span className="font-semibold">USDC</span>
                        </div>
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                        ≈ ${payAmount || '0.00'}
                    </div>
                </div>

                {/* Switcher */}
                <div className="relative h-4 flex items-center justify-center z-10">
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-8 w-8 rounded-full border border-border shadow-sm absolute hover:scale-110 transition-transform"
                    >
                        <ArrowDown className="h-4 w-4" />
                    </Button>
                </div>

                {/* Receive Input */}
                <div className="space-y-2 bg-secondary/50 p-4 rounded-xl border border-transparent hover:border-primary/20 transition-colors">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span>You Receive</span>
                        <span>Balance: 0.00</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Input
                            type="text"
                            placeholder="0.00"
                            value={receiveAmount}
                            readOnly
                            className="border-none bg-transparent text-2xl font-bold p-0 shadow-none focus-visible:ring-0 h-auto placeholder:text-muted-foreground/50 text-blue-500"
                        />
                        <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-full border border-border shadow-sm shrink-0">
                            <SuiIcon className="w-6 h-6" />
                            <span className="font-semibold">SUI</span>
                        </div>
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                        {route && route.effectivePrice ? `1 SUI ≈ ${(Number(route?.effectivePrice) / 1e9).toFixed(4)} USDC` : '-'}
                    </div>
                </div>

                {/* Route Info */}
                {route && (
                    <div className="bg-muted/30 p-3 rounded-lg text-sm space-y-2 border border-border/50">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground flex items-center gap-1">
                                Route <Info className="w-3 h-3" />
                            </span>
                            <span className="font-medium flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                {route.source.toUpperCase()}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Price Impact</span>
                            <span className="text-green-500 font-medium">~0.05%</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Network Fee</span>
                            <span className="font-medium">~0.01 SUI</span>
                        </div>
                    </div>
                )}

                <Button
                    className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
                    disabled={!route || isQuoting}
                >
                    {isQuoting ? 'Fetching Best Price...' : !payAmount ? 'Enter Amount' : 'Swap'}
                </Button>
            </CardContent>
        </Card>
    );
}
