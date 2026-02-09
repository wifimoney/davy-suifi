'use client';

import * as React from 'react';
import { AssetSidePanel } from '@/components/layout/AssetSidePanel';
import { MainChart } from '@/components/layout/MainChart';
import { TradeBox } from '@/components/layout/TradeBox';

export default function DashboardPage() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left Panel: Market Stats */}
      <AssetSidePanel />

      {/* Center Panel: Chart Area */}
      <MainChart />

      {/* Right Panel: Trade Execution */}
      <TradeBox />
    </div>
  );
}
