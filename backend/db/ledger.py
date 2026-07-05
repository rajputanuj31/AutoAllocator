"""SQLite position ledger and thread session tracking."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

_DB_PATH = Path(__file__).parent / "allocator.db"
_SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they do not exist."""
    with _connect() as conn:
        conn.executescript(_SCHEMA_PATH.read_text())


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def register_thread(thread_id: str, wallet_address: str) -> None:
    wallet = wallet_address.lower()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO thread_sessions (thread_id, wallet_address)
            VALUES (?, ?)
            ON CONFLICT(thread_id) DO UPDATE SET wallet_address = excluded.wallet_address
            """,
            (thread_id, wallet),
        )
        conn.commit()


def get_thread_wallet(thread_id: str) -> str | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT wallet_address FROM thread_sessions WHERE thread_id = ?",
            (thread_id,),
        ).fetchone()
    return row["wallet_address"] if row else None


def verify_thread_owner(thread_id: str, wallet_address: str) -> bool:
    owner = get_thread_wallet(thread_id)
    if owner is None:
        return False
    return owner == wallet_address.lower()


def record_deposit(
    *,
    wallet_address: str,
    agent_id: str,
    agent_name: str,
    vault_address: str,
    amount_usd: float,
    tx_hash: str,
) -> int:
    """Record a successful deposit. Returns the new position id."""
    wallet = wallet_address.lower()
    now = _now()
    with _connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO positions (
                wallet_address, agent_id, agent_name, vault_address,
                amount_usd, tx_hash, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
            """,
            (wallet, str(agent_id), agent_name, vault_address, amount_usd, tx_hash, now, now),
        )
        position_id = cur.lastrowid
        conn.execute(
            """
            INSERT INTO position_events (position_id, event_type, amount_usd, tx_hash, created_at)
            VALUES (?, 'deposit', ?, ?, ?)
            """,
            (position_id, amount_usd, tx_hash, now),
        )
        conn.commit()
    return int(position_id)


def get_wallet_position_usd(wallet_address: str, agent_id: str) -> float:
    """Sum of active position amounts for a wallet + agent."""
    wallet = wallet_address.lower()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT COALESCE(SUM(amount_usd), 0) AS total
            FROM positions
            WHERE wallet_address = ? AND agent_id = ? AND status = 'active'
            """,
            (wallet, str(agent_id)),
        ).fetchone()
    return float(row["total"]) if row else 0.0
