"""BFS-based journey detection — three-layer signal model: signals → regex → LLM classification."""

from collections import deque

from backend.config.journey_targets import INTENT_PATTERNS, JOURNEY_ROLE_CONSTRAINTS, JOURNEY_TARGETS
from backend.models.element import ExtractedPage, PageElement
from backend.models.journey import DetectionMethod, JourneyStep, JourneyType, UserJourney
from backend.pipeline.state import NavGraph

JOURNEY_ELIGIBLE_ROLES = {"cta", "nav", "link"}
_MAX_PATH_DEPTH = 6


def _bfs_path(
    graph: NavGraph,
    elements_by_id: dict[str, PageElement],
    root_id: str,
    target_ids: set[str],
) -> list[str]:
    """BFS from root to any target node. Returns shortest path as list of element IDs."""

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


def _compute_confidence(method: DetectionMethod, steps: list[JourneyStep]) -> float:
    """Compute journey confidence from detection method and path quality."""
    n = len(steps)
    if n == 0:
        return 0.0

    if method == DetectionMethod.BFS_GRAPH:
        if n == 1:
            base = 0.70  # directly reachable but trivially short path
        elif n <= 4:
            base = 0.85  # ideal traversal depth
        else:
            base = max(0.60, 0.85 - (n - 4) * 0.06)
        key_ratio = sum(1 for s in steps if s.is_key_action) / n
        return round(min(0.95, base * (0.85 + 0.15 * key_ratio)), 2)
    elif method == DetectionMethod.LLM_CLASSIFIED:
        # LLM classification: higher than text_match (semantic understanding),
        # lower than BFS (no graph traversal confirmation).
        return round(min(0.70, 0.55 + n * 0.05), 2)
    else:
        # Text match: more matched elements = slightly higher confidence; cap at 0.45
        return round(min(0.45, 0.30 + n * 0.05), 2)


def _is_eligible(e: PageElement, allowed_roles: set[str]) -> bool:
    return (
        e.role.value in allowed_roles
        and e.visible
        and e.importance.value != "tertiary"
    )


def _matches_signals(text: str, journey_type: JourneyType) -> bool:
    """Layer 1 + 2: exact signal substring OR regex intent pattern."""
    lower = text.lower()
    if any(s in lower for s in JOURNEY_TARGETS[journey_type]):
        return True
    pattern = INTENT_PATTERNS.get(journey_type)
    return bool(pattern and pattern.search(text))


def _text_fallback_path(
    elements: list[PageElement],
    journey_type: JourneyType,
    allowed_roles: set[str],
) -> list[PageElement]:
    """Fallback: filter by role + signal match (layer 1+2), sort top-to-bottom, deduplicate."""

    matched = [
        e for e in elements
        if _is_eligible(e, allowed_roles) and _matches_signals(e.text, journey_type)
    ]
    seen_labels: set[str] = set()
    unique: list[PageElement] = []
    for e in sorted(matched, key=lambda e: e.position.y):
        label = e.text.lower().strip()
        if label not in seen_labels:
            seen_labels.add(label)
            unique.append(e)
    return unique


_ROLE_ACTION: dict[str, str] = {
    "cta": "click",
    "nav": "navigate",
    "link": "follow",
    "form": "submit",
    "input": "fill",
}
_KEY_ACTION_ROLES = {"cta", "form"}


def _make_step(element_id: str, element: "PageElement") -> JourneyStep:
    role = element.role.value
    return JourneyStep(
        element_id=element_id,
        label=element.text[:60],
        action=_ROLE_ACTION.get(role, "click"),
        is_key_action=role in _KEY_ACTION_ROLES,
    )


def detect_journeys(
    page: ExtractedPage,
    graph: NavGraph,
    cta_classifications: dict[str, str] | None = None,
) -> list[UserJourney]:
    """
    Detect user journeys using three signal layers:
      Layer 1 — exact keyword signals (JOURNEY_TARGETS)
      Layer 2 — regex intent patterns (INTENT_PATTERNS)
      Layer 3 — LLM-classified CTAs (cta_classifications from classify_ctas_node)

    For each journey type, target elements are the union of all three layers.
    BFS finds the graph path; text_match or llm_classified is the fallback.
    """
    elements_by_id = {e.id: e for e in page.elements}
    journeys: list[UserJourney] = []
    classifications = cta_classifications or {}

    for journey_type in JourneyType:
        allowed_roles = JOURNEY_ROLE_CONSTRAINTS.get(journey_type, JOURNEY_ELIGIBLE_ROLES)

        # Layer 1 + 2: elements matching signals or regex patterns
        heuristic_targets = {
            e.id for e in page.elements
            if _is_eligible(e, allowed_roles) and _matches_signals(e.text, journey_type)
        }

        # Layer 3: elements classified by LLM as this journey type
        llm_targets = {
            eid for eid, jtype in classifications.items()
            if jtype == journey_type.value and eid in elements_by_id
            and _is_eligible(elements_by_id[eid], allowed_roles)
        }

        all_targets = heuristic_targets | llm_targets

        if not all_targets:
            continue

        # BFS: try to find a graph path to any target
        path_ids = _bfs_path(graph, elements_by_id, graph.root_id, all_targets)

        if path_ids:
            steps = [
                _make_step(eid, elements_by_id[eid])
                for eid in path_ids
                if eid in elements_by_id
            ]
            detection_method = DetectionMethod.BFS_GRAPH

        elif heuristic_targets:
            # Text fallback using layer 1+2 signals
            fallback = _text_fallback_path(page.elements, journey_type, allowed_roles)
            steps = [_make_step(e.id, e) for e in fallback]
            detection_method = DetectionMethod.TEXT_MATCH

        elif llm_targets:
            # LLM-only: no heuristic match, but LLM found relevant CTAs
            llm_elements = sorted(
                (elements_by_id[eid] for eid in llm_targets if eid in elements_by_id),
                key=lambda e: e.position.y,
            )
            steps = [_make_step(e.id, e) for e in llm_elements]
            detection_method = DetectionMethod.LLM_CLASSIFIED

        else:
            continue

        if not steps:
            continue

        confidence = _compute_confidence(detection_method, steps)
        key_actions = [s.label for s in steps if s.is_key_action]

        journeys.append(
            UserJourney(
                type=journey_type,
                steps=steps,
                click_count=max(0, len(steps) - 1),
                friction_points=[],
                severity_score=0,
                detection_method=detection_method,
                confidence=confidence,
                entry_point=steps[0].label if steps else "",
                exit_point=steps[-1].label if steps else "",
                key_actions=key_actions,
            )
        )

    return journeys
