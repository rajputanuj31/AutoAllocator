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


def get_portfolio(wallet_address: str) -> list[dict]:
    """Aggregated active positions per agent for a wallet."""
    wallet = wallet_address.lower()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT
                p.agent_id,
                (
                    SELECT p2.agent_name
                    FROM positions p2
                    WHERE p2.wallet_address = p.wallet_address
                      AND p2.agent_id = p.agent_id
                      AND p2.status = 'active'
                    ORDER BY p2.created_at DESC
                    LIMIT 1
                ) AS agent_name,
                (
                    SELECT p2.vault_address
                    FROM positions p2
                    WHERE p2.wallet_address = p.wallet_address
                      AND p2.agent_id = p.agent_id
                      AND p2.status = 'active'
                    ORDER BY p2.created_at DESC
                    LIMIT 1
                ) AS vault_address,
                SUM(p.amount_usd) AS amount_usd,
                COUNT(*) AS deposit_count,
                MAX(p.created_at) AS last_deposit_at
            FROM positions p
            WHERE p.wallet_address = ? AND p.status = 'active'
            GROUP BY p.agent_id
            ORDER BY amount_usd DESC
            """,
            (wallet,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_position_history(wallet_address: str, *, limit: int = 100) -> list[dict]:
    """Chronological deposit/withdraw events for a wallet."""
    wallet = wallet_address.lower()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT
                e.id,
                e.event_type,
                e.amount_usd,
                e.tx_hash,
                e.created_at,
                p.agent_id,
                p.agent_name,
                p.vault_address
            FROM position_events e
            JOIN positions p ON p.id = e.position_id
            WHERE p.wallet_address = ?
            ORDER BY e.created_at DESC
            LIMIT ?
            """,
            (wallet, limit),
        ).fetchall()
    return [dict(row) for row in rows]
