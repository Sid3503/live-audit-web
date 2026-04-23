"""Q&A over a completed AuditReport + optional deep crawl data — OpenAI primary, LLM fallback."""

import logging
from typing import Any, Optional, Protocol

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from backend.models.report import AuditReport
from backend.pipeline.nodes.llm_provider import invoke_with_fallback


class _Turn(Protocol):
    role: str
    text: str

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a UX consultant answering questions about a website audit for a product manager or founder.

Tone: conversational and direct — plain prose, no bullet points, no headers. Sound like a colleague, not a report.

Answer using the provided audit data and crawl data:
- Use page titles, nav links, primary CTAs, and page paths as signals about what the site offers. If nav links include "Marketing Hub" and "Sales Hub", those are the product areas — say so directly.
- Reference actual labels, step counts, paths, and CTA counts from the data when relevant.
- You may infer from structure (e.g. nav links → product areas). When inferring, say "Based on the navigation..." once — do not repeat the disclaimer for every sentence.
- If a question is entirely outside what the data covers (e.g. exact pricing amounts), say so in one sentence and pivot to what you can tell them.
- Never fabricate specific numbers not in the data.
- Length: 2–3 sentences for detailed questions. 1 sentence for yes/no questions."""


def _build_report_context(report: AuditReport) -> str:
    journey_lines = []
    for j in report.journeys:
        steps_str = " → ".join(
            f"{s.action}:{s.label[:40]}{'*' if s.is_key_action else ''}"
            for s in j.steps
        )
        friction_str = ", ".join(f"{fp.severity.value}:{fp.type}({fp.description[:60]})" for fp in j.friction_points) or "none"
        journey_lines.append(
            f"  [{j.type.value}] {j.click_count} clicks | conf={j.confidence:.0%} | "
            f"method={j.detection_method.value}\n"
            f"    steps: {steps_str or '(none)'}\n"
            f"    friction: {friction_str}"
        )
    disputed = [f"  {d.original_rule_id} disputed: {d.dispute_reason}" for d in report.disputed_findings]
    observations = [f"  [{o.category}] {o.observation}" for o in report.llm_observations]

    es = report.element_summary
    cta_bench = "low" if es.cta_count < 2 else "high" if es.cta_count > 8 else "normal"
    nav_bench = "low" if es.nav_count < 3 else "high" if es.nav_count > 15 else "normal"

    return f"""Page: {report.title}
URL: {report.url}
Score: {report.overall_score}/100 ({report.qualitative_label})
Elements: {es.total_elements} total | CTAs: {es.cta_count} ({cta_bench}, typical 2–8) | Forms: {es.form_count} | Nav: {es.nav_count} ({nav_bench}, typical 3–15)

Page Structure Snapshot:
- Primary CTAs: {', '.join(report.nav_snapshot.primary_ctas) if report.nav_snapshot and report.nav_snapshot.primary_ctas else '(none)'}
- Navigation Links: {', '.join(report.nav_snapshot.nav_links) if report.nav_snapshot and report.nav_snapshot.nav_links else '(none)'}

Journeys (steps marked * are key actions in the path):
{chr(10).join(journey_lines) or '  (none detected)'}

Disputed findings:
{chr(10).join(disputed) or '  (none)'}

Observations:
{chr(10).join(observations) or '  (none)'}

Recommendations (ordered by impact):
{chr(10).join(f'  - {r}' for r in report.recommendations) or '  (none)'}

Summary: {report.summary}"""


def _build_crawl_context(crawl_data: dict[str, Any]) -> str:
    """Format deep crawl results as LLM-readable context."""
    lines = [
        f"Deep Crawl: {crawl_data.get('pages_crawled', 0)} pages crawled from {crawl_data.get('root_url', '')}",
        f"Overall funnel verdict: {crawl_data.get('overall_verdict', 'unknown')}",
        "",
        "Site map (path → title, CTA count, tag):",
    ]
    for page in crawl_data.get("site_map", []):
        tag = f" [{page.get('tag')}]" if page.get("tag") else ""
        title = f' "{page.get("title")}"' if page.get("title") else ""
        lines.append(f"  {page.get('path', '?')}{title} → {page.get('cta_count', 0)} CTAs{tag}")

    flows = crawl_data.get("funnel_flows", [])
    if flows:
        lines.append("")
        lines.append("Funnel flows (entry → dest, CTA delta, verdict):")
        for f in flows:
            lines.append(
                f"  {f.get('flow_name')}: {f.get('entry_page')} ({f.get('entry_ctas')} CTAs) → "
                f"{f.get('dest_page')} ({f.get('dest_ctas')} CTAs) | "
                f"delta={f.get('pressure_delta'):+d} | {f.get('verdict')} ({f.get('verdict_label')})"
            )
    return "\n".join(lines)


def answer_question(
    question: str,
    report: AuditReport,
    history: "list[_Turn] | None" = None,
    crawl_data: "Optional[dict[str, Any]]" = None,
) -> str:
    """Answer a question about the audit report. Returns plain-text answer string."""
    try:
        context = f"Audit data:\n{_build_report_context(report)}"
        if crawl_data:
            context += f"\n\n{_build_crawl_context(crawl_data)}"

        messages: list[BaseMessage] = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=context),
        ]

        for turn in (history or []):
            if turn.role == "user":
                messages.append(HumanMessage(content=turn.text))
            elif turn.role == "assistant":
                messages.append(AIMessage(content=turn.text))

        messages.append(HumanMessage(content=question))

        answer, provider = invoke_with_fallback(messages, json_mode=False, max_tokens_override=512)
        logger.info("Chat answered via %s | history_turns=%d", provider, len(history or []))
        return answer
    except Exception as e:
        logger.warning("All LLM providers failed for chat: %s", e)
        return "Unable to answer — all AI providers are unavailable. Review the audit report directly."
