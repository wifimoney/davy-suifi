'use client';

import { PriceChart } from "@/features/market/PriceChart";
import { OrderList } from "@/features/orders/OrderList";

export default function MarketPage() {
    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-6">
            <div className="flex-1">
                <PriceChart />
            </div>
            <div className="h-1/3">
                <OrderList />
            </div>
        </div>
    );
}
