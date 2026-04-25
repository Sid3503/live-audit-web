"""LangGraph node: builds nav graph from extracted page."""

import logging

from backend.core.graph_builder import build_nav_graph
from backend.pipeline.state import PipelineState

logger = logging.getLogger(__name__)


def build_graph_node(state: PipelineState) -> PipelineState:
    """Build navigation graph and update pipeline state."""

    nav_graph = build_nav_graph(state.extracted_page)

    elements = state.extracted_page.elements
    by_id = {e.id: e for e in elements}
    root_el = by_id.get(nav_graph.root_id)

    primary          = [e for e in elements if e.importance.value == "primary"]
    secondary        = [e for e in elements if e.importance.value == "secondary"]
    tertiary         = [e for e in elements if e.importance.value == "tertiary"]
    viewport_primary = [e for e in primary if e.in_viewport]

    root_mode = (
        "viewport_primary" if viewport_primary
        else "global_primary" if primary
        else "non_tertiary_fallback"
    )

    logger.info(
        "NAV GRAPH | nodes=%d | edges=%d | root=%s (mode=%s importance=%s y=%.0f text='%s')",
        len(nav_graph.node_ids),
        len(nav_graph.edges),
        nav_graph.root_id,
        root_mode,
        root_el.importance.value if root_el else "?",
        root_el.position.y if root_el else -1,
        root_el.text[:40] if root_el else "?",
    )
    logger.info(
        "IMPORTANCE | primary=%d (viewport=%d) [%s] | secondary=%d | tertiary=%d [%s]",
        len(primary),
        len(viewport_primary),
        ", ".join(f'"{e.text[:25]}"' for e in primary[:5]),
        len(secondary),
        len(tertiary),
        ", ".join(f'"{e.text[:20]}"' for e in tertiary[:5]),
    )
    edge_rule_counts: dict[str, int] = {}
    for edge in nav_graph.edges:
        edge_rule_counts[edge.rule_name] = edge_rule_counts.get(edge.rule_name, 0) + 1
    logger.info("EDGE RULES | %s", " | ".join(f"{k}={v}" for k, v in edge_rule_counts.items()))

    return state.model_copy(update={"nav_graph": nav_graph, "status": "detecting_journeys"})

