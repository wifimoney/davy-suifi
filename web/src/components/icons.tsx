import { TokenSUI, TokenUSDC, TokenBTC, TokenSOL } from '@web3icons/react';

export const SuiIcon = ({ className }: { className?: string }) => (
    <TokenSUI className={className} variant="mono" />
);

export const UsdcIcon = ({ className }: { className?: string }) => (
    <TokenUSDC className={className} variant="mono" />
);

export const BtcIcon = ({ className }: { className?: string }) => (
    <TokenBTC className={className} variant="mono" />
);

export const SolIcon = ({ className }: { className?: string }) => (
    <TokenSOL className={className} variant="mono" />
);
