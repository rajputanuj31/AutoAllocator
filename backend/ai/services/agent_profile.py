"""Build rich agent profiles for due diligence and approval UI."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from web3 import Web3

from ai.registry import get_contracts
from ai.services.agent_metadata import decode_agent_uri
from ai.services.reputation import ReputationBreakdown, get_reputation_breakdown
from db import ledger

AGENTS_CONFIG_PATH = Path(__file__).parent.parent.parent.parent / "scripts" / "agents_config.json"

USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
USDC_DECIMALS = 6

ERC20_BALANCE_ABI = json.loads(
    """[
        {"constant":true,"inputs":[{"name":"account","type":"address"}],
         "name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"}
    ]"""
)


def _load_agent_config(agent_id: int | str) -> dict | None:
    if not AGENTS_CONFIG_PATH.exists():
        return None
    with open(AGENTS_CONFIG_PATH) as f:
        data = json.load(f)
    for agent in data.get("agents", []):
        if str(agent.get("agent_id")) == str(agent_id):
            return agent
    return None


def _get_usdc_balance_usd(w3: Web3, address: str) -> float:
    if not address:
        return 0.0
    try:
        usdc = w3.eth.contract(
            address=Web3.to_checksum_address(USDC_ADDRESS),
            abi=ERC20_BALANCE_ABI,
        )
        raw = usdc.functions.balanceOf(Web3.to_checksum_address(address)).call()
        return raw / (10 ** USDC_DECIMALS)
    except Exception:
        return 0.0


def _block_timestamp_iso(w3: Web3, block_number: int) -> str | None:
    try:
        block = w3.eth.get_block(block_number)
        return datetime.fromtimestamp(block["timestamp"], tz=timezone.utc).isoformat()
    except Exception:
        return None


def _reputation_to_dict(rep: ReputationBreakdown) -> dict:
    return {
        "score": rep.score,
        "positive_count": rep.positive_count,
        "negative_count": rep.negative_count,
        "total_count": rep.total_count,
        "last_feedback_at": rep.last_feedback_at,
    }


def build_agent_profile(
    agent_id: int | str,
    wallet_address: str | None = None,
    *,
    known_score: int | None = None,
) -> dict:
    config = _load_agent_config(agent_id)
    if config is None:
        raise ValueError(f"Agent {agent_id} not found in agents_config.json")

    w3, identity, reputation = get_contracts()
    agent_id_int = int(agent_id)
    reg_block = config.get("registration_block", 0)

    metadata: dict = {}
    owner: str | None = None
    try:
        uri = identity.functions.tokenURI(agent_id_int).call()
        metadata = decode_agent_uri(uri)
    except Exception:
        metadata = {
            "name": config.get("name", ""),
            "description": config.get("description", ""),
            "strategy": config.get("strategy", ""),
        }

    try:
        owner = identity.functions.ownerOf(agent_id_int).call()
    except Exception:
        owner = None

    if known_score is not None:
        from ai.services import reputation as rep_mod

        cached_rep = rep_mod._breakdown_cache.get((agent_id_int, reg_block))
        if cached_rep:
            rep_dict = _reputation_to_dict(cached_rep)
        else:
            rep_dict = {
                "score": known_score,
                "positive_count": 0,
                "negative_count": 0,
                "total_count": 0,
                "last_feedback_at": None,
            }
    else:
        rep_dict = _reputation_to_dict(
            get_reputation_breakdown(reputation, agent_id_int, from_block=reg_block)
        )

    vault_address = config.get("vault_address", "")
    vault_tvl = _get_usdc_balance_usd(w3, vault_address)

    your_position = 0.0
    if wallet_address:
        your_position = ledger.get_wallet_position_usd(wallet_address, str(agent_id))

    return {
        "agent_id": str(agent_id),
        "name": metadata.get("name", config.get("name", "")),
        "strategy": metadata.get("strategy", config.get("strategy", "")),
        "description": metadata.get("description", config.get("description", "")),
        "vault_address": vault_address,
        "owner": owner,
        "registered_at": _block_timestamp_iso(w3, reg_block) if reg_block else None,
        "registration_block": reg_block,
        "reputation": rep_dict,
        "vault_tvl_usd": round(vault_tvl, 2),
        "your_position_usd": round(your_position, 2),
    }


def build_profiles_from_candidates(
    candidates: list[dict],
    wallet_address: str | None = None,
) -> list[dict]:
    """Build profiles reusing scores already computed in filter_node."""
    profiles = []
    for c in candidates:
        agent_id = c.get("agent_id")
        if agent_id is None:
            continue
        try:
            profiles.append(
                build_agent_profile(
                    agent_id,
                    wallet_address,
                    known_score=c.get("score"),
                )
            )
        except ValueError:
            continue
    return profiles


def build_profiles_for_agents(
    agent_ids: list[int | str],
    wallet_address: str | None = None,
) -> list[dict]:
    profiles = []
    for agent_id in agent_ids:
        try:
            profiles.append(build_agent_profile(agent_id, wallet_address))
        except ValueError:
            continue
    return profiles
