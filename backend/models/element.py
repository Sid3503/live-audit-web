from enum import Enum
from typing import Optional

from pydantic import BaseModel


class ElementRole(str, Enum):
    CTA = "cta"
    NAV = "nav"
    FORM = "form"
    LINK = "link"
    INPUT = "input"
    UNKNOWN = "unknown"


class ElementImportance(str, Enum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    TERTIARY = "tertiary"


class Position(BaseModel):
    x: float
    y: float


class PageElement(BaseModel):
    id: str
    text: str
    tag: str
    role: ElementRole
    importance: ElementImportance
    href: Optional[str] = None
    path: str
    visible: bool
    position: Position


class PageMetadata(BaseModel):
    total_elements: int
    cta_count: int
    form_count: int
    nav_count: int
    extracted_at: str


class ExtractedPage(BaseModel):
    url: str
    title: str
    elements: list[PageElement]
    metadata: PageMetadata

