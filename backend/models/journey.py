from enum import Enum

from pydantic import BaseModel


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class JourneyType(str, Enum):
    EXPLORE = "explore"
    SIGNUP = "signup"
    PRICING = "pricing"
    CONTACT = "contact"
    PURCHASE = "purchase"


class DetectionMethod(str, Enum):
    BFS_GRAPH = "bfs_graph"
    TEXT_MATCH = "text_match"
    LLM_CLASSIFIED = "llm_classified"


class JourneyStep(BaseModel):
    element_id: str
    label: str
    action: str
    is_key_action: bool = False


class FrictionPoint(BaseModel):
    type: str
    description: str
    severity: Severity
    affected_journey: JourneyType


class UserJourney(BaseModel):
    type: JourneyType
    steps: list[JourneyStep]
    click_count: int
    friction_points: list[FrictionPoint]
    severity_score: int
    detection_method: DetectionMethod = DetectionMethod.TEXT_MATCH
    confidence: float = 0.5
    entry_point: str = ""
    exit_point: str = ""
    key_actions: list[str] = []

