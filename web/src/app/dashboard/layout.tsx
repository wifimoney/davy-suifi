'use client';

import * as React from 'react';
import { DashboardLayout } from "@/layouts/DashboardLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <DashboardLayout>
            {children}
        </DashboardLayout>
    );
}
