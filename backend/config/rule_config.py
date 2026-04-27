from dataclasses import dataclass
from typing import Callable

from backend.models.element import ExtractedPage, PageMetadata
from backend.models.journey import Severity, UserJourney


@dataclass
class FrictionRule:
    """Journey-level friction detection rule — evaluated once per journey."""

    id: str
    description: str
    check: Callable[[UserJourney, ExtractedPage], bool]
    severity: Severity
    type: str


@dataclass
class PageFrictionRule:
    """Page-level structural rule — evaluated exactly once per page, not per journey."""

    id: str
    description: str
    check: Callable[[ExtractedPage], bool]
    severity: Severity
    type: str


def _journey_ends_in_dead_cta(journey: UserJourney, page: ExtractedPage) -> bool:
    """Return True if the journey's last step is a CTA with no outward destination."""
    if not journey.steps:
        return False
    elements_by_id = {e.id: e for e in page.elements}
    last = elements_by_id.get(journey.steps[-1].element_id)
    if last is None or last.role.value != "cta":
        return False
    return not last.href or last.href.startswith("#") or last.href in ("", "/")


def _signup_cta_is_external(journey: UserJourney, page: ExtractedPage) -> bool:
    """Return True if any CTA in the signup journey points to an external page."""
    cta_elements = {e.id: e for e in page.elements if e.role.value == "cta"}
    journey_element_ids = {step.element_id for step in journey.steps}
    relevant_ctas = [
        cta_elements[eid]
        for eid in journey_element_ids
        if eid in cta_elements
    ]
    return any(
        e.href and not e.href.startswith("#") and e.href not in ("", "/")
        for e in relevant_ctas
    )


FRICTION_RULES: list[FrictionRule] = [
    FrictionRule(
        id="too-many-clicks",
        description="Journey requires more than 5 clicks",
        check=lambda j, _: j.click_count > 5,
        severity=Severity.HIGH,
        type="navigation-depth",
    ),
    FrictionRule(
        id="signup-no-form",
        description="Signup CTA has no associated form and links externally — signup may happen off-page",
        check=lambda j, p: (
            j.type.value == "signup"
            and p.metadata.form_count == 0
            and not _signup_cta_is_external(j, p)
            and p.metadata.cta_count > 0
        ),
        severity=Severity.MEDIUM,
        type="missing-form",
    ),
    FrictionRule(
        id="single-step-journey",
        description="Journey is a direct single action — efficient for returning users, but may skip engagement for new visitors",
        check=lambda j, _: j.click_count == 0 and len(j.steps) < 2,
        severity=Severity.LOW,
        type="incomplete-journey",
    ),
    FrictionRule(
        id="dead-end-cta",
        description="Journey ends at a CTA with no outward destination — users hit a dead end",
        check=_journey_ends_in_dead_cta,
        severity=Severity.MEDIUM,
        type="dead-end",
    ),
    # New rules for expanded journey types
    FrictionRule(
        id="login-buried",
        description="Login link is not in the primary navigation — returning users must hunt for it",
        check=lambda j, p: (
            j.type.value == "login"
            and not any(
                e.role.value == "nav" and e.id in {s.element_id for s in j.steps}
                for e in p.elements
            )
        ),
        severity=Severity.MEDIUM,
        type="buried-action",
    ),
    FrictionRule(
        id="demo-no-video-or-form",
        description="Demo journey has no video embed or request form — demo content may be missing",
        check=lambda j, p: (
            j.type.value == "demo"
            and p.metadata.form_count == 0
        ),
        severity=Severity.MEDIUM,
        type="missing-demo-asset",
    ),
    FrictionRule(
        id="support-no-form",
        description="Support journey has no contact form — users cannot submit help requests",
        check=lambda j, p: (
            j.type.value == "support"
            and p.metadata.form_count == 0
        ),
        severity=Severity.HIGH,
        type="missing-form",
    ),
    FrictionRule(
        id="upgrade-no-pricing-link",
        description="Upgrade CTA exists but no pricing page link found — users cannot compare plans before upgrading",
        check=lambda j, p: (
            j.type.value == "upgrade"
            and not any(
                "pricing" in e.text.lower() or "plans" in e.text.lower()
                for e in p.elements
                if e.visible and e.role.value in {"nav", "cta", "link"}
            )
        ),
        severity=Severity.MEDIUM,
        type="missing-context",
    ),
    FrictionRule(
        id="newsletter-no-input",
        description="Newsletter subscribe CTA found but no email input field nearby",
        check=lambda j, p: (
            j.type.value == "newsletter"
            and not any(e.role.value == "input" and e.visible for e in p.elements)
        ),
        severity=Severity.HIGH,
        type="missing-form",
    ),
    FrictionRule(
        id="docs-link-in-footer-only",
        description="Documentation is only linked from the footer — developers may miss it",
        check=lambda j, p: (
            j.type.value == "documentation"
            and all(
                e.position.y > (max((el.position.y for el in p.elements), default=0) * 0.75)
                for e in p.elements
                if e.id in {s.element_id for s in j.steps}
            )
            and len(j.steps) > 0
        ),
        severity=Severity.LOW,
        type="buried-action",
    ),
    FrictionRule(
        id="cart-no-checkout",
        description="Cart journey detected but no checkout CTA found — purchase flow may be incomplete",
        check=lambda j, p: (
            j.type.value == "cart"
            and not any(
                any(kw in e.text.lower() for kw in ["checkout", "pay", "buy now", "proceed"])
                for e in p.elements
                if e.visible and e.role.value == "cta"
            )
        ),
        severity=Severity.HIGH,
        type="dead-end",
    ),
    FrictionRule(
        id="onboarding-too-deep",
        description="Onboarding journey requires more than 3 clicks — first-run experience may be too complex",
        check=lambda j, _: j.type.value == "onboarding" and j.click_count > 3,
        severity=Severity.MEDIUM,
        type="navigation-depth",
    ),
    FrictionRule(
        id="search-no-input",
        description="Search journey detected but no search input element found on page",
        check=lambda j, p: (
            j.type.value == "search"
            and not any(e.role.value == "input" and e.visible for e in p.elements)
        ),
        severity=Severity.HIGH,
        type="missing-form",
    ),
]

PAGE_FRICTION_RULES: list[PageFrictionRule] = [
    PageFrictionRule(
        id="no-primary-cta",
        description="No primary CTA detected on page — users have no clear action to take",
        check=lambda p: p.metadata.cta_count == 0,
        severity=Severity.CRITICAL,
        type="missing-cta",
    ),
    PageFrictionRule(
        id="no-nav-links",
        description="No navigation links found — users cannot browse between sections",
        check=lambda p: p.metadata.nav_count == 0,
        severity=Severity.HIGH,
        type="missing-navigation",
    ),
    PageFrictionRule(
        id="competing-ctas",
        description="More than 3 distinct primary CTAs visible above the fold — competing actions may reduce decision clarity",
        check=lambda p: len({
            e.text.lower().strip()
            for e in p.elements
            if e.role.value == "cta"
            and e.importance.value == "primary"
            and e.position.y < 600
            and e.text.strip()
        }) > 3,
        severity=Severity.MEDIUM,
        type="cta-overload",
    ),
]
