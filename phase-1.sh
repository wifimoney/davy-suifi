#!/bin/bash
# Phase 1: Project Initialization for davy-suifi

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting Phase 1: Project Initialization...${NC}"

# 1. Initialize Git repository if not already present
if [ ! -d ".git" ]; then
    echo -e "${GREEN}Initializing Git repository...${NC}"
    git init
else
    echo -e "${BLUE}Git repository already initialized.${NC}"
fi

# 2. Setup directory structure
echo -e "${GREEN}Creating project structure...${NC}"
mkdir -p contract
mkdir -p dashboard

# 3. Initialize Sui Move project
if [ ! -f "contract/Move.toml" ]; then
    echo -e "${GREEN}Initializing Sui Move project in /contract...${NC}"
    cd contract
    # Check if sui is installed
    if ! command -v sui &> /dev/null; then
        echo "Error: sui CLI is not installed. Please install it first."
        exit 1
    fi
    sui move new davy_suifi
    # Move contents up to /contract/ if sui move new created a nested directory
    if [ -d "davy_suifi" ]; then
        cp -r davy_suifi/* .
        rm -rf davy_suifi
    fi
    cd ..
else
    echo -e "${BLUE}Sui Move project already exists in /contract.${NC}"
fi

# 4. Initialize Dashboard (Vite + React + TS + Tailwind)
if [ ! -f "dashboard/package.json" ]; then
    echo -e "${GREEN}Initializing Vite dashboard in /dashboard...${NC}"
    # Use bun create vite for speed, it should be non-interactive with these arguments
    bun create vite dashboard --template react-ts
    
    cd dashboard
    echo -e "${GREEN}Installing base dependencies with Bun...${NC}"
    bun install
    
    echo -e "${GREEN}Adding Sui and UI dependencies...${NC}"
    bun add @mysten/sui @mysten/dapp-kit @tanstack/react-query lucide-react clsx tailwind-merge
    bun add -d tailwindcss postcss autoprefixer
    
    # Initialize Tailwind
    echo -e "${GREEN}Initializing Tailwind CSS...${NC}"
    bun x tailwindcss init -p
    
    # Create a basic CSS file if it doesn't exist
    mkdir -p src
    cat > src/index.css <<EOF
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
EOF
    cd ..
else
    echo -e "${BLUE}Dashboard project already exists in /dashboard.${NC}"
fi

echo -e "${GREEN}Phase 1: Initialization complete!${NC}"
echo -e "Next steps:"
echo -e "1. ${BLUE}cd contract${NC} and start writing your Move modules in /sources"
echo -e "2. ${BLUE}cd dashboard${NC} and run ${BLUE}bun run dev${NC} to start the UI"
