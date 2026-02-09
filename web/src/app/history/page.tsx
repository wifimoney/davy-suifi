'use client';

import { OrderList } from "@/features/orders/OrderList";

export default function HistoryPage() {
    return (
        <div className="max-w-4xl mx-auto pt-8">
            <OrderList />
        </div>
    );
}
