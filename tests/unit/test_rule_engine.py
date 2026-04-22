import json
from pathlib import Path

from backend.core.rule_engine import evaluate_friction
from backend.models.element import ExtractedPage
from backend.models.journey import JourneyStep, JourneyType, UserJourney


def test_evaluate_friction_returns_new_model() -> None:
    payload = json.loads(Path("tests/fixtures/sample_dom.json").read_text(encoding="utf-8"))
    page = ExtractedPage.model_validate(payload)
    journey = UserJourney(
        type=JourneyType.SIGNUP,
        steps=[JourneyStep(element_id="x", label="x", action="click")] * 7,
        click_count=6,
        friction_points=[],
        severity_score=0,
    )

    updated = evaluate_friction(journey, page)
    assert updated is not journey
    assert updated.severity_score >= 0
    assert any(fp.type == "navigation-depth" for fp in updated.friction_points)

