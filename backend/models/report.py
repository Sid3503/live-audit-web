from typing import Literal, Optional

from pydantic import BaseModel

from backend.models.element import PageMetadata
from backend.models.journey import UserJourney


class DisputedFinding(BaseModel):
    """A heuristic friction point that the AI assessed as likely incorrect."""

    original_rule_id: str
    original_severity: str
    dispute_reason: str


class LLMObservation(BaseModel):
    """A net-new UX observation not capturable by heuristics."""

    observation: str
    severity: Literal["low", "medium", "high"]
    category: str


class NavSnapshot(BaseModel):
    """Sampled navigation structure from the page — surfaces intermediate extraction results."""

    primary_ctas: list[str]
    nav_links: list[str]
    all_cta_labels: list[str] = []
    form_labels: list[str] = []


class FunnelFlow(BaseModel):
    """One cross-page flow with funnel pressure analysis."""

    flow_name: str
    entry_page: str
    dest_page: str
    entry_ctas: int
    dest_ctas: int
    pressure_delta: int
    direction: Literal["drops", "rises", "flat"]
    verdict: Literal["correct", "warning", "critical"]
    verdict_label: str


class PageNode(BaseModel):
    """One crawled page with element summary."""

    path: str
    cta_count: int
    form_count: int
    nav_count: int
    total: int
    tag: Optional[str] = None
    title: Optional[str] = None


class CrawlReport(BaseModel):
    """Output of the deep crawl analysis."""

    root_url: str
    pages_crawled: int
    site_map: list[PageNode]
    funnel_flows: list[FunnelFlow]
    overall_verdict: Literal["correct", "warning", "critical"]
    generated_at: str


class AuditReport(BaseModel):
    url: str
    title: str
    journeys: list[UserJourney]
    summary: str
    recommendations: list[str]
    overall_score: int
    pre_validation_score: int
    qualitative_label: Literal["Poor", "Needs Work", "Good", "Excellent"]
    element_summary: PageMetadata
    nav_snapshot: NavSnapshot
    page_issues: list[str] = []
    disputed_findings: list[DisputedFinding] = []
    llm_observations: list[LLMObservation] = []
    suggested_questions: list[str] = []
    generated_at: str
