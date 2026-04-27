"""Multi-strategy journey detection — six detection strategies per journey type."""

import logging
from collections import deque

from backend.config.journey_targets import (
    INTENT_PATTERNS,
    JOURNEY_ROLE_CONSTRAINTS,
    JOURNEY_STRATEGIES,
    JOURNEY_TARGETS,
    STRATEGY_CONFIDENCE,
)
from backend.models.element import ExtractedPage, PageElement
from backend.models.journey import DetectionMethod, JourneyStep, JourneyType, UserJourney
from backend.pipeline.state import NavGraph

logger = logging.getLogger(__name__)

JOURNEY_ELIGIBLE_ROLES = {"cta", "nav", "link"}
_MAX_PATH_DEPTH = 6

_ROLE_ACTION: dict[str, str] = {
    "cta":   "click",
    "nav":   "navigate",
    "link":  "follow",
    "form":  "submit",
    "input": "fill",
}
_KEY_ACTION_ROLES = {"cta", "form"}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _bfs_path(
    graph: NavGraph,
    elements_by_id: dict[str, PageElement],
    root_id: str,
    target_ids: set[str],
) -> list[str]:
    """BFS from root to any target node. Returns shortest path as element IDs."""
    if root_id not in elements_by_id:
        return []
    queue: deque[list[str]] = deque([[root_id]])
    visited: set[str] = {root_id}
    adj: dict[str, list[str]] = {}
    for edge in graph.edges:
        adj.setdefault(edge.source_id, []).append(edge.target_id)

    while queue:
        path = queue.popleft()
        if len(path) > _MAX_PATH_DEPTH:
            continue
        current = path[-1]
        if current in target_ids:
            return path
        for neighbor in adj.get(current, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(path + [neighbor])
    return []


def _is_eligible(e: PageElement, allowed_roles: set[str]) -> bool:
    return e.role.value in allowed_roles and e.visible and e.importance.value != "tertiary"


def _matches_signals(text: str, journey_type: JourneyType) -> bool:
    lower = text.lower()
    if any(s in lower for s in JOURNEY_TARGETS[journey_type]):
        return True
    pattern = INTENT_PATTERNS.get(journey_type)
    return bool(pattern and pattern.search(text))


def _make_step(element_id: str, element: PageElement) -> JourneyStep:
    role = element.role.value
    return JourneyStep(
        element_id=element_id,
        label=element.text[:60],
        action=_ROLE_ACTION.get(role, "click"),
        is_key_action=role in _KEY_ACTION_ROLES,
    )


def _build_journey(
    journey_type: JourneyType,
    steps: list[JourneyStep],
    strategy_name: str,
) -> UserJourney:
    confidence = STRATEGY_CONFIDENCE.get(strategy_name, 0.5)
    # Adjust confidence by path quality (same as original _compute_confidence for bfs)
    if strategy_name == "bfs_from_root":
        n = len(steps)
        if n == 1:
            base = 0.70
        elif n <= 4:
            base = 0.85
        else:
            base = max(0.60, 0.85 - (n - 4) * 0.06)
        key_ratio = sum(1 for s in steps if s.is_key_action) / max(n, 1)
        confidence = round(min(0.95, base * (0.85 + 0.15 * key_ratio)), 2)

    method_map = {
        "nav_first":       DetectionMethod.NAV_DIRECT,
        "footer_first":    DetectionMethod.FOOTER_DIRECT,
        "bfs_from_root":   DetectionMethod.BFS_GRAPH,
        "proximity_form":  DetectionMethod.FORM_PROXIMITY,
        "search_element":  DetectionMethod.SEARCH_DIRECT,
        "multi_step_chain": DetectionMethod.CHAIN_DETECTED,
    }
    detection_method = method_map.get(strategy_name, DetectionMethod.TEXT_MATCH)

    return UserJourney(
        type=journey_type,
        steps=steps,
        click_count=max(0, len(steps) - 1),
        friction_points=[],
        severity_score=0,
        detection_method=detection_method,
        confidence=confidence,
        entry_point=steps[0].label if steps else "",
        exit_point=steps[-1].label if steps else "",
        key_actions=[s.label for s in steps if s.is_key_action],
    )


# ---------------------------------------------------------------------------
# Six detection strategies
# ---------------------------------------------------------------------------

def _strategy_nav_first(
    journey_type: JourneyType,
    page: ExtractedPage,
    graph: NavGraph,
    elements_by_id: dict[str, PageElement],
    all_targets: set[str],
) -> list[JourneyStep] | None:
    """Find a matching nav element directly — 1-click navigation path."""
    signals = JOURNEY_TARGETS[journey_type]
    nav_match = next(
        (
            e for e in page.elements
            if e.role.value == "nav"
            and e.visible
            and any(s in e.text.lower() for s in signals)
        ),
        None,
    )
    if nav_match:
        return [_make_step(nav_match.id, nav_match)]
    return None


def _strategy_footer_first(
    journey_type: JourneyType,
    page: ExtractedPage,
    graph: NavGraph,
    elements_by_id: dict[str, PageElement],
    all_targets: set[str],
) -> list[JourneyStep] | None:
    """Find a matching link in the footer region (bottom 25% of page height)."""
    if not page.elements:
        return None
    max_y = max((e.position.y for e in page.elements), default=0)
    footer_threshold = max_y * 0.75

    signals = JOURNEY_TARGETS[journey_type]
    footer_match = next(
        (
            e for e in page.elements
            if e.position.y >= footer_threshold
            and e.visible
            and e.role.value in {"link", "nav", "cta"}
            and any(s in e.text.lower() for s in signals)
        ),
        None,
    )
    if footer_match:
        return [_make_step(footer_match.id, footer_match)]
    return None


def _strategy_bfs_from_root(
    journey_type: JourneyType,
    page: ExtractedPage,
    graph: NavGraph,
    elements_by_id: dict[str, PageElement],
    all_targets: set[str],
) -> list[JourneyStep] | None:
    """BFS from graph root to any target element."""
    if not all_targets:
        return None
    path_ids = _bfs_path(graph, elements_by_id, graph.root_id, all_targets)
    if path_ids:
        return [
            _make_step(eid, elements_by_id[eid])
            for eid in path_ids
            if eid in elements_by_id
        ]
    # Text-match fallback when BFS finds no path
    allowed_roles = JOURNEY_ROLE_CONSTRAINTS.get(journey_type, JOURNEY_ELIGIBLE_ROLES)
    matched = [
        e for e in page.elements
        if _is_eligible(e, allowed_roles) and _matches_signals(e.text, journey_type)
    ]
    seen: set[str] = set()
    unique: list[PageElement] = []
    for e in sorted(matched, key=lambda e: e.position.y):
        label = e.text.lower().strip()
        if label not in seen:
            seen.add(label)
            unique.append(e)
    if unique:
        return [_make_step(e.id, e) for e in unique]
    return None


def _strategy_proximity_form(
    journey_type: JourneyType,
    page: ExtractedPage,
    graph: NavGraph,
    elements_by_id: dict[str, PageElement],
    all_targets: set[str],
) -> list[JourneyStep] | None:
    """Find input + submit pairs in proximity — email capture, signup forms, cart checkout."""
    inputs = [e for e in page.elements if e.role.value == "input" and e.visible]
    ctas = [e for e in page.elements if e.role.value in {"cta", "form"} and e.visible]
    if not inputs or not ctas:
        return None

    # Find the CTA nearest (vertically) to an input that matches signals
    signals = JOURNEY_TARGETS[journey_type]
    best_pair: tuple[PageElement, PageElement] | None = None
    best_dist = float("inf")

    for cta in ctas:
        cta_text = cta.text.lower()
        if not any(s in cta_text for s in signals):
            pattern = INTENT_PATTERNS.get(journey_type)
            if not (pattern and pattern.search(cta.text)):
                continue
        for inp in inputs:
            dist = abs(cta.position.y - inp.position.y)
            if dist < best_dist:
                best_dist = dist
                best_pair = (inp, cta)

    if best_pair and best_dist < 300:
        inp, cta = best_pair
        # Order: input first (top of form), then CTA
        ordered = sorted([inp, cta], key=lambda e: e.position.y)
        return [_make_step(e.id, e) for e in ordered]
    return None


def _strategy_search_element(
    journey_type: JourneyType,
    page: ExtractedPage,
    graph: NavGraph,
    elements_by_id: dict[str, PageElement],
    all_targets: set[str],
) -> list[JourneyStep] | None:
    """Locate a search input element (input with type=search or placeholder containing 'search')."""
    search_input = next(
        (
            e for e in page.elements
            if e.role.value == "input"
            and e.visible
            and ("search" in e.text.lower() or "search" in (e.href or "").lower())
        ),
        None,
    )
    if search_input:
        return [_make_step(search_input.id, search_input)]
    return None


def _strategy_multi_step_chain(
    journey_type: JourneyType,
    page: ExtractedPage,
    graph: NavGraph,
    elements_by_id: dict[str, PageElement],
    all_targets: set[str],
) -> list[JourneyStep] | None:
    """
    Multi-step chain: find a CTA → form input → submit sequence using graph edges.
    Useful for signups and onboarding flows that span multiple connected elements.
    """
    adj: dict[str, list[str]] = {}
    for edge in graph.edges:
        adj.setdefault(edge.source_id, []).append(edge.target_id)

    allowed_roles = JOURNEY_ROLE_CONSTRAINTS.get(journey_type, JOURNEY_ELIGIBLE_ROLES)
    entry_candidates = [
        e for e in page.elements
        if _is_eligible(e, allowed_roles) and _matches_signals(e.text, journey_type)
    ]
    if not entry_candidates:
        return None

    # For each entry CTA, look for a downstream form/input within 2 hops
    for entry in sorted(entry_candidates, key=lambda e: e.position.y):
        chain = [entry]
        visited = {entry.id}
        frontier = list(adj.get(entry.id, []))
        for hop in range(2):
            next_frontier = []
            for nid in frontier:
                if nid in visited or nid not in elements_by_id:
                    continue
                visited.add(nid)
                neighbor = elements_by_id[nid]
                if neighbor.role.value in {"form", "input"} and neighbor.visible:
                    chain.append(neighbor)
                    # Look one more hop for a submit button
                    for submit_id in adj.get(nid, []):
                        if submit_id in elements_by_id and submit_id not in visited:
                            submit = elements_by_id[submit_id]
                            if submit.role.value in {"cta", "form"} and submit.visible:
                                chain.append(submit)
                    if len(chain) >= 2:
                        return [_make_step(e.id, e) for e in chain]
                next_frontier.extend(adj.get(nid, []))
            frontier = next_frontier

    return None


# ---------------------------------------------------------------------------
# Strategy dispatcher
# ---------------------------------------------------------------------------

_STRATEGY_FNS = {
    "nav_first":        _strategy_nav_first,
    "footer_first":     _strategy_footer_first,
    "bfs_from_root":    _strategy_bfs_from_root,
    "proximity_form":   _strategy_proximity_form,
    "search_element":   _strategy_search_element,
    "multi_step_chain": _strategy_multi_step_chain,
}


def detect_journeys(
    page: ExtractedPage,
    graph: NavGraph,
    cta_classifications: dict[str, str] | None = None,
) -> list[UserJourney]:
    """
    Detect user journeys using per-type strategy lists.
    Each journey type has an ordered list of strategies (JOURNEY_STRATEGIES).
    The first strategy that returns steps wins; remaining strategies are skipped.
    LLM-classified CTA IDs are merged into the target set for bfs_from_root.
    """
    elements_by_id = {e.id: e for e in page.elements}
    journeys: list[UserJourney] = []
    classifications = cta_classifications or {}

    for journey_type in JourneyType:
        allowed_roles = JOURNEY_ROLE_CONSTRAINTS.get(journey_type, JOURNEY_ELIGIBLE_ROLES)
        strategies = JOURNEY_STRATEGIES.get(journey_type, ["bfs_from_root"])

        # Build shared target set (layer 1+2 heuristics + layer 3 LLM)
        heuristic_targets = {
            e.id for e in page.elements
            if _is_eligible(e, allowed_roles) and _matches_signals(e.text, journey_type)
        }
        llm_targets = {
            eid for eid, jtype in classifications.items()
            if jtype == journey_type.value
            and eid in elements_by_id
            and _is_eligible(elements_by_id[eid], allowed_roles)
        }
        all_targets = heuristic_targets | llm_targets

        logger.info(
            "TARGETS | %-14s | heuristic=%d | llm=%d | strategies=%s",
            journey_type.value,
            len(heuristic_targets),
            len(llm_targets),
            strategies,
        )

        if not all_targets and journey_type not in {JourneyType.SEARCH}:
            # SEARCH uses search_element which doesn't need pre-matched targets
            if "search_element" not in strategies and "nav_first" not in strategies:
                continue

        steps: list[JourneyStep] | None = None
        winning_strategy: str = ""

        for strategy_name in strategies:
            fn = _STRATEGY_FNS.get(strategy_name)
            if fn is None:
                continue
            result = fn(journey_type, page, graph, elements_by_id, all_targets)
            if result:
                steps = result
                winning_strategy = strategy_name
                logger.info(
                    "JOURNEY | %-14s | strategy=%-18s | steps=%d",
                    journey_type.value,
                    strategy_name,
                    len(result),
                )
                break

        if not steps:
            continue

        journey = _build_journey(journey_type, steps, winning_strategy)
        journeys.append(journey)

    return journeys
