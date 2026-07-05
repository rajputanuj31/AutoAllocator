import json
import base64
from pathlib import Path

from ai.registry import get_contracts
from ai.services.agent_metadata import decode_agent_uri
from ai.state import AllocatorState

AGENTS_CONFIG_PATH = Path(__file__).parent.parent.parent.parent / "scripts" / "agents_config.json"


def _load_agents_config() -> list[dict]:
    if not AGENTS_CONFIG_PATH.exists():
        raise FileNotFoundError(
            "agents_config.json not found. Ensure scripts/agents_config.json exists."
        )
    with open(AGENTS_CONFIG_PATH) as f:
        data = json.load(f)
    return data.get("agents", [])


def discover_node(state: AllocatorState) -> dict:
    parsed = state["parsed_intent"]
    target_strategy = parsed["strategy"]

    agents = _load_agents_config()
    _, identity, _ = get_contracts()

    candidates = []
    for agent in agents:
        agent_id = agent["agent_id"]

        try:
            uri = identity.functions.tokenURI(agent_id).call()
        except Exception:
            continue

        try:
            metadata = decode_agent_uri(uri)
        except Exception:
            metadata = {
                "name": agent.get("name", ""),
                "description": agent.get("description", ""),
                "strategy": agent.get("strategy", ""),
            }

        strategy = metadata.get("strategy", agent.get("strategy", ""))

        if strategy != target_strategy:
            continue

        candidates.append({
            "agent_id": agent_id,
            "name": metadata.get("name", agent["name"]),
            "strategy": strategy,
            "vault_address": agent.get("vault_address", ""),
            "description": metadata.get("description", ""),
            "registration_block": agent.get("registration_block", 43650000),
        })

    return {"candidates": candidates}
