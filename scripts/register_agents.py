"""
scripts/register_agents.py

One-time setup: Registers 3 mock trading agents on the ERC-8004 Identity Registry
and submits reputation feedback scores to the Reputation Registry on Base Sepolia.

Run once before starting the backend:
    cd /path/to/auto-allocator
    python scripts/register_agents.py

Requirements:
    - BASE_SEPOLIA_RPC_URL in .env
    - DEPLOYER_PRIVATE_KEY in .env (wallet with Base Sepolia ETH)
    - web3 installed: pip install web3

After running, agentIds are saved to scripts/agents_config.json.
"""

import base64
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from web3 import Web3

load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

IDENTITY_REGISTRY_ADDRESS  = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
REPUTATION_REGISTRY_ADDRESS = "0x8004B663056A597Dffe9eCcC1965A193B7388713"

IDENTITY_ABI  = json.loads(
    (Path(__file__).parent.parent / "backend" / "ai" / "abis" / "identity_registry.json").read_text()
)
REPUTATION_ABI = json.loads(
    (Path(__file__).parent.parent / "backend" / "ai" / "abis" / "reputation_registry.json").read_text()
)

CONFIG_OUTPUT = Path(__file__).parent / "agents_config.json"

# Vault addresses: in a real deployment these would be smart contract vaults.
# For testing we use the deployer address itself (funds go back to you).
MOCK_VAULT_PLACEHOLDER = "DEPLOYER_ADDRESS"

AGENTS = [
    {
        "name": "YieldMaximizer",
        "description": "Optimizes stable yield via AAVE and Compound lending pools.",
        "strategy": "yield",
        "feedback_score": 850,
    },
    {
        "name": "StableFarmer",
        "description": "Conservative yield strategy prioritising capital preservation.",
        "strategy": "yield",
        "feedback_score": 720,
    },
    {
        "name": "SybilBot",
        "description": "Suspicious agent with minimal track record. Should be filtered out.",
        "strategy": "yield",
        "feedback_score": 50,
    },
]


def build_agent_uri(agent: dict, vault_address: str) -> str:
    card = {
        "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        "name": agent["name"],
        "description": agent["description"],
        "image": "",
        "services": [],
        "x402Support": False,
        "active": True,
        "registrations": [],
        "supportedTrust": ["reputation"],
        "strategy": agent["strategy"],
        "vault": vault_address,
    }
    encoded = base64.b64encode(json.dumps(card).encode()).decode()
    return f"data:application/json;base64,{encoded}"


def send_tx(w3, contract_fn, account):
    nonce = w3.eth.get_transaction_count(account.address, "pending")
    tx = contract_fn.build_transaction({
        "from": account.address,
        "nonce": nonce,
        "gasPrice": w3.eth.gas_price,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  tx: {tx_hash.hex()} — waiting for receipt...")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt.status != 1:
        raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")
    return receipt


def main():
    rpc_url = os.getenv("BASE_SEPOLIA_RPC_URL")
    private_key = os.getenv("DEPLOYER_PRIVATE_KEY")

    if not rpc_url or not private_key:
        print("ERROR: BASE_SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY must be set in .env")
        sys.exit(1)

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        print(f"ERROR: Cannot connect to RPC: {rpc_url}")
        sys.exit(1)

    account = w3.eth.account.from_key(private_key)
    balance = w3.eth.get_balance(account.address)
    print(f"\nDeployer: {account.address}")
    print(f"Balance:  {w3.from_wei(balance, 'ether'):.6f} ETH")

    if balance < w3.to_wei(0.005, "ether"):
        print("\nWARNING: Low balance. Get Sepolia ETH at https://www.alchemy.com/faucets/base-sepolia")

    # Generate a random client account to leave feedback (smart contract prevents self-feedback)
    client_account = w3.eth.account.create()
    print(f"\nClient (Feedback Submitter): {client_account.address}")
    print(f"Funding client with 0.002 ETH for gas...")
    fund_tx = {
        "to": client_account.address,
        "value": w3.to_wei(0.002, "ether"),
        "gas": 21000,
        "gasPrice": w3.eth.gas_price,
        "nonce": w3.eth.get_transaction_count(account.address, "pending"),
    }
    signed_fund = account.sign_transaction(fund_tx)
    fund_hash = w3.eth.send_raw_transaction(signed_fund.raw_transaction)
    w3.eth.wait_for_transaction_receipt(fund_hash)
    print("Client funded successfully!")

    identity   = w3.eth.contract(address=Web3.to_checksum_address(IDENTITY_REGISTRY_ADDRESS),  abi=IDENTITY_ABI)
    reputation = w3.eth.contract(address=Web3.to_checksum_address(REPUTATION_REGISTRY_ADDRESS), abi=REPUTATION_ABI)

    registered = []

    for agent in AGENTS:
        print(f"\n{'='*60}")
        print(f"  Registering: {agent['name']}")

        vault_address = account.address
        agent_uri = build_agent_uri(agent, vault_address)

        receipt = send_tx(w3, identity.functions.register(agent_uri), account)

        # Parse agentId from the Registered event
        logs = identity.events.Registered().process_receipt(receipt)
        if not logs:
            raise RuntimeError("Registered event not found in receipt")
        agent_id = logs[0].args.agentId
        reg_block = receipt.blockNumber
        print(f"  Registered with agentId: {agent_id} at block {reg_block}")

        # Submit reputation feedback with retry to handle RPC sync lag
        print(f"  Submitting feedback score: {agent['feedback_score']}")
        max_retries = 3
        for attempt in range(max_retries):
            try:
                send_tx(
                    w3,
                    reputation.functions.giveFeedback(
                        agent_id,
                        agent["feedback_score"],
                        0,
                        "yield",
                        "",
                        "",
                        "",
                        b"\x00" * 32,
                    ),
                    client_account,
                )
                print(f"  Feedback submitted.")
                break
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"  RPC lag detected (attempt {attempt+1}/{max_retries}). Retrying in 5s...")
                    time.sleep(5)
                else:
                    raise e


        registered.append({
            "agent_id":          agent_id,
            "name":              agent["name"],
            "strategy":          agent["strategy"],
            "vault_address":     vault_address,
            "registration_block": reg_block,
        })
        time.sleep(1)

    config = {"agents": registered}
    CONFIG_OUTPUT.write_text(json.dumps(config, indent=2))
    print(f"\n{'='*60}")
    print(f"  agents_config.json saved to {CONFIG_OUTPUT}")
    print(f"\n  View your agents on 8004scan: https://8004scan.io")
    print(f"  Verify on BaseScan: https://sepolia.basescan.org")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
