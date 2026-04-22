"""Friction rule evaluation — applies FRICTION_RULES (per-journey) and PAGE_FRICTION_RULES (once per page)."""

from backend.config.rule_config import FRICTION_RULES, PAGE_FRICTION_RULES
from backend.config.severity_weights import SEVERITY_WEIGHTS
from backend.models.element import ExtractedPage
from backend.models.journey import FrictionPoint, JourneyType, UserJourney


def evaluate_friction(journey: UserJourney, page: ExtractedPage) -> UserJourney:
    """Apply per-journey friction rules and return updated journey with points."""

    triggered = [
        FrictionPoint(
            type=rule.type,
            description=rule.description,
            severity=rule.severity,
            affected_journey=journey.type,
        )
        for rule in FRICTION_RULES
        if rule.check(journey, page)
    ]
    severity_score = sum(SEVERITY_WEIGHTS[fp.severity] for fp in triggered)
    return journey.model_copy(update={"friction_points": triggered, "severity_score": severity_score})


def evaluate_page_friction(page: ExtractedPage) -> list[FrictionPoint]:
    """Apply page-level structural rules exactly once. Independent of journey count."""

    return [
        FrictionPoint(
            type=rule.type,
            description=rule.description,
            severity=rule.severity,
            affected_journey=JourneyType.EXPLORE,
        )
        for rule in PAGE_FRICTION_RULES
        if rule.check(page)
    ]

