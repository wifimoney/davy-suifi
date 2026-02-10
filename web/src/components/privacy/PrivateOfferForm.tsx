'use client';

import * as React from 'react';
import {
    Plus,
    X,
    Users,
    Copy,
    CheckCircle2,
    AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface PrivateOfferFormProps {
    allowlist: string[];
    onAllowlistChange: (addresses: string[]) => void;
    className?: string;
}

export function PrivateOfferForm({
    allowlist,
    onAllowlistChange,
    className,
}: PrivateOfferFormProps) {
    const [newAddress, setNewAddress] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);

    const isValidSuiAddress = (addr: string): boolean => {
        // Sui addresses: 0x + 64 hex chars
        return /^0x[a-fA-F0-9]{64}$/.test(addr);
    };

    const addAddress = () => {
        setError(null);
        const trimmed = newAddress.trim();

        if (!trimmed) return;

        if (!isValidSuiAddress(trimmed)) {
            setError('Invalid Sui address (must be 0x + 64 hex characters)');
            return;
        }

        if (allowlist.includes(trimmed)) {
            setError('Address already in allowlist');
            return;
        }

        if (allowlist.length >= 50) {
            setError('Maximum 50 addresses per allowlist');
            return;
        }

        onAllowlistChange([...allowlist, trimmed]);
        setNewAddress('');
    };

    const removeAddress = (addr: string) => {
        onAllowlistChange(allowlist.filter((a) => a !== addr));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addAddress();
        }
    };

    const copyAllowlist = () => {
        navigator.clipboard.writeText(allowlist.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={cn('space-y-4 rounded-xl bg-[#0b0b0b] border border-cyan-900/20 p-4 shadow-2xl', className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-cyan-400" />
                    <span className="text-sm font-medium text-zinc-200">
                        Allowlisted Counterparties
                    </span>
                    <span className="text-xs text-zinc-500">
                        ({allowlist.length}/50)
                    </span>
                </div>

                {allowlist.length > 0 && (
                    <button
                        type="button"
                        onClick={copyAllowlist}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        {copied ? (
                            <CheckCircle2 className="h-3 w-3 text-green-400" />
                        ) : (
                            <Copy className="h-3 w-3" />
                        )}
                        {copied ? 'Copied' : 'Copy all'}
                    </button>
                )}
            </div>

            {/* Input */}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newAddress}
                    onChange={(e) => {
                        setNewAddress(e.target.value);
                        setError(null);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="0x... (Sui address)"
                    className={cn(
                        'flex-1 rounded-lg bg-[#111111] border px-3 py-2 transition-all',
                        'text-sm text-zinc-200 placeholder:text-zinc-700',
                        'focus:outline-none focus:ring-1 focus:ring-cyan-500/50',
                        error ? 'border-red-500/50' : 'border-zinc-800',
                    )}
                />
                <Button
                    type="button"
                    onClick={addAddress}
                    size="sm"
                    className="bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 px-3 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-1.5 text-xs text-red-400 animate-in fade-in slide-in-from-top-1">
                    <AlertTriangle className="h-3 w-3" />
                    {error}
                </div>
            )}

            {/* Address list */}
            {allowlist.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                    {allowlist.map((addr) => (
                        <div
                            key={addr}
                            className={cn(
                                'flex items-center justify-between',
                                'rounded-md bg-[#111111] border border-zinc-800/50',
                                'px-3 py-2 group hover:border-cyan-900/40 transition-colors',
                            )}
                        >
                            <span className="text-xs text-zinc-400 font-mono tracking-tight">
                                {addr.slice(0, 10)}...{addr.slice(-8)}
                            </span>
                            <button
                                type="button"
                                onClick={() => removeAddress(addr)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 rounded-lg border border-dashed border-zinc-800/50 text-zinc-600 text-xs">
                    Add addresses to grant access to your offer terms
                </div>
            )}

            {/* Info */}
            <div className="flex gap-2 p-3 rounded-lg bg-cyan-950/10 border border-cyan-900/20">
                <AlertTriangle className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-cyan-300/70 leading-relaxed">
                    Only addresses on this list can decrypt your offer's price bounds
                    and terms. The offer itself remains publicly visible.
                    You can manage this allowlist after creation.
                </p>
            </div>
        </div>
    );
}
