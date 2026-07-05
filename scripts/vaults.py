"""
Per-agent EOA vault helpers.

Each agent gets its own vault address (still an EOA, not a smart contract).
Keys are stored in scripts/vault_keys.json (gitignored) so the deployer can
recover USDC from each vault when implementing withdraw.
"""

from __future__ import annotations

import json
from pathlib import Path

from eth_account import Account
from web3 import Web3

VAULT_KEYS_PATH = Path(__file__).parent / "vault_keys.json"
AGENTS_CONFIG_PATH = Path(__file__).parent / "agents_config.json"

AGENT_NAMES = ["YieldMaximizer", "StableFarmer", "SybilBot"]


def load_vault_keys() -> dict[str, dict]:
    if not VAULT_KEYS_PATH.exists():
        return {}
    with open(VAULT_KEYS_PATH) as f:
        return json.load(f)


def save_vault_keys(keys: dict[str, dict]) -> None:
    VAULT_KEYS_PATH.write_text(json.dumps(keys, indent=2))
    try:
        VAULT_KEYS_PATH.chmod(0o600)
    except OSError:
        pass


def get_or_create_vault_accounts(agent_names: list[str] | None = None) -> dict[str, Account]:
    """Return one LocalAccount per agent name; create and persist if missing."""
    names = agent_names or AGENT_NAMES
    stored = load_vault_keys()
    accounts: dict[str, Account] = {}

    for name in names:
        if name in stored and stored[name].get("private_key"):
            accounts[name] = Account.from_key(stored[name]["private_key"])
        else:
            acct = Account.create()
            stored[name] = {
                "address": acct.address,
                "private_key": acct.key.hex(),
            }
            accounts[name] = acct

    save_vault_keys(stored)
    return accounts


def vault_address_for(agent_name: str) -> str | None:
    stored = load_vault_keys()
    entry = stored.get(agent_name)
    return entry["address"] if entry else None


def update_agents_config_vaults(agent_names: list[str] | None = None) -> list[dict]:
    """Assign per-agent vault addresses in agents_config.json. Returns updated agents."""
    names = agent_names or AGENT_NAMES
    accounts = get_or_create_vault_accounts(names)

    if not AGENTS_CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"{AGENTS_CONFIG_PATH} not found. Run register_agents.py first."
        )

    with open(AGENTS_CONFIG_PATH) as f:
        config = json.load(f)

    agents = config.get("agents", [])
    name_to_vault = {name: accounts[name].address for name in names}

    updated = []
    for agent in agents:
        name = agent.get("name")
        if name in name_to_vault:
            agent = {**agent, "vault_address": name_to_vault[name]}
        updated.append(agent)

    config["agents"] = updated
    AGENTS_CONFIG_PATH.write_text(json.dumps(config, indent=2))
    return updated


def print_vault_summary() -> None:
    stored = load_vault_keys()
    if not stored:
        print("No vault keys found. Run update_vault_addresses.py first.")
        return
    print("\nPer-agent vault addresses:")
    for name, entry in stored.items():
        print(f"  {name:16} → {entry['address']}")
    print(f"\nKeys stored in: {VAULT_KEYS_PATH}")
    print("(gitignored — keep safe for testnet fund recovery)")
