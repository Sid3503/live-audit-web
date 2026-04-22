"""LangGraph StateGraph definition for the UX audit pipeline."""

from langgraph.graph import END, START, StateGraph

from backend.models.element import ExtractedPage
from backend.models.report import AuditReport
from backend.pipeline.nodes.build_graph import build_graph_node
from backend.pipeline.nodes.classify_ctas import classify_ctas_node
from backend.pipeline.nodes.detect_journeys import detect_journeys_node
from backend.pipeline.nodes.llm_audit import llm_audit_node
from backend.pipeline.nodes.score_friction import score_friction_node
from backend.pipeline.state import PipelineState


def _build_pipeline() -> object:
    """Compile the LangGraph audit pipeline."""

    graph = StateGraph(PipelineState)
    graph.add_node("build_graph", build_graph_node)
    graph.add_node("classify_ctas", classify_ctas_node)
    graph.add_node("detect_journeys", detect_journeys_node)
    graph.add_node("score_friction", score_friction_node)
    graph.add_node("llm_audit", llm_audit_node)

    graph.add_edge(START, "build_graph")
    graph.add_edge("build_graph", "classify_ctas")
    graph.add_edge("classify_ctas", "detect_journeys")
    graph.add_edge("detect_journeys", "score_friction")
    graph.add_edge("score_friction", "llm_audit")
    graph.add_edge("llm_audit", END)
    return graph.compile()


_compiled_pipeline = _build_pipeline()


async def run_pipeline(page: ExtractedPage, screenshot: str | None = None) -> AuditReport:
    """Run the full audit pipeline and return AuditReport."""

    initial_state = PipelineState(extracted_page=page, screenshot=screenshot, status="building_graph")
    final_state_raw = await _compiled_pipeline.ainvoke(initial_state)
    final_state = PipelineState.model_validate(final_state_raw)
    if final_state.status == "error" or not final_state.report:
        raise RuntimeError(final_state.error or "Pipeline produced no report")
    return final_state.report

