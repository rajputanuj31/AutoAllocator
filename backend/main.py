import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    """
    Liveness probe. Returns 200 OK with service metadata.

    Used by Docker Compose and any future deployment orchestrators
    to confirm the service is alive before routing traffic.
    """
    return {
        "status": "ok",
        "version": APP_VERSION,
        "environment": APP_ENV,
        "service": "auto-allocator-backend",
    }


# ---------------------------------------------------------------------------
# Dev entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
