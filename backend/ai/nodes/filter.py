from fastapi import HTTPException

from ai.registry import get_contracts
from ai.state import AllocatorState, AgentAllocation

SCORE_THRESHOLD = 400


def _get_reputation_score(reputation_contract, agent_id: int, from_block: int = 0) -> int:
    # Read all NewFeedback events for this agent from the Reputation Registry.
    # Score = average of non-revoked feedback values across all clients.
    # Values are on a 0-1000 scale (as submitted by register_agents.py).
    new_feedback_events = []
    current_block = from_block
    end_search_block = from_block + 50
    
    try:
        latest = reputation_contract.w3.eth.block_number
        end_search_block = min(end_search_block, latest)
        
        while current_block <= end_search_block:
            chunk_end = min(current_block + 9, end_search_block)
            logs = reputation_contract.events.NewFeedback.get_logs(
                from_block=current_block,
                to_block=chunk_end,
                argument_filters={"agentId": agent_id},
            )
            new_feedback_events.extend(logs)
            current_block = chunk_end + 1
    except Exception as e:
        raise RuntimeError(f"Failed to query NewFeedback events for agentId {agent_id}: {e}")

    if not new_feedback_events:
        return 0

    revoked_keys = set()
    current_block = from_block
    try:
        while current_block <= end_search_block:
            chunk_end = min(current_block + 9, end_search_block)
            revoked_events = reputation_contract.events.FeedbackRevoked.get_logs(
                from_block=current_block,
                to_block=chunk_end,
                argument_filters={"agentId": agent_id},
            )
            for ev in revoked_events:
                revoked_keys.add((ev.args.clientAddress, ev.args.feedbackIndex))
            current_block = chunk_end + 1
    except Exception:
        pass

    total = 0
    count = 0
    for ev in new_feedback_events:
        key = (ev.args.clientAddress, ev.args.feedbackIndex)
        if key in revoked_keys:
            continue
        total += ev.args.value
        count += 1

    return int(total / count) if count > 0 else 0


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
        score = _get_reputation_score(reputation, agent["agent_id"], from_block=reg_block)
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
