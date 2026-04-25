"""Pure graph construction logic — no LLM, no side effects."""

from dataclasses import dataclass
from typing import Callable

from backend.models.element import ExtractedPage, PageElement
from backend.pipeline.state import NavEdge, NavGraph


@dataclass(frozen=True)
class EdgeRule:
    """Predicate-based edge rule for nav graph construction."""

    name: str
    predicate: Callable[[PageElement, PageElement], bool]


EDGE_RULES: list[EdgeRule] = [
    EdgeRule(
        name="cta-chain",
        predicate=lambda a, b: (
            a.importance.value == "primary"
            and b.importance.value == "secondary"
            and a.role.value == "cta"
            and b.role.value in ("cta", "link")
        ),
    ),
    EdgeRule(
        name="nav-to-cta",
        # Proximity guard: nav link must be in the same viewport region as the CTA.
        # Without this, every nav element connected to every CTA, creating spurious paths.
        predicate=lambda a, b: (
            a.role.value == "nav"
            and b.role.value == "cta"
            and abs(a.position.y - b.position.y) < 300
        ),
    ),
    EdgeRule(
        name="input-to-submit",
        predicate=lambda a, b: (
            a.role.value == "input" and b.role.value == "cta" and b.tag in ("button", "input")
        ),
    ),
    EdgeRule(
        name="proximity-link",
        # Tightened from 200px to 80px — links more than ~one line apart are unlikely
        # to be part of the same CTA group.
        predicate=lambda a, b: (
            a.role.value == "link" and b.role.value == "cta" and abs(a.position.y - b.position.y) < 80
        ),
    ),
]


def build_nav_graph(page: ExtractedPage) -> NavGraph:
    """Build adjacency graph from page elements using predicate edge rules."""

    elements = page.elements
    if not elements:
        return NavGraph(node_ids=[], edges=[], root_id="")

    # Root selection: prefer a primary CTA visible in the current viewport,
    # fall back to the globally topmost primary CTA, then topmost non-tertiary.
    non_tertiary = [e for e in elements if e.importance.value != "tertiary"]
    primary = [e for e in elements if e.importance.value == "primary"]
    viewport_primary = [e for e in primary if e.in_viewport]

    if viewport_primary:
        root = min(viewport_primary, key=lambda e: e.position.y)
    elif primary:
        root = min(primary, key=lambda e: e.position.y)
    else:
        root = min(non_tertiary or elements, key=lambda e: e.position.y)

    edges: list[NavEdge] = []
    for a in elements:
        for b in elements:
            if a.id == b.id:
                continue
            for rule in EDGE_RULES:
                if rule.predicate(a, b):
                    edges.append(NavEdge(source_id=a.id, target_id=b.id, rule_name=rule.name))
                    break

    return NavGraph(node_ids=[e.id for e in elements], edges=edges, root_id=root.id)

