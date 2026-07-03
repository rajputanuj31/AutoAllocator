import json
import base64
from pathlib import Path

from ai.registry import get_contracts
from ai.state import AllocatorState

AGENTS_CONFIG_PATH = Path(__file__).parent.parent.parent.parent / "scripts" / "agents_config.json"

SCORE_THRESHOLD = 400


def _load_agents_config() -> list[dict]:
    if not AGENTS_CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"agents_config.json not found at {AGENTS_CONFIG_PATH}. "
            "Run scripts/register_agents.py first."
        )
    with open(AGENTS_CONFIG_PATH) as f:
        data = json.load(f)
    return data.get("agents", [])


def _decode_agent_uri(uri: str) -> dict:
    if uri.startswith("data:application/json;base64,"):
        raw = base64.b64decode(uri.split(",", 1)[1])
        return json.loads(raw)
    if uri.startswith("data:application/json,"):
        return json.loads(uri.split(",", 1)[1])
    import urllib.request
    with urllib.request.urlopen(uri, timeout=5) as resp:
        return json.loads(resp.read())


def discover_node(state: AllocatorState) -> dict:
    parsed = state["parsed_intent"]
    target_strategy = parsed["strategy"]

    agents = _load_agents_config()
    _, identity, _ = get_contracts()

    candidates = []
    for agent in agents:
        agent_id = agent["agent_id"]

        # Verify agent is still registered on-chain (live check)
        try:
            uri = identity.functions.tokenURI(agent_id).call()
        except Exception:
            continue

        metadata = _decode_agent_uri(uri)
        strategy  = metadata.get("strategy", agent.get("strategy", ""))

        if strategy != target_strategy:
            continue

        candidates.append({
            "agent_id":     agent_id,
            "name":         metadata.get("name", agent["name"]),
            "strategy":     strategy,
            "vault_address": agent.get("vault_address", ""),
            "description":  metadata.get("description", ""),
            "registration_block": agent.get("registration_block", 43650000),
        })

    return {"candidates": candidates}
