from fastapi import HTTPException

from ai.registry import get_contracts
from ai.services.reputation import get_reputation_score
from ai.state import AllocatorState

SCORE_THRESHOLD = 400


def filter_node(state: AllocatorState) -> dict:
    candidates = state["candidates"]

    if not candidates:
        raise HTTPException(
            status_code=422,
            detail="No candidate agents found for the requested strategy. Try a different intent.",
        )

    _, _, reputation = get_contracts()

    scored = []
    for agent in candidates:
        reg_block = agent.get("registration_block", 43650000)
        score = get_reputation_score(reputation, agent["agent_id"], from_block=reg_block)
        if score >= SCORE_THRESHOLD:
            scored.append({**agent, "score": score})

    if not scored:
        raise HTTPException(
            status_code=422,
            detail=(
                f"All candidate agents were filtered out (score < {SCORE_THRESHOLD}). "
                "No capital will be allocated."
            ),
        )

    return {"candidates": scored}
