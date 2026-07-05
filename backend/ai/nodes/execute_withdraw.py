"""Execute withdraw transfers from agent vaults to the user's wallet."""

from fastapi import HTTPException

from ai.services.vault_transfer import transfer_usdc_from_vault
from ai.state import AllocatorState, TxResult
from db import ledger


def execute_withdraw_node(state: AllocatorState) -> dict:
    allocation = state.get("allocation", [])
    wallet_address = state.get("wallet_address", "")

    if not allocation:
        raise HTTPException(
            status_code=422,
            detail="Cannot execute — no withdraw plan was computed.",
        )
    if not wallet_address:
        raise HTTPException(status_code=400, detail="wallet_address is required.")

    results: list[TxResult] = []

    for item in allocation:
        amount_usd = float(item["amount_usd"])
        agent_id = str(item["agent_id"])
        agent_name = item["name"]

        try:
            print(f"[withdraw] ${amount_usd} USDC from {agent_name} → {wallet_address}")
            tx_hash = transfer_usdc_from_vault(
                agent_id=agent_id,
                to_address=wallet_address,
                amount_usd=amount_usd,
            )
            print(f"[withdraw] ✅ {agent_name}: tx {tx_hash}")
            results.append(TxResult(
                agent_id=agent_id,
                tx_hash=tx_hash,
                amount_usd=amount_usd,
                status="success",
            ))
            ledger.record_withdraw(
                wallet_address=wallet_address,
                agent_id=agent_id,
                agent_name=agent_name,
                vault_address=item.get("vault_address", ""),
                amount_usd=amount_usd,
                tx_hash=tx_hash,
            )
        except HTTPException:
            raise
        except Exception as e:
            print(f"[withdraw] ❌ {agent_name} failed: {e}")
            results.append(TxResult(
                agent_id=agent_id,
                tx_hash="",
                amount_usd=amount_usd,
                status="failed",
            ))

    if all(r["status"] == "failed" for r in results):
        raise HTTPException(status_code=500, detail="All withdraw transfers failed.")

    return {"tx_results": results}
