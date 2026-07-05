CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    vault_address TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    tx_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_positions_wallet_agent ON positions(wallet_address, agent_id);

CREATE TABLE IF NOT EXISTS position_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    tx_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (position_id) REFERENCES positions(id)
);

CREATE TABLE IF NOT EXISTS thread_sessions (
    thread_id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_thread_sessions_wallet ON thread_sessions(wallet_address);
