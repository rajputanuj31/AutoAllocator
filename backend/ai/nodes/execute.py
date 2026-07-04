import asyncio
import os

from fastapi import HTTPException

from ai.state import AllocatorState, TxResult

USDC_TOKEN = "usdc"
NETWORK    = "base-sepolia"
# CDP "Server Account" name — persistent across sessions
CDP_ACCOUNT_NAME = "auto-allocator-vault"


def _run_async(coro):
    """Run an async coroutine synchronously from a sync LangGraph node."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


async def _execute_transfers(allocation: list[dict]) -> list[TxResult]:
    """Use Coinbase CDP SDK to transfer USDC to each agent's vault address."""
    from cdp import CdpClient, parse_units

    api_key_id     = os.getenv("CDP_API_KEY_ID")
    api_key_secret = os.getenv("CDP_API_KEY_SECRET")
    wallet_secret  = os.getenv("CDP_WALLET_SECRET")

    if not api_key_id or not api_key_secret:
        raise HTTPException(
            status_code=500,
            detail="Missing CDP credentials. Set CDP_API_KEY_ID and CDP_API_KEY_SECRET in .env",
        )

    results: list[TxResult] = []

    async with CdpClient(
        api_key_id=api_key_id,
        api_key_secret=api_key_secret,
        wallet_secret=wallet_secret,
    ) as cdp:
        # get_or_create_account is atomic — won't fail if account already exists
        account = await cdp.evm.get_or_create_account(name=CDP_ACCOUNT_NAME)

        print(f"[execute] CDP wallet: {account.address}")

        for agent in allocation:
            amount_usd  = agent["amount_usd"]
            destination = agent["vault_address"]
            agent_name  = agent["name"]

            # USDC has 6 decimal places: $2707.01 → 2_707_010_000 atomic units
            atomic_amount = parse_units(str(amount_usd), 6)

            try:
                print(f"[execute] Sending ${amount_usd} USDC → {agent_name} ({destination})")
                tx_hash = await account.transfer(
                    to=destination,
                    amount=atomic_amount,
                    token=USDC_TOKEN,
                    network=NETWORK,
                )
                print(f"[execute] Broadcasted {agent_name}: tx {tx_hash}")
                
                # Wait for confirmation using Web3
                from web3 import Web3
                w3 = Web3(Web3.HTTPProvider(os.getenv("BASE_SEPOLIA_RPC_URL")))
                print(f"[execute] Waiting for confirmation of {tx_hash}...")
                receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                
                if receipt.status == 1:
                    print(f"[execute] ✅ {agent_name}: tx {tx_hash} confirmed")
                    results.append(TxResult(
                        agent_id=str(agent["agent_id"]),
                        tx_hash=tx_hash,
                        amount_usd=amount_usd,
                        status="success",
                    ))
                else:
                    print(f"[execute] ❌ {agent_name}: tx {tx_hash} reverted")
                    results.append(TxResult(
                        agent_id=str(agent["agent_id"]),
                        tx_hash=tx_hash,
                        amount_usd=amount_usd,
                        status="failed",
                    ))
            except Exception as e:
                print(f"[execute] ❌ {agent_name} transfer failed: {e}")
                results.append(TxResult(
                    agent_id=str(agent["agent_id"]),
                    tx_hash="",
                    amount_usd=amount_usd,
                    status="failed",
                ))

    return results


def execute_node(state: AllocatorState) -> dict:
    """LangGraph node: executes on-chain USDC transfers via Coinbase CDP SDK."""
    allocation = state.get("allocation", [])

    if not allocation:
        raise HTTPException(
            status_code=422,
            detail="Cannot execute — no allocation was computed. Run /chat first.",
        )

    tx_results = _run_async(_execute_transfers(allocation))
    return {"tx_results": tx_results}
