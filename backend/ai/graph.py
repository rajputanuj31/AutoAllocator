from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver

from ai.state import AllocatorState
from ai.nodes.intent import intent_node
from ai.nodes.discover import discover_node
from ai.nodes.filter import filter_node
from ai.nodes.allocate import allocate_node
from ai.nodes.execute import execute_node


def build_graph():
    builder = StateGraph(AllocatorState)

    builder.add_node("intent",   intent_node)
    builder.add_node("discover", discover_node)
    builder.add_node("filter",   filter_node)
    builder.add_node("allocate", allocate_node)
    builder.add_node("execute",  execute_node)

    builder.add_edge(START,      "intent")
    builder.add_edge("intent",   "discover")
    builder.add_edge("discover", "filter")
    builder.add_edge("filter",   "allocate")
    builder.add_edge("allocate", "execute")
    builder.add_edge("execute",  END)

    checkpointer = MemorySaver()
    # interrupt_before="execute" pauses the graph after allocation is computed,
    # before any on-chain transfer is sent. The /approve endpoint resumes it.
    return builder.compile(
        checkpointer=checkpointer,
        interrupt_before=["execute"],
    )


graph = build_graph()
