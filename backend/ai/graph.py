from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver

from ai.state import AllocatorState
from ai.nodes.intent import intent_node
from ai.nodes.discover import discover_node
from ai.nodes.filter import filter_node
from ai.nodes.allocate import allocate_node
from ai.nodes.execute import execute_invest_node
from ai.nodes.execute_withdraw import execute_withdraw_node
from ai.nodes.withdraw_plan import withdraw_plan_node


def _route_after_intent(state: AllocatorState) -> str:
    if state.get("flow_type") == "withdraw":
        return "withdraw_plan"
    return "discover"


def _route_after_withdraw_plan(state: AllocatorState) -> str:
    if state.get("allocation"):
        return "execute_withdraw"
    return END


def build_graph():
    builder = StateGraph(AllocatorState)

    builder.add_node("intent", intent_node)
    builder.add_node("discover", discover_node)
    builder.add_node("filter", filter_node)
    builder.add_node("allocate", allocate_node)
    builder.add_node("withdraw_plan", withdraw_plan_node)
    builder.add_node("execute_invest", execute_invest_node)
    builder.add_node("execute_withdraw", execute_withdraw_node)

    builder.add_edge(START, "intent")
    builder.add_conditional_edges(
        "intent",
        _route_after_intent,
        {"withdraw_plan": "withdraw_plan", "discover": "discover"},
    )
    builder.add_edge("discover", "filter")
    builder.add_edge("filter", "allocate")
    builder.add_edge("allocate", "execute_invest")
    builder.add_edge("execute_invest", END)
    builder.add_conditional_edges(
        "withdraw_plan",
        _route_after_withdraw_plan,
        {"execute_withdraw": "execute_withdraw", END: END},
    )
    builder.add_edge("execute_withdraw", END)

    checkpointer = MemorySaver()
    return builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["execute_invest", "execute_withdraw"],
    )


graph = build_graph()
