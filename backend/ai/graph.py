from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver

from ai.state import AllocatorState
from ai.nodes.intent import intent_node
from ai.nodes.discover import discover_node
from ai.nodes.filter import filter_node
from ai.nodes.allocate import allocate_node


def build_graph():
    builder = StateGraph(AllocatorState)

    builder.add_node("intent",   intent_node)
    builder.add_node("discover", discover_node)
    builder.add_node("filter",   filter_node)
    builder.add_node("allocate", allocate_node)

    builder.add_edge(START, "intent")
    builder.add_edge("intent",   "discover")
    builder.add_edge("discover", "filter")
    builder.add_edge("filter",   "allocate")
    builder.add_edge("allocate", END)

    checkpointer = MemorySaver()
    return builder.compile(checkpointer=checkpointer)


graph = build_graph()
