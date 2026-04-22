"""Overall score computation with confidence weighting, dispute discounting, and severity caps."""

from backend.config.severity_weights import SEVERITY_WEIGHTS
from backend.models.element import PageMetadata
from backend.models.journey import FrictionPoint, Severity, UserJourney

# Disputed findings are probably wrong but not proven wrong.
# They still contribute this fraction of their normal penalty.
DISPUTE_RETENTION = 0.25


def compute_overall_score(
    journeys: list[UserJourney],
    disputed_types: set[str] | None = None,
    page_friction_points: list[FrictionPoint] | None = None,
) -> int:
    """
    Compute 0-100 UX score.

    Journey friction: penalty = severity_weight * journey_confidence * dispute_factor
    Page friction: penalty = severity_weight * 1.0 * dispute_factor (applied exactly once)

    Additional rules:
    - If ALL effective friction is LOW severity (after dispute weighting), cap total penalty at 10
    - Final score clamped to [0, 100]
    """
    disputed = disputed_types or set()

    # Journey-level friction: confidence-weighted, disputable
    journey_friction: list[tuple[FrictionPoint, float]] = [
        (fp, journey.confidence * (DISPUTE_RETENTION if fp.type in disputed else 1.0))
        for journey in journeys
        for fp in journey.friction_points
    ]

    # Page-level friction: confidence = 1.0 (structural fact), applied once
    page_friction: list[tuple[FrictionPoint, float]] = [
        (fp, DISPUTE_RETENTION if fp.type in disputed else 1.0)
        for fp in (page_friction_points or [])
    ]

    all_friction = journey_friction + page_friction

    if not all_friction:
        return 100

    all_low = all(fp.severity == Severity.LOW for fp, _ in all_friction)

    if all_low:
        effective_count = sum(weight for _, weight in all_friction)
        total_penalty = min(10, effective_count * 2)
    else:
        total_penalty = sum(
            SEVERITY_WEIGHTS[fp.severity] * weight
            for fp, weight in all_friction
        )

    return max(0, min(100, round(100 - total_penalty)))


def compute_page_floor(metadata: PageMetadata) -> tuple[int, list[str]]:
    """
    Return the maximum score this page can achieve based on its structural composition,
    and a list of reasons why the floor was applied.

    A page with no interactive elements cannot score highly regardless of journey analysis,
    because journey rules only fire when journeys are detected — empty pages escape all penalties.
    """
    issues: list[str] = []

    if metadata.total_elements == 0:
        issues.append("No interactive elements extracted — page may be empty or blocked by CSP")
        return 30, issues

    if metadata.cta_count == 0 and metadata.nav_count == 0:
        issues.append("No CTAs detected — users have no clear action to take")
        issues.append("No navigation links — users cannot move between sections")
        return 40, issues

    if metadata.cta_count == 0:
        issues.append("No CTAs detected — users have no clear action to take")
        return 65, issues

    if metadata.nav_count == 0:
        issues.append("No navigation links — users cannot move between sections")
        return 75, issues

    return 100, issues


def score_to_label(score: int) -> str:
    """Map score to qualitative label. Thresholds are conservative — Excellent requires near-zero friction."""
    thresholds = [
        (90, "Excellent"),
        (70, "Good"),
        (50, "Needs Work"),
    ]
    return next(
        (label for threshold, label in thresholds if score >= threshold),
        "Poor"
    )
