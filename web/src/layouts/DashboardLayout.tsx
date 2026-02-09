'use client';

import * as React from 'react';
import { TopNav } from '@/components/layout/TopNav';
import { Ticker } from '@/components/layout/Ticker';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <div className="min-h-screen bg-[#0b0b0b] text-white flex flex-col overflow-hidden">
            {/* Fixed Header Stack */}
            <TopNav />
            <Ticker />

            {/* Main Grid Area - Starts below the fixed headers (16 + 12 = 28 units = 112px roughly) */}
            <main className="flex-1 flex mt-28 overflow-hidden h-[calc(100vh-112px)]">
                {children}
            </main>
        </div>
    );
}
