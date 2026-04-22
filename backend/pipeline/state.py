from typing import Literal, Optional

from pydantic import BaseModel, Field

from backend.models.element import ExtractedPage
from backend.models.journey import FrictionPoint, UserJourney
from backend.models.report import AuditReport

PipelineStatus = Literal[
    "idle",
    "building_graph",
    "detecting_journeys",
    "scoring_friction",
    "auditing",
    "done",
    "error",
]


class NavEdge(BaseModel):
    source_id: str
    target_id: str
    rule_name: str


class NavGraph(BaseModel):
    node_ids: list[str]
    edges: list[NavEdge]
    root_id: str


class PipelineState(BaseModel):
    """Immutable-style state passed between LangGraph nodes."""

    extracted_page: ExtractedPage
    screenshot: Optional[str] = None
    nav_graph: Optional[NavGraph] = None
    # element_id → journey type string; populated by classify_ctas_node
    cta_classifications: dict[str, str] = Field(default_factory=dict)
    journeys: list[UserJourney] = Field(default_factory=list)
    page_friction_points: list[FrictionPoint] = Field(default_factory=list)
    report: Optional[AuditReport] = None
    status: PipelineStatus = "idle"
    error: Optional[str] = None

