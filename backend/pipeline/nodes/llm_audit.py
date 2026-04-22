"""
LangGraph node: AI validating auditor (OpenAI primary, LLM fallback).

Auditor's job:
  1. Validate heuristic friction findings — dispute false positives with reasoning
  2. Add net-new observations about page context (trust, cognitive load, hierarchy)
  3. Generate summary and recommendations AFTER validation, not before
"""

import json
import logging
import re
from datetime import datetime, timezone

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field, ValidationError

from backend.core.score_calculator import compute_overall_score, compute_page_floor, score_to_label
from backend.models.report import AuditReport, DisputedFinding, LLMObservation, NavSnapshot
from backend.pipeline.nodes.llm_provider import invoke_with_fallback, invoke_with_vision
from backend.pipeline.state import PipelineState

logger = logging.getLogger(__name__)

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
_JSON_OBJECT_RE = re.compile(r"\{[\s\S]*\}")


class _DisputedItem(BaseModel):
    rule_id: str
    severity: str
    dispute_reason: str


class LLMValidatedOutput(BaseModel):
    """Pydantic schema for LLM structured response."""

    summary: str
    recommendations: list[str] = Field(min_length=2, max_length=5)
    disputed_findings: list[_DisputedItem] = Field(default_factory=list)
    observations: list[dict] = Field(default_factory=list)
    suggested_questions: list[str] = Field(default_factory=list)


_SYSTEM_PROMPT = """You are a senior UX auditor reviewing automated analysis of a webpage.

You will receive:
- Page metadata (title, URL, element counts)
- Detected user journeys with steps and click counts
- Heuristic friction findings (rule ID, severity, description, confidence)

Your tasks:
1. VALIDATE each friction finding — if a finding is likely a false positive, dispute it.
2. OBSERVE — add 2-3 UX observations that heuristics cannot detect.
3. SUMMARIZE — write 2 sentences summarizing real UX health.
4. RECOMMEND — write 2-5 specific actions.
5. QUESTIONS — Provide 3 insightful follow-up questions about this exact page that a user might want to ask you (the AI) in the chat panel. Make them specifically related to the extracted content and context.

Critical rules:
- Only dispute findings when you have clear reasoning.
- Respond ONLY with valid JSON. No markdown, no preamble.

JSON schema you must return:
{
  "summary": "string",
  "recommendations": ["string", ...],
  "disputed_findings": [
    {"rule_id": "string", "severity": "string", "dispute_reason": "string"}
  ],
  "observations": [
    {"observation": "string", "severity": "low|medium|high", "category": "string"}
  ],
  "suggested_questions": ["string", "string", "string"]
}"""


def _build_audit_prompt(state: PipelineState, overall_score: int) -> str:  # noqa: C901
    meta = state.extracted_page.metadata
    sample_texts = [
        e.text for e in state.extracted_page.elements
        if e.role.value in ("cta", "nav") and e.text
    ][:12]

    page_friction_items = [
        f"  rule_id={fp.type} | severity={fp.severity.value} | scope=PAGE | description={fp.description}"
        for fp in state.page_friction_points
    ]

    friction_items = [
        f"  rule_id={fp.type} | severity={fp.severity.value} | "
        f"journey={j.type.value} | confidence={j.confidence:.1f} | "
        f"description={fp.description}"
        for j in state.journeys
        for fp in j.friction_points
    ]

    all_friction_items = page_friction_items + friction_items

    journey_summaries = [
        f"  [{j.type.value}] {len(j.steps)} steps, {j.click_count} clicks, "
        f"method={j.detection_method.value}, confidence={j.confidence:.1f}\n"
        f"    path: {' → '.join(s.label[:40] for s in j.steps[:5])}"
        for j in state.journeys
    ]

    # Surface extraction quality so the LLM calibrates confidence appropriately
    extraction_warnings: list[str] = []
    if meta.total_elements == 0:
        extraction_warnings.append("WARNING: Zero elements extracted — page may use heavy JS rendering or CSP blocks. Do NOT make visual claims.")
    elif meta.total_elements < 5:
        extraction_warnings.append(f"WARNING: Only {meta.total_elements} elements extracted — extraction may be incomplete. Limit observations to what the data shows.")
    if meta.cta_count == 0:
        extraction_warnings.append("NOTE: No CTAs extracted — this may reflect a genuinely sparse page OR missed selectors. Avoid asserting 'no call to action' as fact.")
    text_match_only = state.journeys and all(
        j.detection_method.value == "text_match" for j in state.journeys
    )
    if text_match_only:
        extraction_warnings.append("NOTE: All journeys found via text matching (lower confidence) — graph traversal found no linked path. Be appropriately uncertain about journey depth claims.")

    extraction_note = "\n".join(extraction_warnings)

    return f"""Page: {state.extracted_page.title}
URL: {state.extracted_page.url}
Score (pre-validation): {overall_score}/100
Elements: {meta.total_elements} total | {meta.cta_count} CTAs | {meta.form_count} forms | {meta.nav_count} nav links

{extraction_note + chr(10) if extraction_note else ""}Key interactive elements found:
{chr(10).join(f'  - {t}' for t in sample_texts) or '  (none)'}

Detected journeys:
{chr(10).join(journey_summaries) or '  (none detected)'}

Heuristic friction findings to validate:
{chr(10).join(all_friction_items) or '  (none)'}

Return your JSON validation now."""


def _repair_json(text: str) -> str:
    """Best-effort repair for truncated JSON: close open strings then containers in stack order."""
    stack: list[str] = []
    in_str = False
    escape_next = False
    for ch in text:
        if escape_next:
            escape_next = False
            continue
        if ch == "\\" and in_str:
            escape_next = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in ("}", "]") and stack:
            stack.pop()
    if in_str:
        text += '"'
    text += "".join(reversed(stack))
    return text


def _parse_llm_output(raw_text: str) -> LLMValidatedOutput:
    text = raw_text.strip()
    text = _FENCE_RE.sub("", text).strip()
    match = _JSON_OBJECT_RE.search(text)
    if match:
        text = match.group(0).strip()
    try:
        return LLMValidatedOutput.model_validate(json.loads(text))
    except json.JSONDecodeError:
        logger.warning("JSON malformed — attempting repair")
        return LLMValidatedOutput.model_validate(json.loads(_repair_json(text)))


def _fallback_output() -> tuple[str, list[str], list, list]:
    return (
        "Automated heuristic analysis complete. Manual review recommended for accuracy.",
        [
            "Review high-severity friction findings manually.",
            "Verify journey paths reflect real user intent.",
        ],
        [],
        [],
    )


def llm_audit_node(state: PipelineState) -> PipelineState:
    """Run AI validation (OpenAI primary, LLM fallback) and build final AuditReport."""

    overall_score = compute_overall_score(state.journeys, page_friction_points=state.page_friction_points)
    label = score_to_label(overall_score)

    disputed: list[DisputedFinding] = []
    observations: list[LLMObservation] = []
    summary = ""
    recommendations: list[str] = []

    try:
        audit_prompt = _build_audit_prompt(state, overall_score)
        if state.screenshot:
            raw, provider = invoke_with_vision(_SYSTEM_PROMPT, audit_prompt, state.screenshot)
            logger.info("Audit completed via %s (vision)", provider)
        else:
            messages = [
                SystemMessage(content=_SYSTEM_PROMPT),
                HumanMessage(content=audit_prompt),
            ]
            raw, provider = invoke_with_fallback(messages, json_mode=True)
            logger.info("Audit completed via %s", provider)
        parsed = _parse_llm_output(raw)

        summary = parsed.summary
        recommendations = parsed.recommendations

        disputed = [
            DisputedFinding(
                original_rule_id=d.rule_id,
                original_severity=d.severity,
                dispute_reason=d.dispute_reason,
            )
            for d in parsed.disputed_findings
        ]

        observations = [
            LLMObservation(
                observation=o.get("observation", ""),
                severity=o.get("severity", "low"),
                category=o.get("category", "general"),
            )
            for o in parsed.observations
            if o.get("observation")
        ]
        
        suggested_questions = parsed.suggested_questions

    except (ValidationError, json.JSONDecodeError, KeyError, Exception) as e:
        logger.warning("LLM validation failed: %s — using fallback", e)
        summary, recommendations, disputed, observations = _fallback_output()
        suggested_questions = []

    # Re-score with disputed findings retained at 25% weight (uncertain, not proven wrong).
    # Cap at 99 when disputes exist — uncertainty means we can't issue a perfect score.
    disputed_types = {d.original_rule_id for d in disputed}
    if disputed_types:
        validated_score = compute_overall_score(
            state.journeys,
            disputed_types=disputed_types,
            page_friction_points=state.page_friction_points,
        )
        if validated_score == 100:
            validated_score = 99
        logger.info("Score adjusted %d → %d after disputing %s", overall_score, validated_score, disputed_types)
    else:
        validated_score = overall_score

    # Apply page-level floor — journey rules only fire when journeys exist, so pages with
    # zero CTAs/nav/elements escape all penalties without this structural cap.
    page_floor, page_issues = compute_page_floor(state.extracted_page.metadata)
    if page_floor < validated_score:
        logger.info("Page floor %d applied (was %d): %s", page_floor, validated_score, page_issues)
        validated_score = page_floor

    label = score_to_label(validated_score)

    # Build nav snapshot for intermediate results surface
    elements = state.extracted_page.elements
    nav_snapshot = NavSnapshot(
        primary_ctas=[
            e.text[:50] for e in elements
            if e.role.value == "cta" and e.importance.value == "primary" and e.text
        ][:5],
        nav_links=[
            e.text[:50] for e in elements
            if e.role.value == "nav" and e.text
        ][:10],
    )

    report = AuditReport(
        url=state.extracted_page.url,
        title=state.extracted_page.title,
        journeys=state.journeys,
        summary=summary,
        recommendations=recommendations,
        overall_score=validated_score,
        pre_validation_score=overall_score,
        qualitative_label=label,  # type: ignore[arg-type]
        element_summary=state.extracted_page.metadata,
        nav_snapshot=nav_snapshot,
        page_issues=page_issues,
        disputed_findings=disputed,
        llm_observations=observations,
        suggested_questions=suggested_questions,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )

    logger.info(
        "AUDIT COMPLETE ║ %s ║ score=%d/%d (%s) ║ journeys=%d ║ disputes=%d ║ observations=%d ║ recs=%d",
        state.extracted_page.url,
        validated_score,
        overall_score,
        label,
        len(state.journeys),
        len(disputed),
        len(observations),
        len(recommendations),
    )
    if page_issues:
        logger.info("PAGE ISSUES | %s", " | ".join(page_issues))
    if disputed:
        logger.info("DISPUTED RULES | %s", ", ".join(d.original_rule_id for d in disputed))

    return state.model_copy(update={"report": report, "status": "done"})
