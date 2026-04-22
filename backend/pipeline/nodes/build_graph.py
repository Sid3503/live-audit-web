"""LangGraph node: builds nav graph from extracted page."""

import logging

from backend.core.graph_builder import build_nav_graph
from backend.pipeline.state import PipelineState

logger = logging.getLogger(__name__)


def build_graph_node(state: PipelineState) -> PipelineState:
    """Build navigation graph and update pipeline state."""

    nav_graph = build_nav_graph(state.extracted_page)
    logger.info(
        "NAV GRAPH | nodes=%d | edges=%d | root=%s",
        len(nav_graph.node_ids),
        len(nav_graph.edges),
        nav_graph.root_id,
    )
    return state.model_copy(update={"nav_graph": nav_graph, "status": "detecting_journeys"})

