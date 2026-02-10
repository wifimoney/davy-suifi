'use client';

import * as React from 'react';
import {
    Lock,
    Unlock,
    Shield,
    EyeOff,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type BadgeType = 'intent' | 'offer';
type BadgeStatus = 'encrypted' | 'decrypting' | 'decrypted' | 'unauthorized';

interface EncryptedBadgeProps {
    type: BadgeType;
    status?: BadgeStatus;
    className?: string;
    compact?: boolean;
}

export function EncryptedBadge({
    type,
    status = 'encrypted',
    className,
    compact = false,
}: EncryptedBadgeProps) {
    const configs: Record<BadgeStatus, {
        icon: React.ElementType;
        label: string;
        bg: string;
        text: string;
        border: string;
        animate?: boolean;
    }> = {
        encrypted: {
            icon: Lock,
            label: type === 'intent' ? 'MEV Protected' : 'Private',
            bg: 'bg-cyan-950/30',
            text: 'text-cyan-400',
            border: 'border-cyan-800/30',
        },
        decrypting: {
            icon: Loader2,
            label: 'Decrypting...',
            bg: 'bg-amber-950/30',
            text: 'text-amber-400',
            border: 'border-amber-800/30',
            animate: true,
        },
        decrypted: {
            icon: Unlock,
            label: 'Decrypted',
            bg: 'bg-green-950/30',
            text: 'text-green-400',
            border: 'border-green-800/30',
        },
        unauthorized: {
            icon: EyeOff,
            label: 'Access Denied',
            bg: 'bg-red-950/30',
            text: 'text-red-400',
            border: 'border-red-800/30',
        },
    };

    const config = configs[status];
    const Icon = config.icon;

    if (compact) {
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                    'text-[10px] font-medium border transition-all active:scale-95',
                    config.bg, config.text, config.border,
                    className,
                )}
                title={config.label}
            >
                <Icon className={cn('h-2.5 w-2.5', config.animate && 'animate-spin')} />
                {config.label}
            </span>
        );
    }

    return (
        <div
            className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1',
                'text-xs font-semibold border shadow-lg transition-all',
                config.bg, config.text, config.border,
                className,
            )}
        >
            <Icon className={cn('h-3.5 w-3.5', config.animate && 'animate-spin')} />
            <span className="tracking-tight">{config.label}</span>
        </div>
    );
}
