import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ai.graph import graph
from ai.services.agent_profile import (
    build_agent_profile,
    build_profiles_for_agents,
    build_profiles_from_candidates,
)
from ai.services.verify_transfer import verify_usdc_transfer
from db import ledger

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
load_dotenv()

APP_VERSION = os.getenv("APP_VERSION", "0.1.0")
APP_ENV = os.getenv("APP_ENV", "development")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXP_HOURS = 24

_cancelled_threads: set[str] = set()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    ledger.init_db()
    print("=" * 60)
    print(f"  AutoAllocator Backend  v{APP_VERSION}  [{APP_ENV}]")
    print("=" * 60)
    print("  ✅  Server is ready.")
    print("  📖  Docs available at: http://localhost:8000/docs")
    print("=" * 60)
    yield
    print("  AutoAllocator backend shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="AutoAllocator API",
    description=(
        "Reputation-Gated Capital Router. "
        "Translates natural language into on-chain capital allocation "
        "across verified, high-reputation DeFi agents."
    ),
    version=APP_VERSION,
    lifespan=lifespan,
)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://main.dfetpm59rfi7r.amplifyapp.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def _create_token(wallet_address: str) -> str:
    payload = {
        "wallet_address": wallet_address.lower(),
        "exp": datetime.now(tz=timezone.utc) + timedelta(hours=JWT_EXP_HOURS),
        "iat": datetime.now(tz=timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Connect your wallet to continue.",
        )
    token = authorization.split(" ", 1)[1]
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Session expired. Please reconnect your wallet.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")


def _wallet_from_token(token_data: dict) -> str:
    return token_data["wallet_address"].lower()


def _graph_config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


def _resolve_thread_id(request_thread_id: str | None) -> str:
    """Use a fresh thread if the stored one is still paused awaiting approval."""
    if not request_thread_id:
        return str(uuid.uuid4())
    snapshot = graph.get_state(_graph_config(request_thread_id))
    if snapshot.next:
        return str(uuid.uuid4())
    return request_thread_id


def _verify_thread_access(thread_id: str, wallet: str) -> None:
    owner = ledger.get_thread_wallet(thread_id)
    snapshot = graph.get_state(_graph_config(thread_id))
    state_wallet = (snapshot.values or {}).get("wallet_address", "").lower()

    if owner and owner != wallet:
        raise HTTPException(status_code=403, detail="Not authorized for this thread.")
    if state_wallet and state_wallet != wallet:
        raise HTTPException(status_code=403, detail="Not authorized for this thread.")
    if not owner and not snapshot.values:
        raise HTTPException(
            status_code=400,
            detail=f"Thread '{thread_id}' is not paused or does not exist.",
        )


def _agent_profiles_for_response(result: dict, wallet: str) -> list[dict]:
    allocation = result.get("allocation") or []
    if allocation:
        candidates_like = [
            {"agent_id": a["agent_id"], "score": a.get("score")}
            for a in allocation
        ]
        return build_profiles_from_candidates(candidates_like, wallet)
    return build_profiles_from_candidates(result.get("candidates") or [], wallet)


# ---------------------------------------------------------------------------
# Routes — System
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "ok",
        "version": APP_VERSION,
        "environment": APP_ENV,
        "service": "auto-allocator-backend",
    }


# ---------------------------------------------------------------------------
# Routes — Auth
# ---------------------------------------------------------------------------

class AuthRequest(BaseModel):
    wallet_address: str


@app.post("/auth/token", tags=["Auth"])
async def get_auth_token(request: AuthRequest):
    if not request.wallet_address:
        raise HTTPException(status_code=400, detail="wallet_address is required.")
    token = _create_token(request.wallet_address)
    return {"token": token, "expires_in": JWT_EXP_HOURS * 3600}


# ---------------------------------------------------------------------------
# Routes — Agents
# ---------------------------------------------------------------------------

@app.get("/agents/{agent_id}", tags=["Agents"])
async def get_agent(
    agent_id: str,
    token_data: dict = Depends(verify_token),
):
    """Full agent profile for due diligence before approval."""
    wallet = _wallet_from_token(token_data)
    try:
        return build_agent_profile(agent_id, wallet)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Routes — Portfolio
# ---------------------------------------------------------------------------

@app.get("/portfolio", tags=["Portfolio"])
async def get_portfolio(token_data: dict = Depends(verify_token)):
    """Aggregated active positions for the authenticated wallet."""
    wallet = _wallet_from_token(token_data)
    rows = ledger.get_portfolio(wallet)

    agent_ids = [r["agent_id"] for r in rows]
    profiles_by_id = {
        p["agent_id"]: p for p in build_profiles_for_agents(agent_ids, wallet)
    }

    positions = []
    total_usd = 0.0
    for row in rows:
        agent_id = str(row["agent_id"])
        profile = profiles_by_id.get(agent_id, {})
        amount = float(row["amount_usd"])
        total_usd += amount
        positions.append({
            "agent_id": agent_id,
            "agent_name": row["agent_name"],
            "strategy": profile.get("strategy", ""),
            "vault_address": row["vault_address"],
            "amount_usd": round(amount, 2),
            "deposit_count": int(row["deposit_count"]),
            "last_deposit_at": row["last_deposit_at"],
            "reputation_score": profile.get("reputation", {}).get("score"),
            "vault_tvl_usd": profile.get("vault_tvl_usd", 0.0),
        })

    return {
        "wallet_address": wallet,
        "total_usd": round(total_usd, 2),
        "position_count": len(positions),
        "positions": positions,
    }


@app.get("/portfolio/history", tags=["Portfolio"])
async def get_portfolio_history(
    token_data: dict = Depends(verify_token),
    limit: int = 100,
):
    """Transaction history derived from the position ledger."""
    wallet = _wallet_from_token(token_data)
    limit = max(1, min(limit, 500))
    events = ledger.get_position_history(wallet, limit=limit)

    return {
        "wallet_address": wallet,
        "event_count": len(events),
        "events": [
            {
                "id": e["id"],
                "event_type": e["event_type"],
                "agent_id": str(e["agent_id"]),
                "agent_name": e["agent_name"],
                "vault_address": e["vault_address"],
                "amount_usd": round(float(e["amount_usd"]), 2),
                "tx_hash": e["tx_hash"],
                "status": "success" if e["tx_hash"] and e["tx_hash"] != "simulated_hash" else "simulated",
                "created_at": e["created_at"],
            }
            for e in events
        ],
    }


# ---------------------------------------------------------------------------
# Routes — Allocator
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None


@app.post("/chat", tags=["Allocator"])
async def chat(
    request: ChatRequest,
    token_data: dict = Depends(verify_token),
):
    wallet = _wallet_from_token(token_data)
    thread_id = _resolve_thread_id(request.thread_id)
    config = _graph_config(thread_id)

    ledger.register_thread(thread_id, wallet)

    initial_state = {
        "user_message": request.message,
        "wallet_address": wallet,
        "flow_type": "invest",
        "parsed_intent": None,
        "candidates": [],
        "allocation": [],
        "tx_results": [],
    }

    try:
        result = graph.invoke(initial_state, config=config)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    state_snapshot = graph.get_state(config)
    is_paused = bool(state_snapshot.next)

    agent_profiles = _agent_profiles_for_response(result, wallet)

    payload = {
        "thread_id": thread_id,
        "flow_type": result.get("flow_type", "invest"),
        "destination_wallet": wallet if result.get("flow_type") == "withdraw" else None,
        "parsed_intent": result.get("parsed_intent"),
        "candidates": result.get("candidates", []),
        "allocation": result.get("allocation", []),
        "agent_profiles": agent_profiles,
        "tx_results": result.get("tx_results", []),
        "status": "awaiting_approval" if is_paused else "completed",
    }

    return JSONResponse(content=payload, status_code=202 if is_paused else 200)


class ApproveRequest(BaseModel):
    thread_id: str


class InvestConfirmTx(BaseModel):
    agent_id: str
    tx_hash: str
    amount_usd: float


class InvestConfirmRequest(BaseModel):
    thread_id: str
    tx_results: list[InvestConfirmTx]


@app.post("/invest/confirm", tags=["Allocator"])
async def invest_confirm(
    request: InvestConfirmRequest,
    token_data: dict = Depends(verify_token),
):
    """Verify wallet-signed USDC transfers and record deposits."""
    wallet = _wallet_from_token(token_data)

    if request.thread_id in _cancelled_threads:
        raise HTTPException(status_code=400, detail="Thread has been cancelled.")

    _verify_thread_access(request.thread_id, wallet)

    config = _graph_config(request.thread_id)
    snapshot = graph.get_state(config)
    if not snapshot.next or "execute_invest" not in snapshot.next:
        raise HTTPException(status_code=400, detail="Thread is not awaiting invest confirmation.")

    values = snapshot.values or {}
    allocation = values.get("allocation") or []
    if not allocation:
        raise HTTPException(status_code=400, detail="No allocation found for this thread.")

    alloc_by_id = {str(a["agent_id"]): a for a in allocation}
    verified: list[dict] = []

    for tx in request.tx_results:
        agent = alloc_by_id.get(str(tx.agent_id))
        if not agent:
            raise HTTPException(status_code=400, detail=f"Unknown agent_id {tx.agent_id}.")

        verify_usdc_transfer(
            tx_hash=tx.tx_hash,
            expected_from=wallet,
            expected_to=agent["vault_address"],
            expected_amount_usd=float(tx.amount_usd),
        )
        verified.append({
            "agent_id": str(tx.agent_id),
            "tx_hash": tx.tx_hash,
            "amount_usd": float(tx.amount_usd),
            "status": "success",
        })

    expected_ids = {str(a["agent_id"]) for a in allocation}
    submitted_ids = {str(t.agent_id) for t in request.tx_results}
    if submitted_ids != expected_ids:
        raise HTTPException(
            status_code=400,
            detail="Must submit one successful transfer per agent in the allocation.",
        )

    graph.update_state(config, {"tx_results": verified})

    try:
        result = graph.invoke(None, config=config)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "thread_id": request.thread_id,
        "flow_type": "invest",
        "tx_results": result.get("tx_results", verified),
        "status": "completed",
    }


@app.post("/approve", tags=["Allocator"])
async def approve(
    request: ApproveRequest,
    token_data: dict = Depends(verify_token),
):
    """Resume a paused withdraw flow (invest uses POST /invest/confirm)."""
    wallet = _wallet_from_token(token_data)

    if request.thread_id in _cancelled_threads:
        raise HTTPException(
            status_code=400,
            detail=f"Thread '{request.thread_id}' has been cancelled by the user.",
        )

    _verify_thread_access(request.thread_id, wallet)

    config = _graph_config(request.thread_id)
    state_snapshot = graph.get_state(config)
    if not state_snapshot.next:
        raise HTTPException(
            status_code=400,
            detail=f"Thread '{request.thread_id}' is not paused or does not exist.",
        )

    if "execute_withdraw" not in state_snapshot.next:
        raise HTTPException(
            status_code=400,
            detail="Invest allocations are confirmed via wallet transfers at POST /invest/confirm.",
        )

    try:
        result = graph.invoke(None, config=config)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "thread_id": request.thread_id,
        "flow_type": result.get("flow_type", "withdraw"),
        "tx_results": result.get("tx_results", []),
        "status": "completed",
    }


class CancelRequest(BaseModel):
    thread_id: str


@app.post("/cancel", tags=["Allocator"])
async def cancel(
    request: CancelRequest,
    token_data: dict = Depends(verify_token),
):
    wallet = _wallet_from_token(token_data)
    _verify_thread_access(request.thread_id, wallet)

    config = _graph_config(request.thread_id)
    state_snapshot = graph.get_state(config)

    if not state_snapshot or not state_snapshot.next:
        raise HTTPException(
            status_code=400,
            detail=f"Thread '{request.thread_id}' is not paused or does not exist.",
        )

    _cancelled_threads.add(request.thread_id)
    return {"thread_id": request.thread_id, "status": "cancelled"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
