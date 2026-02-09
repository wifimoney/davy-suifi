# Davy Protocol Monorepo

This repository contains the full stack implementation of the Davy Protocol on Sui.

## Structure

- `davy/`: Sui Move smart contracts and tests.
- `dashboard/`: React + Vite frontend application.

## Getting Started

### Prerequisites

- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install)
- [Bun](https://bun.sh/) (or Node.js + pnpm/yarn/npm)

### Development

Install dependencies:
```bash
bun install
```

Start the frontend development server:
```bash
bun run dev
```

Build both contracts and frontend:
```bash
bun run build
```

Run tests (Move):
```bash
bun run test
```

Deploy contracts (Testnet/Mainnet):
```bash
bun run deploy:sui
```

## Next Steps for Frontend Integration

1.  **Fund Testnet Address:** Use the [Sui Faucet](https://faucet.sui.io) or ask for funds in Discord for address `0x248423bec05afcee2fd94ce8c6c6a37a2c57881ca7577410b1123d711af02b2b`.
2.  **Deploy Contracts:**
    ```bash
    cd davy && sui client publish --gas-budget 500000000
    ```
3.  **Update Config:**
    Copy the `PackageID` and `AdminCap` ID from the deployment output into `dashboard/src/config.ts`.
4.  **Run Dashboard:**
    ```bash
    npm run dev
    ```
    This will launch the dashboard with the integrated **Router Playground**.

