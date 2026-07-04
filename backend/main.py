import os
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
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


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown hooks)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs startup checks before the server begins accepting requests."""
    print("=" * 60)
    print(f"  AutoAllocator Backend  v{APP_VERSION}  [{APP_ENV}]")
    print("=" * 60)
    print("  ✅  Server is ready.")
    print("  📖  Docs available at: http://localhost:8000/docs")
    print("=" * 60)
    yield
    # --- Shutdown ---
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

# ---------------------------------------------------------------------------
# CORS — allow the Next.js frontend to call this backend
# ---------------------------------------------------------------------------
origins = [
    "http://localhost:3000",   # Next.js dev server
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
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health_check():
    """Liveness probe. Returns 200 OK with service metadata."""
    return {
        "status": "ok",
        "version": APP_VERSION,
        "environment": APP_ENV,
        "service": "auto-allocator-backend",
    }


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None


@app.post("/chat", tags=["Allocator"])
async def chat(request: ChatRequest):
    """Accepts a natural language investment intent and runs it through the LangGraph orchestrator.
    Returns HTTP 202 when the graph pauses at the HITL interrupt, awaiting user approval.
    Returns HTTP 200 with tx_results once the graph completes after /approve.
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

    # Check if the graph paused at the HITL interrupt (before execute node)
    state_snapshot = graph.get_state(config)
    is_paused = bool(state_snapshot.next)

    payload = {
        "thread_id":    thread_id,
        "parsed_intent": result.get("parsed_intent"),
        "candidates":   result.get("candidates", []),
        "allocation":   result.get("allocation", []),
        "tx_results":   result.get("tx_results", []),
        "status":       "awaiting_approval" if is_paused else "completed",
    }

    # 202 = graph is paused and waiting for human approval
    # 200 = graph ran to completion (used when re-running after approval)
    status_code = 202 if is_paused else 200
    return JSONResponse(content=payload, status_code=status_code)


class ApproveRequest(BaseModel):
    thread_id: str


@app.post("/approve", tags=["Allocator"])
async def approve(request: ApproveRequest):
    """Resumes the paused LangGraph for a given thread and executes the on-chain USDC transfers."""
    config = {"configurable": {"thread_id": request.thread_id}}

    # Verify the thread exists and is actually paused
    state_snapshot = graph.get_state(config)
    if not state_snapshot.next:
        raise HTTPException(
            status_code=400,
            detail=f"Thread '{request.thread_id}' is not paused or does not exist.",
        )

    try:
        # Resume the graph by passing None as the next state update (no state changes, just resume)
        result = graph.invoke(None, config=config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "thread_id":  request.thread_id,
        "tx_results": result.get("tx_results", []),
        "status":     "completed",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
