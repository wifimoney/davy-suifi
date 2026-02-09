'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@mysten/dapp-kit';
import {
    Menu,
    Search,
    Bell,
    Settings,
    ChevronDown,
    ExternalLink,
    ShieldCheck,
    Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function TopNav() {
    const pathname = usePathname();

    const navLinks = [
        {
            label: 'Trade',
            href: '/swap',
            subLinks: [
                { label: 'Swap', href: '/swap' },
                { label: 'Limit Order', href: '/market' },
                { label: 'DCA', href: '/market' },
            ]
        },
        { label: 'Pro', href: '/market' },
        {
            label: 'Earn',
            href: '#',
            subLinks: [
                { label: 'Pools', href: '#' },
                { label: 'Vaults', href: '#' },
            ]
        },
    ];

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-[#0b0b0b] border-b border-white/5 z-50 flex items-center justify-between px-6">
            {/* Left section: Logo + Nav */}
            <div className="flex items-center gap-8">
                <Link href="/dashboard" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/logo.png"
                            alt="Davy Logo"
                            className="w-full h-full object-contain pixelated group-hover:scale-110 transition-transform duration-500"
                        />
                    </div>
                    <span className="text-xl font-bold font-sans tracking-tightest italic text-white hidden sm:block">DAVY</span>
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    {navLinks.map((link) => (
                        <div key={link.label}>
                            {link.subLinks ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className={cn(
                                            "flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5",
                                            pathname.startsWith(link.href) ? "text-cyan-400" : "text-gray-400"
                                        )}>
                                            {link.label}
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="bg-[#151515] border-white/10 text-white">
                                        {link.subLinks.map((sub) => (
                                            <DropdownMenuItem key={sub.label} asChild>
                                                <Link href={sub.href} className="w-full cursor-pointer">
                                                    {sub.label}
                                                </Link>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <Link
                                    href={link.href}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5",
                                        pathname === link.href ? "text-cyan-400" : "text-gray-400"
                                    )}
                                >
                                    {link.label}
                                </Link>
                            )}
                        </div>
                    ))}
                </nav>
            </div>

            {/* Right section: Wallet + Actions */}
            <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center bg-white/5 rounded-full px-3 py-1.5 border border-white/5 gap-2">
                    <Search className="w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search Pool/Token"
                        className="bg-transparent border-none outline-none text-xs w-32 focus:w-48 transition-all text-white placeholder:text-gray-600"
                    />
                </div>

                <div className="flex items-center gap-2 ml-2">
                    <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-white/5 h-9 w-9">
                        <Bell className="w-5 h-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-white/5 h-9 w-9">
                        <Settings className="w-5 h-5" />
                    </Button>
                </div>

                <div className="border-l border-white/10 h-6 mx-2 hidden sm:block" />

                <ConnectButton />
            </div>
        </header>
    );
}
