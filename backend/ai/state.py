from typing import Optional
from typing_extensions import TypedDict


class ParsedIntent(TypedDict):
    action: str          # "invest" | "withdraw" | "rebalance"
    amount_usd: float    # dollar amount the user wants to act on (0 = all for withdraw)
    risk_tolerance: str  # "low" | "medium" | "high"
    strategy: str        # "yield" | "growth" | "stable"
    target_agent: str    # optional agent name for withdraw/rebalance; empty = all


class AgentAllocation(TypedDict):
    agent_id: str        # on-chain address of the agent
    name: str            # human-readable agent name
    score: int           # ERC-8004 reputation score (0–1000)
    strategy: str        # strategy this agent runs
    percentage: float    # share of total capital assigned to this agent (0–100)
    amount_usd: float    # exact USD amount routed to this agent
    vault_address: str   # contract address where USDC will be sent


class TxResult(TypedDict):
    agent_id: str        # agent this transaction targets
    tx_hash: str         # on-chain transaction hash
    amount_usd: float    # amount sent in this transaction
    status: str          # "success" | "failed"


class AllocatorState(TypedDict):
    user_message: str                    # raw natural language input from the user
    wallet_address: str                  # JWT-authenticated wallet for this session
    flow_type: str                       # "invest" | "withdraw"
    parsed_intent: Optional[ParsedIntent]  # structured intent extracted by the LLM
    candidates: list[dict]               # agents returned by the discovery node
    allocation: list[AgentAllocation]    # final capital split (invest) or withdraw plan
    tx_results: list[TxResult]           # results of on-chain transfers
