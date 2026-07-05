"""
Assign a unique EOA vault address to each agent in agents_config.json.

Run this after upgrading from the shared-deployer-vault setup:

    cd /path/to/new_project
    python scripts/update_vault_addresses.py

Requirements:
    - scripts/agents_config.json must already exist (from register_agents.py)
    - Creates scripts/vault_keys.json (gitignored) with one key per agent vault

Each agent's USDC will be sent to its own address on future allocations.
Existing USDC on the old shared deployer address is not moved automatically.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from vaults import print_vault_summary, update_agents_config_vaults


def main():
    try:
        agents = update_agents_config_vaults()
    except FileNotFoundError as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    print("=" * 60)
    print("  Vault addresses updated in agents_config.json")
    print("=" * 60)
    for agent in agents:
        print(f"  {agent['name']:16} agent_id={agent['agent_id']}  vault={agent['vault_address']}")
    print_vault_summary()
    print("\n  Future allocations will send USDC to these per-agent vaults.")
    print("  View balances: https://sepolia.basescan.org")
    print("=" * 60)


if __name__ == "__main__":
    main()
