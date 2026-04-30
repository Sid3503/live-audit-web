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


def _norm_url(href: str) -> str:
    """Strip hash, trailing slash, and lowercase for comparison."""
    return href.split("#")[0].rstrip("/").lower()


def _url_path(href: str) -> str:
    """Extract just the path portion of a URL, stripping scheme, domain, hash, and query."""
    try:
        from urllib.parse import urlparse
        path = urlparse(href).path
        return path.rstrip("/").lower() if path else _norm_url(href)
    except Exception:
        return _norm_url(href)


def _shared_destination(a: PageElement, b: PageElement) -> bool:
    """
    Return True if two elements point to the same destination.
    Handles: exact match, trailing slash, hash fragments, path-prefix overlap.
    """
    if not a.href or not b.href:
        return False

    na, nb = _norm_url(a.href), _norm_url(b.href)
    if not na or not nb:
        return False

    # Exact match (covers same-origin and absolute URLs)
    if na == nb:
        return True

    # Path-level comparison: strips protocol+domain so relative and absolute match
    pa, pb = _url_path(a.href), _url_path(b.href)
    if pa and pb and pa == pb:
        return True

    # Path-prefix: CTA at /pricing/plans shares a nav link at /pricing
    # Only fire if the shared prefix is meaningful (not just "/")
    shorter, longer = (pa, pb) if len(pa) <= len(pb) else (pb, pa)
    if shorter and len(shorter) > 1 and longer.startswith(shorter + "/"):
        return True

    return False


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
        name="cta-to-nav",
        # When a CTA and a nav link share the same destination URL, connect them.
        # This lets BFS find paths like "See plans" CTA → "Pricing" nav link
        # when both hrefs resolve to the same page.
        predicate=lambda a, b: (
            a.role.value == "cta"
            and b.role.value == "nav"
            and _shared_destination(a, b)
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

