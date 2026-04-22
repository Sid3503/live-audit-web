"""LangGraph node: detects user journeys via BFS."""

import logging

from backend.core.journey_detector import detect_journeys
from backend.pipeline.state import PipelineState

logger = logging.getLogger(__name__)


def detect_journeys_node(state: PipelineState) -> PipelineState:
    """Detect journeys from nav graph using all three signal layers."""

    if not state.nav_graph:
        return state.model_copy(update={"status": "error", "error": "nav_graph missing"})
    journeys = detect_journeys(state.extracted_page, state.nav_graph, state.cta_classifications)

    if not journeys:
        logger.info("JOURNEYS | none detected")
    for j in journeys:
        path_preview = " → ".join(s.label[:30] for s in j.steps[:5])
        logger.info(
            "JOURNEY | type=%-8s | method=%-14s | conf=%.2f | steps=%d | clicks=%d | path: %s",
            j.type.value,
            j.detection_method.value,
            j.confidence,
            len(j.steps),
            j.click_count,
            path_preview,
        )

    return state.model_copy(update={"journeys": journeys, "status": "scoring_friction"})

