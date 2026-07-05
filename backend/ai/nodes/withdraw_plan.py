"""Build a withdraw plan from the user's portfolio and parsed intent."""

from __future__ import annotations

from fastapi import HTTPException

from ai.state import AgentAllocation, AllocatorState
from db import ledger


def _match_agent(target: str, agent_id: str, agent_name: str) -> bool:
    if not target:
        return True
    t = target.lower()
    return t == str(agent_id).lower() or t in agent_name.lower()


def withdraw_plan_node(state: AllocatorState) -> dict:
    intent = state.get("parsed_intent") or {}
    wallet = state.get("wallet_address", "")
    if not wallet:
        raise HTTPException(status_code=400, detail="wallet_address is required.")

    requested = float(intent.get("amount_usd") or 0)
    target_agent = (intent.get("target_agent") or "").strip()
    withdraw_all = requested <= 0

    positions = ledger.get_portfolio(wallet)
    if target_agent:
        positions = [
            p for p in positions
            if _match_agent(target_agent, str(p["agent_id"]), p["agent_name"])
        ]

    if not positions:
        msg = "No active positions to withdraw."
        if target_agent:
            msg = f"No active position found for '{target_agent}'."
        raise HTTPException(status_code=422, detail=msg)

    total_available = sum(float(p["amount_usd"]) for p in positions)
    if withdraw_all:
        withdraw_total = total_available
    else:
        withdraw_total = min(requested, total_available)

    if withdraw_total <= 0:
        raise HTTPException(status_code=422, detail="Withdraw amount must be greater than zero.")

    plan: list[AgentAllocation] = []
    remaining = withdraw_total

    for i, pos in enumerate(positions):
        pos_amt = float(pos["amount_usd"])
        if i == len(positions) - 1:
            share = remaining
        elif withdraw_all:
            share = pos_amt
        else:
            share = round(withdraw_total * (pos_amt / total_available), 6)
            share = min(share, pos_amt, remaining)

        share = round(min(share, remaining), 6)
        if share <= 0:
            continue

        remaining -= share
        plan.append(AgentAllocation(
            agent_id=str(pos["agent_id"]),
            name=pos["agent_name"],
            score=0,
            strategy="withdraw",
            percentage=round(100 * share / withdraw_total, 2) if withdraw_total else 100.0,
            amount_usd=share,
            vault_address=pos["vault_address"],
        ))

    if remaining > 0.01 and plan:
        plan[-1]["amount_usd"] = round(plan[-1]["amount_usd"] + remaining, 6)

    return {"allocation": plan, "candidates": []}
