"""LangGraph node: applies friction rules to all journeys and page-level structural rules once."""

import logging

from backend.core.rule_engine import evaluate_friction, evaluate_page_friction
from backend.pipeline.state import PipelineState

logger = logging.getLogger(__name__)


def score_friction_node(state: PipelineState) -> PipelineState:
    """Evaluate per-journey friction and page-level structural friction."""

    scored = [evaluate_friction(j, state.extracted_page) for j in state.journeys]
    page_fps = evaluate_page_friction(state.extracted_page)

    for j in scored:
        if j.friction_points:
            for fp in j.friction_points:
                logger.info(
                    "FRICTION | journey=%-8s | rule=%-25s | severity=%-8s | %s",
                    j.type.value,
                    fp.type,
                    fp.severity.value,
                    fp.description[:80],
                )
        else:
            logger.info("FRICTION | journey=%-8s | no issues", j.type.value)

    for fp in page_fps:
        logger.info(
            "FRICTION | scope=PAGE       | rule=%-25s | severity=%-8s | %s",
            fp.type,
            fp.severity.value,
            fp.description[:80],
        )

    total_journey_fps = sum(len(j.friction_points) for j in scored)
    logger.info(
        "FRICTION SUMMARY | journey_issues=%d | page_issues=%d",
        total_journey_fps,
        len(page_fps),
    )

    return state.model_copy(update={"journeys": scored, "page_friction_points": page_fps, "status": "auditing"})

