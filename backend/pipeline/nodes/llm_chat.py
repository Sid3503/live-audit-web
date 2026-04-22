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

_SYSTEM_PROMPT = """You are a UX expert analyzing a website audit. You have access to structured audit data and deep crawl data.

Answer the user's question using the provided data. Guidelines:
- Use page titles, navigation links, primary CTAs, and page paths as signals about what the site offers. For example, if nav links include "Marketing Hub" and "Sales Hub", infer those are the product areas.
- Be direct and specific — reference actual labels, step counts, paths, and CTA counts from the data.
- It is OK to make reasonable inferences from navigation structure, CTA text, and page titles — just make clear when you're inferring vs. directly quoting data.
- If the question is completely outside what can be inferred from structure (e.g. pricing amounts), say so in one sentence.
- Never fabricate specific numbers or claims not supported by the data.
- Keep answers under 4 sentences."""


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

    return f"""Page: {report.title}
URL: {report.url}
Score: {report.overall_score}/100 ({report.qualitative_label})
Elements: {report.element_summary.total_elements} | CTAs: {report.element_summary.cta_count} | Forms: {report.element_summary.form_count} | Nav: {report.element_summary.nav_count}

Page Structure Snapshot:
- Primary CTAs: {', '.join(report.nav_snapshot.primary_ctas) if report.nav_snapshot and report.nav_snapshot.primary_ctas else '(none)'}
- Navigation Links: {', '.join(report.nav_snapshot.nav_links) if report.nav_snapshot and report.nav_snapshot.nav_links else '(none)'}

Journeys:
{chr(10).join(journey_lines) or '  (none detected)'}

Disputed findings:
{chr(10).join(disputed) or '  (none)'}

Observations:
{chr(10).join(observations) or '  (none)'}

Recommendations:
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
