"""ERC-8004 reputation scoring from on-chain feedback events."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Alchemy free tier: max 10 blocks per eth_getLogs request.
DEFAULT_CHUNK_SIZE = 10
MIN_CHUNK_SIZE = 1
# Feedback is submitted at registration in register_agents.py.
MAX_SCAN_BLOCKS = 30

# In-process cache — avoids duplicate RPC when filter + profile both need scores.
_breakdown_cache: dict[tuple[int, int], "ReputationBreakdown"] = {}


@dataclass
class ReputationBreakdown:
    score: int
    positive_count: int
    negative_count: int
    total_count: int
    last_feedback_at: str | None


def _fetch_events(
    contract,
    event_name: str,
    agent_id: int,
    from_block: int,
    to_block: int,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> list:
    if from_block > to_block:
        return []

    event = getattr(contract.events, event_name)
    logs: list = []
    current = from_block
    size = max(MIN_CHUNK_SIZE, chunk_size)

    while current <= to_block:
        chunk_end = min(current + size - 1, to_block)
        try:
            logs.extend(
                event.get_logs(
                    from_block=current,
                    to_block=chunk_end,
                    argument_filters={"agentId": agent_id},
                )
            )
            current = chunk_end + 1
        except Exception as e:
            err = str(e).lower()
            is_range_error = (
                "400" in err
                or "bad request" in err
                or "block range" in err
                or "too many" in err
                or "exceed" in err
            )
            if is_range_error and size > MIN_CHUNK_SIZE:
                size = max(MIN_CHUNK_SIZE, size // 2)
                logger.warning(
                    "Reducing log chunk size to %s for %s (agent %s)",
                    size,
                    event_name,
                    agent_id,
                )
                continue
            raise

    return logs


def get_reputation_breakdown(
    reputation_contract,
    agent_id: int,
    from_block: int = 0,
) -> ReputationBreakdown:
    cache_key = (agent_id, from_block)
    if cache_key in _breakdown_cache:
        return _breakdown_cache[cache_key]

    w3 = reputation_contract.w3
    latest = w3.eth.block_number
    start = max(0, from_block)
    end = min(latest, start + MAX_SCAN_BLOCKS)

    if start > end:
        result = ReputationBreakdown(0, 0, 0, 0, None)
        _breakdown_cache[cache_key] = result
        return result

    try:
        feedback_events = _fetch_events(
            reputation_contract, "NewFeedback", agent_id, start, end
        )
    except Exception as e:
        raise RuntimeError(
            f"Failed to query NewFeedback events for agentId {agent_id}: {e}"
        ) from e

    if not feedback_events:
        result = ReputationBreakdown(0, 0, 0, 0, None)
        _breakdown_cache[cache_key] = result
        return result

    revoked_keys: set[tuple[str, int]] = set()
    try:
        revoked_events = _fetch_events(
            reputation_contract, "FeedbackRevoked", agent_id, start, end
        )
        for ev in revoked_events:
            revoked_keys.add((ev.args.clientAddress, ev.args.feedbackIndex))
    except Exception:
        pass

    total = 0
    count = 0
    positive = 0
    negative = 0
    last_block = 0

    for ev in feedback_events:
        key = (ev.args.clientAddress, ev.args.feedbackIndex)
        if key in revoked_keys:
            continue
        value = int(ev.args.value)
        total += value
        count += 1
        if value >= 500:
            positive += 1
        else:
            negative += 1
        if ev.blockNumber > last_block:
            last_block = ev.blockNumber

    last_feedback_at = None
    if last_block > 0:
        try:
            block = w3.eth.get_block(last_block)
            ts = datetime.fromtimestamp(block["timestamp"], tz=timezone.utc)
            last_feedback_at = ts.isoformat()
        except Exception:
            pass

    score = int(total / count) if count > 0 else 0
    result = ReputationBreakdown(
        score=score,
        positive_count=positive,
        negative_count=negative,
        total_count=count,
        last_feedback_at=last_feedback_at,
    )
    _breakdown_cache[cache_key] = result
    return result


def get_reputation_score(
    reputation_contract,
    agent_id: int,
    from_block: int = 0,
) -> int:
    return get_reputation_breakdown(reputation_contract, agent_id, from_block).score
