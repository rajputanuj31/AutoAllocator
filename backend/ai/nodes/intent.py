from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from ai.state import AllocatorState, ParsedIntent


class IntentSchema(BaseModel):
    action: str = Field(
        description="The financial action the user wants to perform. One of: 'invest', 'withdraw', 'rebalance'."
    )
    amount_usd: float = Field(
        description="The amount in USD the user wants to act on. Must be a positive number."
    )
    risk_tolerance: str = Field(
        description="The user's risk appetite. One of: 'low', 'medium', 'high'."
    )
    strategy: str = Field(
        description="The investment strategy. One of: 'yield' (stable income), 'growth' (capital appreciation), 'stable' (capital preservation)."
    )
    target_agent: str = Field(
        default="",
        description="For withdraw/rebalance: specific agent name (e.g. 'YieldMaximizer'). Leave empty to act on all held positions.",
    )


SYSTEM_PROMPT = """You are an intent parser for a DeFi capital allocation system.

Your job is to extract structured investment intent from a user's natural language message.

Rules:
- If the user mentions "safe", "stable income", or "yield farming", set strategy to "yield" and risk_tolerance to "low".
- If the user mentions "growth", "moonshot", or "aggressive", set strategy to "growth" and risk_tolerance to "high".
- If the user wants to pull funds back, redeem, or exit, set action to "withdraw".
- For withdraw: set amount_usd to the requested amount; if they say "all" or "everything", set amount_usd to 0.
- For withdraw targeting one agent, set target_agent to the agent name mentioned; otherwise leave target_agent empty.
- If the user does not specify an amount for invest, default amount_usd to 0 and the frontend will prompt them.
- Always return valid JSON matching the schema. Never guess beyond what the user said.
"""

def intent_node(state: AllocatorState) -> dict:
    llm = ChatOpenAI(model="gpt-4o", temperature=0).with_structured_output(IntentSchema)
    result: IntentSchema = llm.invoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=state["user_message"]),
    ])

    parsed: ParsedIntent = {
        "action": result.action,
        "amount_usd": result.amount_usd,
        "risk_tolerance": result.risk_tolerance,
        "strategy": result.strategy,
        "target_agent": (result.target_agent or "").strip(),
    }

    flow_type = "withdraw" if parsed["action"] == "withdraw" else "invest"
    return {"parsed_intent": parsed, "flow_type": flow_type}
