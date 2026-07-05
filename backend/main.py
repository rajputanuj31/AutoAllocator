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

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
load_dotenv()

APP_VERSION = os.getenv("APP_VERSION", "0.1.0")
APP_ENV = os.getenv("APP_ENV", "development")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXP_HOURS = 24

# In-memory set of thread IDs the user has explicitly cancelled.
# These threads can no longer be approved via /approve.
_cancelled_threads: set[str] = set()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
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
    """FastAPI dependency that validates the Bearer JWT on protected routes."""
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


# ---------------------------------------------------------------------------
# Routes — System
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health_check():
    """Liveness probe."""
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
    """Issue a signed JWT for the given wallet address.
    The token is valid for 24 hours and must be included as
    `Authorization: Bearer <token>` on all protected endpoints.
    """
    if not request.wallet_address:
        raise HTTPException(status_code=400, detail="wallet_address is required.")
    token = _create_token(request.wallet_address)
    return {"token": token, "expires_in": JWT_EXP_HOURS * 3600}


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
    """Accepts a natural language investment intent and runs it through the
    LangGraph orchestrator. Returns HTTP 202 when paused at the HITL interrupt.
    """
    thread_id = request.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    initial_state = {
        "user_message": request.message,
        "parsed_intent": None,
        "candidates": [],
        "allocation": [],
        "tx_results": [],
    }

    try:
        result = graph.invoke(initial_state, config=config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    state_snapshot = graph.get_state(config)
    is_paused = bool(state_snapshot.next)

    payload = {
        "thread_id": thread_id,
        "parsed_intent": result.get("parsed_intent"),
        "candidates": result.get("candidates", []),
        "allocation": result.get("allocation", []),
        "tx_results": result.get("tx_results", []),
        "status": "awaiting_approval" if is_paused else "completed",
    }

    return JSONResponse(content=payload, status_code=202 if is_paused else 200)


class ApproveRequest(BaseModel):
    thread_id: str


@app.post("/approve", tags=["Allocator"])
async def approve(
    request: ApproveRequest,
    token_data: dict = Depends(verify_token),
):
    """Resumes the paused LangGraph and executes on-chain USDC transfers."""
    if request.thread_id in _cancelled_threads:
        raise HTTPException(
            status_code=400,
            detail=f"Thread '{request.thread_id}' has been cancelled by the user.",
        )

    config = {"configurable": {"thread_id": request.thread_id}}
    state_snapshot = graph.get_state(config)
    if not state_snapshot.next:
        raise HTTPException(
            status_code=400,
            detail=f"Thread '{request.thread_id}' is not paused or does not exist.",
        )

    try:
        result = graph.invoke(None, config=config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "thread_id": request.thread_id,
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
    """Cancels a paused allocation. The thread can no longer be approved."""
    config = {"configurable": {"thread_id": request.thread_id}}
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
