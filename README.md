# AutoCorp V2

Production-grade category-agnostic autonomous micro-enterprise protocol. Supports zero legacy code and strict parameter enforcement.

## System Architecture

```text
    +-------------------+        Deploys        +---------------------+
    |                   | --------------------> |                     |
    |  AutoCorpFactory  |                       |   BusinessEntity    |
    |                   | <-------------------- |                     |
    +-------------------+      Tracks by ID     +---------------------+
           |   ^                                       |   ^
           |   |                                       |   |
      Owns |   | Administer                      Holds |   | Deposits/Withdrawals
           v   |                                       v   |
    +-------------------+                       +---------------------+
    |                   |                       |                     |
    |      Founder      |---------------------->|      MockUSDC       |
    |                   |   Creates Trades      |      (Escrow)       |
    +-------------------+                       +---------------------+
```

## Setup & Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment template:
   ```bash
   cp .env.example .env
   ```
   *Fill in your `PRIVATE_KEY`, `SEPOLIA_RPC_URL`, and `ETHERSCAN_API_KEY`.*

## Compilation

```bash
npx hardhat compile
```

## Testing

Tests run using Hardhat local network and ethers v6.
```bash
npx hardhat test
```

## Deployment

Deploy directly to Ethereum Sepolia network. This will deploy MockUSDC, AutoCorpFactory, and a demo BusinessEntity.

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Deployment saves addresses in `deployment.json`.

## Etherscan Verification

To verify the deployed contracts on Etherscan, run:
```bash
npx hardhat verify --network sepolia <DEPLOYED_CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```
*Note: Make sure your `ETHERSCAN_API_KEY` is set in `.env`.*
