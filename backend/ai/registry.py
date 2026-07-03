# Shared web3.py client and contract instances for ERC-8004 registries.
# Call get_contracts() once at startup; reuse across nodes.

import json
import os
from pathlib import Path

from web3 import Web3

IDENTITY_REGISTRY_ADDRESS  = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
REPUTATION_REGISTRY_ADDRESS = "0x8004B663056A597Dffe9eCcC1965A193B7388713"

_ABIS_DIR = Path(__file__).parent / "abis"


def _load_abi(filename: str) -> list:
    with open(_ABIS_DIR / filename) as f:
        return json.load(f)


def get_web3() -> Web3:
    rpc_url = os.getenv("BASE_SEPOLIA_RPC_URL")
    if not rpc_url:
        raise RuntimeError("BASE_SEPOLIA_RPC_URL is not set in environment")
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise RuntimeError(f"Cannot connect to RPC at {rpc_url}")
    return w3


def get_contracts():
    w3 = get_web3()
    identity = w3.eth.contract(
        address=Web3.to_checksum_address(IDENTITY_REGISTRY_ADDRESS),
        abi=_load_abi("identity_registry.json"),
    )
    reputation = w3.eth.contract(
        address=Web3.to_checksum_address(REPUTATION_REGISTRY_ADDRESS),
        abi=_load_abi("reputation_registry.json"),
    )
    return w3, identity, reputation
