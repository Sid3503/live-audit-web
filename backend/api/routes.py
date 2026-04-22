"""FastAPI routes: POST /audit, POST /chat, GET /deep-analysis."""

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.memory_store import get_result
from backend.models.element import ExtractedPage
from backend.models.report import AuditReport, CrawlReport
from backend.pipeline.graph import run_pipeline
from backend.pipeline.nodes.llm_chat import answer_question

router = APIRouter()
logger = logging.getLogger(__name__)


class AuditRequest(BaseModel):
    """Audit request envelope — page data plus optional screenshot for visual grounding."""

    page: ExtractedPage
    screenshot: Optional[str] = None


@router.post("/audit", response_model=AuditReport)
async def audit_page(request: AuditRequest) -> AuditReport:
    """Run the full LangGraph audit pipeline on an extracted page."""
    page = request.page
    meta = page.metadata
    logger.info(
        "AUDIT REQUEST | url=%s | elements=%d (ctas=%d nav=%d forms=%d) | screenshot=%s",
        page.url,
        meta.total_elements,
        meta.cta_count,
        meta.nav_count,
        meta.form_count,
        "yes" if request.screenshot else "no",
    )
    try:
        report = await run_pipeline(page, screenshot=request.screenshot)
    except Exception as e:
        logger.error("Pipeline error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    return report


@router.get("/deep-analysis")
async def deep_analysis(url: str) -> dict[str, Any]:
    """Poll for deep analysis result. Returns {status: processing} until ready."""
    result = get_result(url)
    if result is None:
        return {"status": "processing"}
    return result


class DeepAuditRequest(BaseModel):
    url: str
    max_pages: int = 10


@router.post("/deep-audit", response_model=CrawlReport)
async def deep_audit(request: DeepAuditRequest) -> CrawlReport:
    """Run deep crawl with funnel pressure analysis synchronously."""
    from backend.core.crawl_service import run_deep_crawl
    try:
        return await run_deep_crawl(request.url, request.max_pages)
    except Exception as e:
        logger.error("Deep audit error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


class ChatMessage(BaseModel):
    role: str
    text: str


class ChatRequest(BaseModel):
    question: str
    report: AuditReport
    history: list[ChatMessage] = []
    crawl_data: Optional[dict] = None


class ChatResponse(BaseModel):
    answer: str


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Answer a UX question about a completed audit report using an LLM."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    try:
        answer = answer_question(request.question, request.report, request.history, request.crawl_data)
        return ChatResponse(answer=answer)
    except Exception as e:
        logger.error("Chat error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


