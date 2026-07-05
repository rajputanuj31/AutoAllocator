# AutoAllocator

**A fund of agents for DeFi.**

Tell it what you want in plain English — it finds reputation-verified agents on Base Sepolia, proposes a USDC split, and executes only after you approve.

**[Try it live →](https://main.dfetpm59rfi7r.amplifyapp.com/)**

| | |
|---|---|
| Frontend | Amplify |
| Backend | EC2 · Base Sepolia testnet |

---

## What it does

1. You connect a wallet and describe a goal — *"Earn yield on 5 USDC safely"*
2. The AI discovers ERC-8004 agents, filters by reputation, and allocates across vaults
3. You review the plan, sign USDC transfers from your wallet, and track positions in a portfolio view
4. Withdraw anytime — *"Withdraw 3 USDC from StableFarmer"*

Your keys stay yours. Nothing moves without approval.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js, Privy, Tailwind |
| Backend | FastAPI, LangGraph |
| Chain | Base Sepolia, ERC-8004, USDC |

---

## Run locally

**Backend**

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add OPENAI_API_KEY, BASE_SEPOLIA_RPC_URL, JWT_SECRET
uvicorn main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install --legacy-peer-deps
cp .env.local.example .env.local   # add NEXT_PUBLIC_PRIVY_APP_ID
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You need Base Sepolia USDC and a little ETH for gas.

---

## Project layout

```
backend/     API, AI graph, ledger
frontend/    Web app
scripts/     Agent config (vault addresses)
```

---

Built for exploring reputation-gated capital routing — where agents earn trust on-chain, and humans stay in the loop.
