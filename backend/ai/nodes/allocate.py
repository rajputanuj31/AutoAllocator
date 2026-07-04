from ai.state import AllocatorState, AgentAllocation

def allocate_node(state: AllocatorState) -> dict:
    candidates = state.get("candidates", [])
    intent = state.get("parsed_intent", {})
    amount_usd = intent.get("amount_usd", 0.0)

    if not candidates or amount_usd <= 0:
        return {"allocation": []}

    total_score = sum(c.get("score", 0) for c in candidates)
    
    allocation: list[AgentAllocation] = []
    
    if total_score > 0:
        for c in candidates:
            score = c.get("score", 0)
            percentage = (score / total_score) * 100
            amt = (score / total_score) * amount_usd
            
            alloc: AgentAllocation = {
                "agent_id": str(c["agent_id"]),
                "name": c["name"],
                "score": score,
                "strategy": c.get("strategy", ""),
                "percentage": round(percentage, 2),
                "amount_usd": round(amt, 2),
                "vault_address": c.get("vault_address", "")
            }
            allocation.append(alloc)
            
    return {"allocation": allocation}
