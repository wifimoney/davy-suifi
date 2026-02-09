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
