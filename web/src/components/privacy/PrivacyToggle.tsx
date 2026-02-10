'use client';

import * as React from 'react';
import {
    Shield,
    ShieldOff,
    Lock,
    EyeOff,
    Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PrivacyToggleProps {
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    mode: 'intent' | 'offer';
    disabled?: boolean;
    className?: string;
}

export function PrivacyToggle({
    enabled,
    onToggle,
    mode,
    disabled = false,
    className,
}: PrivacyToggleProps) {
    const [showInfo, setShowInfo] = React.useState(false);

    const label = mode === 'intent' ? 'Encrypted Intent' : 'Private Offer';
    const description = mode === 'intent'
        ? 'Hide your price bounds from MEV bots. Only authorized executors can decrypt.'
        : 'Restrict offer visibility to approved counterparties only.';

    return (
        <div className={cn('space-y-2', className)}>
            {/* Toggle row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {enabled ? (
                        <Shield className="h-4 w-4 text-cyan-400" />
                    ) : (
                        <ShieldOff className="h-4 w-4 text-zinc-500" />
                    )}
                    <span className="text-sm font-medium text-zinc-200">
                        {label}
                    </span>
                    <button
                        type="button"
                        onClick={() => setShowInfo(!showInfo)}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <Info className="h-3.5 w-3.5" />
                    </button>
                </div>

                {/* Toggle switch */}
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={disabled}
                    onClick={() => onToggle(!enabled)}
                    className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer',
                        'rounded-full border-2 border-transparent transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2',
                        'focus-visible:ring-cyan-500 focus-visible:ring-offset-2',
                        'focus-visible:ring-offset-[#0b0b0b]',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        enabled ? 'bg-cyan-600' : 'bg-zinc-700',
                    )}
                >
                    <span
                        className={cn(
                            'pointer-events-none inline-block h-5 w-5 transform',
                            'rounded-full bg-white shadow-lg ring-0 transition-transform',
                            enabled ? 'translate-x-5' : 'translate-x-0',
                        )}
                    />
                </button>
            </div>

            {/* Info panel */}
            {showInfo && (
                <div className="rounded-lg bg-[#1a1a1a] border border-zinc-800 p-3 shadow-xl">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                        {description}
                    </p>
                    {mode === 'intent' && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-cyan-400/70">
                            <Lock className="h-3 w-3" />
                            <span>Powered by Seal Protocol (threshold encryption)</span>
                        </div>
                    )}
                    {mode === 'offer' && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-cyan-400/70">
                            <EyeOff className="h-3 w-3" />
                            <span>Seal + Walrus (encrypted, decentralized storage)</span>
                        </div>
                    )}
                </div>
            )}

            {/* Active state indicator */}
            {enabled && (
                <div className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2',
                    'bg-cyan-950/30 border border-cyan-800/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]',
                )}>
                    <Lock className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="text-xs text-cyan-300">
                        {mode === 'intent'
                            ? 'Price bounds will be encrypted — MEV protected'
                            : 'Only allowlisted addresses can view terms'
                        }
                    </span>
                </div>
            )}
        </div>
    );
}
