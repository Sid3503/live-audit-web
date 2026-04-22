"""
LangGraph node: LLM batch classification of primary CTAs.

Runs BEFORE detect_journeys. Takes all visible primary CTAs that the heuristic
signal list and regex patterns might miss (branded CTAs, marketing copy, non-English),
and asks the LLM to classify them by journey type in a single cheap call.

Result is stored in state.cta_classifications {element_id → journey_type_str}
and consumed by detect_journeys as a third signal source.

Gracefully degrades: any failure leaves cta_classifications empty.
"""

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from backend.models.journey import JourneyType
from backend.pipeline.nodes.llm_provider import invoke_with_fallback
from backend.pipeline.state import PipelineState

logger = logging.getLogger(__name__)

_VALID_TYPES = {t.value for t in JourneyType}

_SYSTEM = """You classify UI button and link labels into UX journey types.

Journey types:
- signup: starting a free trial, creating an account, getting started, joining
- pricing: viewing plans, pricing, costs, billing
- contact: requesting/booking a demo, talking to sales, getting in touch
- purchase: buying, checking out, adding to cart, upgrading to paid
- explore: learning more, discovering features, watching a tour, reading about the product
- none: utility actions — login, logout, search, menu, close, share, language switch, legal links

Rules:
- Classify by INTENT, not just keywords. "Get Notion free" = signup. "Talk to an expert" = contact.
- Skip "none" items — only return items you are confident about.
- Respond ONLY with valid JSON."""

_PROMPT = """Classify these button/link labels. Include only items where you are confident.

{labels}

Return: {{"classifications": [{{"index": 0, "type": "signup"}}, ...]}}"""


def classify_ctas_node(state: PipelineState) -> PipelineState:
    """LLM batch classify primary CTAs not already matched by heuristics."""
    candidates = [
        e for e in state.extracted_page.elements
        if e.role.value == "cta" and e.importance.value == "primary" and e.text.strip()
    ]

    if not candidates:
        return state

    label_lines = "\n".join(f"{i}: {e.text.strip()}" for i, e in enumerate(candidates))
    logger.info(
        "CTA CLASSIFY | sending %d candidates: [%s]",
        len(candidates),
        ", ".join(f'"{e.text.strip()[:40]}"' for e in candidates),
    )

    try:
        messages = [
            SystemMessage(content=_SYSTEM),
            HumanMessage(content=_PROMPT.format(labels=label_lines)),
        ]
        raw, provider = invoke_with_fallback(messages, json_mode=True, max_tokens_override=512)
        data = json.loads(raw)

        classifications: dict[str, str] = {}
        for item in data.get("classifications", []):
            idx = item.get("index")
            jtype = str(item.get("type", "")).lower().strip()
            if isinstance(idx, int) and 0 <= idx < len(candidates) and jtype in _VALID_TYPES:
                classifications[candidates[idx].id] = jtype

        logger.info("CTA classifications via %s: %s", provider, classifications)
        return state.model_copy(update={"cta_classifications": classifications})

    except Exception as e:
        logger.warning("CTA classification failed (%s) — continuing without LLM labels", e)
        return state
