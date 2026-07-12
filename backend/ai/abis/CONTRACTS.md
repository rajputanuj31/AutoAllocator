# ERC-8004 contract pin

AutoAllocator does **not** fork or redeploy the Identity / Reputation registries.
It calls the canonical ERC-8004 deployments on Base Sepolia.

## Source

| Field | Value |
|-------|--------|
| Upstream | [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) |
| Pinned commit | `68fc6765761a10fb26f0692df21c8a6f9d12b1be` (master, 2026-06-11) |
| ABI files copied from | `abis/IdentityRegistry.json`, `abis/ReputationRegistry.json` |

Local copies (loaded by `ai/registry.py`):

- `identity_registry.json` ← upstream `IdentityRegistry.json`
- `reputation_registry.json` ← upstream `ReputationRegistry.json`

## Base Sepolia addresses

| Registry | Address |
|----------|---------|
| Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

These match the upstream README deployment table for Base Sepolia / Ethereum Sepolia testnets.

## Refreshing ABIs

When intentionally upgrading the pin:

```bash
PIN=<new_commit_sha>
curl -sL "https://raw.githubusercontent.com/erc-8004/erc-8004-contracts/${PIN}/abis/IdentityRegistry.json" \
  -o backend/ai/abis/identity_registry.json
curl -sL "https://raw.githubusercontent.com/erc-8004/erc-8004-contracts/${PIN}/abis/ReputationRegistry.json" \
  -o backend/ai/abis/reputation_registry.json
```

Then update the pinned commit in this file. Do not hand-edit the ABI JSON.
