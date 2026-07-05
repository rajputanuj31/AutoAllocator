"""Record wallet-confirmed USDC deposits after on-chain verification."""

from fastapi import HTTPException

from ai.state import AllocatorState, TxResult
from db import ledger


def execute_invest_node(state: AllocatorState) -> dict:
    """Record deposits from tx_results supplied by POST /invest/confirm."""
    allocation = state.get("allocation", [])
    wallet_address = state.get("wallet_address", "")
    tx_results = state.get("tx_results") or []

    if not allocation:
        raise HTTPException(
            status_code=422,
            detail="Cannot execute — no allocation was computed. Run /chat first.",
        )

    if not tx_results:
        raise HTTPException(
            status_code=422,
            detail="Awaiting wallet transfers. Sign USDC transactions in your wallet first.",
        )

    for tx in tx_results:
        if tx.get("status") != "success" or not tx.get("tx_hash"):
            continue
        agent = next(
            (a for a in allocation if str(a["agent_id"]) == str(tx["agent_id"])),
            None,
        )
        if agent and wallet_address:
            ledger.record_deposit(
                wallet_address=wallet_address,
                agent_id=str(agent["agent_id"]),
                agent_name=agent["name"],
                vault_address=agent.get("vault_address", ""),
                amount_usd=float(tx["amount_usd"]),
                tx_hash=tx["tx_hash"],
            )

    return {"tx_results": tx_results}
