'use client';

import { SwapCard } from "@/features/swap/SwapCard";
import { PriceChart } from "@/features/market/PriceChart";

export default function SwapPage() {
    return (
        <div className="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto items-start justify-center pt-8">
            <div className="w-full lg:w-2/3 h-[500px] hidden lg:block">
                <PriceChart />
            </div>
            <div className="w-full lg:w-1/3">
                <SwapCard />
            </div>
        </div>
    );
}
