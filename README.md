# 🤖 AutoCorp v2.0
> **The Autonomous Micro-Enterprise Protocol: Bridging the Gap Between Retail Savings and High-Yield Arbitrage.**

![Demo Ready](https://img.shields.io/badge/Status-Demo%20Ready-22C55E?style=for-the-badge&logo=checkmarx&logoColor=white)
![Demo Mode](https://img.shields.io/badge/Demo%20Mode-Enabled-F59E0B?style=for-the-badge&logo=statuspage&logoColor=white)
![Hackathon](https://img.shields.io/badge/Built%20For-Hackathon%202026-FF0080?style=for-the-badge&logo=devpost&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-white?style=for-the-badge&logo=opensourceinitiative&logoColor=black)

---

### 🚀 Core Stack & Protocol
![Ethereum Sepolia](https://img.shields.io/badge/Blockchain-Ethereum%20Sepolia-627EEA?style=for-the-badge&logo=ethereum&logoColor=white)
![Gemini AI](https://img.shields.io/badge/AI-Gemini%201.5%20Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)
![ReAct](https://img.shields.io/badge/Reasoning-ReAct%20Framework-F59E0B?style=for-the-badge&logo=google-gemini&logoColor=white)
![A2A Protocol](https://img.shields.io/badge/Protocol-A2A%20Agent--to--Agent-FF6B35?style=for-the-badge&logo=apache-kafka&logoColor=white)
![MCP](https://img.shields.io/badge/Tools-Model%20Context%20Protocol-7C3AED?style=for-the-badge&logo=openai&logoColor=white)
![SSE](https://img.shields.io/badge/Realtime-Server%20Sent%20Events-0EA5E9?style=for-the-badge&logo=socket.io&logoColor=white)

### ⛓️ Blockchain Infrastructure
![Sepolia](https://img.shields.io/badge/Network-Sepolia%20Testnet-627EEA?style=for-the-badge&logo=ethereum&logoColor=white)
![Chain ID](https://img.shields.io/badge/Chain%20ID-11155111-627EEA?style=for-the-badge&logo=ethereum&logoColor=white)
![ERC20](https://img.shields.io/badge/Token-ERC--20%20MockUSDC-2775CA?style=for-the-badge&logo=ethereum&logoColor=white)
![Hardhat](https://img.shields.io/badge/Dev%20Tools-Hardhat-FFF100?style=for-the-badge&logo=hardhat&logoColor=black)
![ethers.js](https://img.shields.io/badge/Web3-ethers.js%20v6-2535A0?style=for-the-badge&logo=ethereum&logoColor=white)
![Etherscan](https://img.shields.io/badge/Explorer-Sepolia%20Etherscan-21325B?style=for-the-badge&logo=etherscan&logoColor=white)

---

## 🚩 Problem Statement
India has 63 crore lower-middle-class individuals with idle savings earning 3–4% annually in fixed deposits. Simultaneously, high-yield arbitrage opportunities exist across crypto exchanges, cloud compute markets, and SaaS licensing — generating **15–130% annualised returns** for those with the infrastructure to exploit them.

The gap between these two realities exists because exploiting arbitrage requires:
- **24/7 market monitoring** — price windows open and close in seconds.
- **Millisecond execution** — simultaneous multi-leg trade placement.
- **Technical infrastructure** — exchange APIs, blockchain wallets, automated settlement.
- **Domain expertise** — recognising genuine opportunities vs. data anomalies.

These capabilities are available only to institutional traders and quant funds. **AutoCorp democratises them** for retail investors through autonomous AI agents operating on a trustless blockchain backbone.

---

## 🛠️ What AutoCorp Does
AutoCorp is a general-purpose autonomous business engine. The user experience is zero-friction:
1. **Selects a business model** (arbitrage category).
2. **Configures budget, duration, and profit target**.
3. **Deposits capital**.

AutoCorp's **Gemini-powered agent swarm** then:
- **Generates a legally-structured business charter** using AI.
- **Deploys an isolated smart contract escrow** on Ethereum Sepolia.
- **Monitors live markets** via real exchange APIs.
- **Executes trades autonomously** using ReAct reasoning.
- **Records every action immutably** on-chain.
- **Dissolves the business** at the deadline and returns principal + profit.

**The investor does nothing after step 3. The system does everything.**

---

## 🧠 Why Agentic AI + Blockchain
*This section defines the intellectual core and technical differentiator of the AutoCorp protocol.*

### Why Agentic AI Specifically
Traditional automation uses rule-based scripts — *if price < threshold, execute buy*. This breaks in the real world because markets have edge cases that no finite ruleset can anticipate.

| Situation | Script Response | Agent Response (AutoCorp) |
| :--- | :--- | :--- |
| **Price drops 18% in one tick** | BUY (threshold exceeded) | **SKIP_ANOMALY** — 18% single-tick drop is data feed error. |
| **Budget covers cost exactly** | BUY | **WAIT** — no buffer left for transport/gas fees. |
| **Grade C commodity available** | BUY (price is right) | **REJECT_QUALITY** — Local buyers discount Grade C by ₹12/kg, eliminating margin. |
| **Day 5 of 5, offer below margin** | WAIT (below threshold) | **CUT_LOSS_SELL** — Spoilage tomorrow = 100% loss vs 4% loss now. |
| **Funding rate dropped to 0.01%** | HOLD (still positive) | **EXIT_POSITION** — Rate below cost of capital, exit now. |

**Scripts don't make judgment calls. Agents do.**

### Why Blockchain Specifically
The central problem of an autonomous money-managing system is **trust**. AutoCorp uses Ethereum Sepolia to solve the "Trust Problem" across four vectors:

1. **Immutable Charter**: The SHA-256 hash of the business charter is stored in the `BusinessEntity` contract at deployment. Any modification to the logic after deployment produces a different hash — mathematically detectable by anyone.
2. **Trustless Escrow**: The `dissolve()` function in Solidity can only send funds to the investor address set at deployment. The platform "Founder" can trigger trades but **cannot redirect funds to itself**.
3. **Immutable Trade Ledger**: Every `openTrade()` and `closeTrade()` call emits a blockchain event with the trade ID, asset, cost, and revenue. These are permanently stored and verifiable on Etherscan.
4. **Automatic Dissolution**: `dissolve()` is called at the deadline. It computes final P&L, subtracts the platform fee, and executes USDC transfers in a single atomic transaction. **Solidity code executes the payout, not a human.**

---

## 💼 Business Categories

![Crypto Arb](https://img.shields.io/badge/Category%201-Crypto%20Arbitrage-F59E0B?style=for-the-badge&logo=bitcoin&logoColor=white)
![GPU Compute](https://img.shields.io/badge/Category%202-GPU%20Compute%20Arb-3B82F6?style=for-the-badge&logo=nvidia&logoColor=white)
![SaaS Arb](https://img.shields.io/badge/Category%205-SaaS%20Licence%20Arb-8B5CF6?style=for-the-badge&logo=stripe&logoColor=white)

### Category 1 — Crypto & Token Arbitrage (`1_crypto`)
Isolated order books create price spreads. AutoCorp executes simultaneous multi-leg trades.
- **Sub-strategies**: Cross-Exchange Arbitrage (Binance vs CoinDCX), Funding Rate Arbitrage, Triangular Arbitrage.
- **Typical returns**: 10–40% annualised return.

### Category 2 — Cloud Compute & GPU Arbitrage (`2_compute`)
GPU prices are volatile; off-peak supply trades 40–60% below peak demand.
- **Sub-strategies**: GPU Spot Resale (Vast.ai → RunPod), API Credits Bulk Resale.
- **Typical returns**: 40–130% per 48-hour GPU cycle.

### Category 3 — SaaS & Licence Arbitrage (`5_saas`)
Enterprise annual bulk discounts vs monthly retail demand.
- **Sub-strategies**: Annual Licence Resale (Notion/Figma seats), Domain Expiry Arbitrage.
- **Typical returns**: 30–80% annually.

---

## 🏗️ System Architecture

![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-000000?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/MasterAgent-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Agents-Python%203.11-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/Agents-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Solidity](https://img.shields.io/badge/Contracts-Solidity%200.8.19-363636?style=for-the-badge&logo=solidity&logoColor=white)
![Node.js](https://img.shields.io/badge/Logistics-Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        USER (Browser)                               │
│              Next.js 16 · Chatbot + 5-Panel Dashboard               │
│              Server-Sent Events (SSE) ← all agents                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────────────────┐
│                    MASTER AGENT :8787                                │
│              TypeScript · Express · ethers.js                       │
│    Founder Agent + Accountant Agent + Business Orchestration        │
│    Calls: Charter Generator · AutoCorpFactory contract              │
└───┬──────────┬──────────┬──────────┬──────────┬────────────────────┘
    │          │          │          │          │    A2A Protocol
    ▼          ▼          ▼          ▼          ▼    (HTTP POST)
:8009      :8002      :8003      :8004      :8006
Charter    Price      Procure-   Sales      Account-
Generator  Monitor    ment       Agent      ant
Python     Python     Python     Python     Python
FastAPI    FastAPI    FastAPI    FastAPI    FastAPI
Gemini     Gemini     Gemini     Gemini
ReAct      ReAct      ReAct      ReAct
    │          │          │          │
    │          ▼          ▼          ▼
    │       :3001 Mock API Server (Node.js)
    │       Simulates: Binance · CoinDCX · Vast.ai · Stripe
    │
    ▼
:3002 Logistics Agent (Node.js · Express)
Digital delivery handler
    │
    ▼
Ethereum Sepolia (Chain 11155111)
├── MockUSDC.sol        — ERC-20 test token
├── AutoCorpFactory.sol — deploys BusinessEntity per user
└── BusinessEntity.sol  — escrow · trade ledger · auto-dissolve
```

### 🛰️ Service Port Mapping
![MasterAgent](https://img.shields.io/badge/MasterAgent-:8787-8B5CF6?style=flat-square&logo=express&logoColor=white)
![Charter Gen](https://img.shields.io/badge/Charter%20Gen-:8009-4285F4?style=flat-square&logo=google&logoColor=white)
![Price Monitor](https://img.shields.io/badge/Price%20Monitor-:8002-3B82F6?style=flat-square&logo=fastapi&logoColor=white)
![Procurement](https://img.shields.io/badge/Procurement-:8003-10B981?style=flat-square&logo=fastapi&logoColor=white)
![Sales](https://img.shields.io/badge/Sales-:8004-F59E0B?style=flat-square&logo=fastapi&logoColor=white)
![Accountant](https://img.shields.io/badge/Accountant-:8006-EF4444?style=flat-square&logo=fastapi&logoColor=white)
![Logistics](https://img.shields.io/badge/Logistics-:3002-06B6D4?style=flat-square&logo=node.js&logoColor=white)
![Mock API](https://img.shields.io/badge/Mock%20API-:3001-6B7280?style=flat-square&logo=node.js&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-:3000-000000?style=flat-square&logo=next.js&logoColor=white)

### 🛠️ Developer Internals
![Recharts](https://img.shields.io/badge/Charts-Recharts-22D3EE?style=flat-square&logo=react&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Animation-Framer%20Motion-FF0055?style=flat-square&logo=framer&logoColor=white)
![Tailwind](https://img.shields.io/badge/Styling-Tailwind%20CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![asyncio](https://img.shields.io/badge/Async-asyncio-3776AB?style=flat-square&logo=python&logoColor=white)
![Web3.py](https://img.shields.io/badge/Blockchain-Web3.py-F16822?style=flat-square&logo=python&logoColor=white)
![httpx](https://img.shields.io/badge/HTTP-httpx-009688?style=flat-square&logo=python&logoColor=white)
![Pydantic](https://img.shields.io/badge/Validation-Pydantic%20v2-E92063?style=flat-square&logo=python&logoColor=white)
![uvicorn](https://img.shields.io/badge/Server-Uvicorn-499848?style=flat-square&logo=gunicorn&logoColor=white)

---

## 🤖 Agent Specifications

### Founder Agent (MasterAgent :8787)
- **Framework**: Express.js + ethers.js v6
- **Role**: Orchestrates the entire business lifecycle. Calls the Charter Generator, deploys `BusinessEntity` on Sepolia, configures the agent swarm.

### Charter Generator (:8009)
- **AI**: Gemini 1.5 Flash (Structured Output)
- **Role**: Converts natural language intent into a machine-executable charter JSON.

### Execution Agents (Python Swarm)
- **Price Monitor (:8002)**: ReAct loop detecting arbitrage.
- **Procurement Agent (:8003)**: Validates buy signals and executes purchases via `asyncio`.
- **Sales Agent (:8004)**: Dynamic repricing and asset liquidation.
- **Accountant Agent (:8006)**: Computes continuous P&L and synchronizes with the on-chain ledger.

---

## 🚀 Getting Started

1. **Install dependencies**:
   ```bash
   npm install && pip install -r requirements.txt
   ```
2. **Configure Environment**:
   ```bash
   cp .env.example .env # Fill in GEMINI_API_KEY and PRIVATE_KEY
   ```
3. **Launch Agent Swarm**:
   ```bash
   ./start-demo.bat
   ```

---
*AutoCorp: The Future of Autonomous Wealth.* 🚀
