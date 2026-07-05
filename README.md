# AutoAllocator

**Chat your goal. AI splits your USDC across on-chain DeFi agents — you approve every move.**

Tell it what you want in plain English. It finds reputation-verified agents on Base Sepolia, proposes an allocation, and only executes after you sign from your wallet.

**[Try it live →](https://main.dfetpm59rfi7r.amplifyapp.com/)**

| | |
|---|---|
| Frontend | [Amplify](https://main.dfetpm59rfi7r.amplifyapp.com/) |
| Backend | EC2 · Base Sepolia testnet |

---

## What it does

1. Connect your wallet and describe a goal — *"Earn yield on 5 USDC safely"*
2. AI discovers ERC-8004 agents, filters by reputation, and proposes a USDC split across vaults
3. You review the plan, sign transfers from your wallet, and track positions in the portfolio view
4. Withdraw anytime — *"Withdraw 3 USDC from StableFarmer"*

Your keys stay yours. Nothing moves without your approval.

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

Reputation-gated capital routing on Base Sepolia — agents earn trust on-chain, humans stay in the loop.
