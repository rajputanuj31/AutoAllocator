"""On-chain USDC transfers from per-agent vault EOAs (withdraw path)."""

from __future__ import annotations

import json
import os
from decimal import Decimal, ROUND_DOWN
from pathlib import Path

from eth_account import Account
from fastapi import HTTPException
from web3 import Web3

AGENTS_CONFIG_PATH = Path(__file__).parent.parent.parent.parent / "scripts" / "agents_config.json"
VAULT_KEYS_PATH = Path(__file__).parent.parent.parent.parent / "scripts" / "vault_keys.json"

USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
USDC_DECIMALS = 6

ERC20_ABI = json.loads(
    """[
        {"constant":true,"inputs":[{"name":"account","type":"address"}],
         "name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"},
        {"constant":false,"inputs":[{"name":"to","type":"address"},{"name":"value","type":"uint256"}],
         "name":"transfer","outputs":[{"name":"","type":"bool"}],"type":"function"}
    ]"""
)


def _load_agent_config(agent_id: str) -> dict | None:
    if not AGENTS_CONFIG_PATH.exists():
        return None
    with open(AGENTS_CONFIG_PATH) as f:
        data = json.load(f)
    for agent in data.get("agents", []):
        if str(agent.get("agent_id")) == str(agent_id):
            return agent
    return None


def _vault_account_for_agent(agent_id: str) -> Account:
    config = _load_agent_config(agent_id)
    if not config:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found.")

    agent_name = config.get("name", "")
    if not VAULT_KEYS_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail="vault_keys.json not found. Ensure scripts/vault_keys.json is deployed on the server.",
        )

    with open(VAULT_KEYS_PATH) as f:
        keys = json.load(f)

    entry = keys.get(agent_name)
    if not entry or not entry.get("private_key"):
        raise HTTPException(
            status_code=500,
            detail=f"No vault key for agent '{agent_name}'.",
        )

    return Account.from_key(entry["private_key"])


def _usd_to_atomic(amount_usd: float) -> int:
    d = Decimal(str(amount_usd)).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
    return int(d * (10 ** USDC_DECIMALS))


def _get_w3() -> Web3:
    rpc = os.getenv("BASE_SEPOLIA_RPC_URL")
    if not rpc:
        raise HTTPException(status_code=500, detail="BASE_SEPOLIA_RPC_URL not configured.")
    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        raise HTTPException(status_code=500, detail="Cannot connect to Base Sepolia RPC.")
    return w3


MIN_VAULT_ETH_WEI = Web3.to_wei(0.00005, "ether")
TOP_UP_ETH_WEI = Web3.to_wei(0.002, "ether")


def _deployer_account(w3: Web3) -> Account | None:
    pk = os.getenv("DEPLOYER_PRIVATE_KEY")
    if not pk:
        return None
    return w3.eth.account.from_key(pk)


def _ensure_vault_has_gas(w3: Web3, vault_address: str) -> None:
    """Top up agent vault ETH from deployer so it can sign USDC transfers."""
    if w3.eth.get_balance(vault_address) >= MIN_VAULT_ETH_WEI:
        return

    deployer = _deployer_account(w3)
    if not deployer:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Agent vault {vault_address} needs Base Sepolia ETH for gas. "
                "Ensure DEPLOYER_PRIVATE_KEY is set for auto top-up."
            ),
        )

    deployer_balance = w3.eth.get_balance(deployer.address)
    if deployer_balance < TOP_UP_ETH_WEI + w3.to_wei(0.0001, "ether"):
        raise HTTPException(
            status_code=422,
            detail="Deployer wallet has insufficient ETH to fund vault gas.",
        )

    nonce = w3.eth.get_transaction_count(deployer.address, "pending")
    tx = {
        "nonce": nonce,
        "to": Web3.to_checksum_address(vault_address),
        "value": TOP_UP_ETH_WEI,
        "gas": 21_000,
        "maxFeePerGas": w3.eth.gas_price * 2,
        "maxPriorityFeePerGas": w3.to_wei(0.001, "gwei"),
        "chainId": w3.eth.chain_id,
    }
    signed = deployer.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt.status != 1:
        raise HTTPException(status_code=500, detail="Failed to fund vault gas.")


def transfer_usdc_from_vault(
    *,
    agent_id: str,
    to_address: str,
    amount_usd: float,
) -> str:
    """Send USDC from an agent vault EOA to the user's wallet. Returns tx hash."""
    account = _vault_account_for_agent(agent_id)
    w3 = _get_w3()
    usdc = w3.eth.contract(
        address=Web3.to_checksum_address(USDC_ADDRESS),
        abi=ERC20_ABI,
    )

    amount_atomic = _usd_to_atomic(amount_usd)
    if amount_atomic <= 0:
        raise HTTPException(status_code=400, detail="Withdraw amount must be positive.")

    vault_balance = usdc.functions.balanceOf(account.address).call()
    if vault_balance < amount_atomic:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Agent vault has insufficient USDC on-chain "
                f"(${vault_balance / 10 ** USDC_DECIMALS:.2f} available)."
            ),
        )

    eth_balance = w3.eth.get_balance(account.address)
    if eth_balance < MIN_VAULT_ETH_WEI:
        _ensure_vault_has_gas(w3, account.address)

    nonce = w3.eth.get_transaction_count(account.address, "pending")
    tx = usdc.functions.transfer(
        Web3.to_checksum_address(to_address),
        amount_atomic,
    ).build_transaction({
        "from": account.address,
        "nonce": nonce,
        "gas": 100_000,
        "maxFeePerGas": w3.eth.gas_price * 2,
        "maxPriorityFeePerGas": w3.to_wei(0.001, "gwei"),
        "chainId": w3.eth.chain_id,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt.status != 1:
        raise HTTPException(status_code=500, detail=f"Withdraw tx reverted: {tx_hash.hex()}")
    return tx_hash.hex()
