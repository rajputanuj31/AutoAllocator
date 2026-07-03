from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from ai.state import AllocatorState
from ai.nodes.intent import intent_node


def build_graph():
    builder = StateGraph(AllocatorState)

    builder.add_node("intent", intent_node)

    builder.set_entry_point("intent")
    builder.add_edge("intent", END)

    checkpointer = MemorySaver()
    return builder.compile(checkpointer=checkpointer)


graph = build_graph()
