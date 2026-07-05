"""Verify on-chain USDC transfers for wallet-funded investments."""

from __future__ import annotations

import os
from decimal import Decimal, ROUND_DOWN

from fastapi import HTTPException
from web3 import Web3

USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
USDC_DECIMALS = 6
TRANSFER_SELECTOR = bytes.fromhex("a9059cbb")
TRANSFER_TOPIC = Web3.keccak(text="Transfer(address,address,uint256)")


def _get_w3() -> Web3:
    rpc = os.getenv("BASE_SEPOLIA_RPC_URL")
    if not rpc:
        raise HTTPException(status_code=500, detail="BASE_SEPOLIA_RPC_URL not configured.")
    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        raise HTTPException(status_code=500, detail="Cannot connect to Base Sepolia RPC.")
    return w3


def _usd_to_atomic(amount_usd: float) -> int:
    d = Decimal(str(amount_usd)).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
    return int(d * (10 ** USDC_DECIMALS))


def _topic_matches(a: bytes, b: bytes) -> bool:
    return bytes(a) == bytes(b)


def _address_from_topic(topic) -> str:
    return Web3.to_checksum_address(bytes(topic)[-20:])


def _match_from_receipt_logs(
    receipt,
    *,
    expected_from: str,
    expected_to: str,
    expected_atomic: int,
) -> bool:
    """Match USDC Transfer event — works for EOAs and smart / embedded wallets."""
    for log in receipt["logs"]:
        if log["address"].lower() != USDC_ADDRESS.lower():
            continue
        topics = log.get("topics") or []
        if len(topics) < 3:
            continue
        if not _topic_matches(topics[0], TRANSFER_TOPIC):
            continue

        from_addr = _address_from_topic(topics[1])
        to_addr = _address_from_topic(topics[2])
        data = log.get("data") or b""
        amount_atomic = int.from_bytes(bytes(data), "big") if data else 0

        if from_addr.lower() != expected_from.lower():
            continue
        if to_addr.lower() != expected_to.lower():
            continue
        if amount_atomic != expected_atomic:
            continue
        return True
    return False


def _match_from_tx_input(
    tx,
    *,
    expected_from: str,
    expected_to: str,
    expected_atomic: int,
) -> bool:
    """Direct EOA call to USDC.transfer — fallback when logs are unavailable."""
    if tx["to"] is None or tx["to"].lower() != USDC_ADDRESS.lower():
        return False
    if tx["from"].lower() != expected_from.lower():
        return False

    raw_input = bytes(tx["input"])
    if len(raw_input) < 68 or raw_input[:4] != TRANSFER_SELECTOR:
        return False

    to_addr = Web3.to_checksum_address(raw_input[16:36])
    amount_atomic = int.from_bytes(raw_input[36:68], "big")
    return (
        to_addr.lower() == expected_to.lower()
        and amount_atomic == expected_atomic
    )


def verify_usdc_transfer(
    *,
    tx_hash: str,
    expected_from: str,
    expected_to: str,
    expected_amount_usd: float,
) -> None:
    """Raise HTTPException if the tx is not a valid USDC transfer matching expectations."""
    w3 = _get_w3()
    expected_atomic = _usd_to_atomic(expected_amount_usd)

    try:
        receipt = w3.eth.get_transaction_receipt(tx_hash)
        tx = w3.eth.get_transaction(tx_hash)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid transaction hash: {e}") from e

    if receipt["status"] != 1:
        raise HTTPException(status_code=400, detail=f"Transaction {tx_hash} reverted.")

    kwargs = {
        "expected_from": expected_from,
        "expected_to": expected_to,
        "expected_atomic": expected_atomic,
    }

    if _match_from_receipt_logs(receipt, **kwargs) or _match_from_tx_input(tx, **kwargs):
        return

    raise HTTPException(
        status_code=400,
        detail=(
            "No matching USDC transfer found in this transaction "
            f"(expected ${expected_amount_usd:.2f} from your wallet to {expected_to})."
        ),
    )
