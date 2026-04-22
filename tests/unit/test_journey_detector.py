import json
from pathlib import Path

from backend.core.graph_builder import build_nav_graph
from backend.core.journey_detector import detect_journeys
from backend.models.element import ExtractedPage


def test_detect_journeys_finds_signup_and_pricing() -> None:
    payload = json.loads(Path("tests/fixtures/sample_dom.json").read_text(encoding="utf-8"))
    page = ExtractedPage.model_validate(payload)
    graph = build_nav_graph(page)
    journeys = detect_journeys(page, graph)

    types = {j.type.value for j in journeys}
    assert "signup" in types
    assert "pricing" in types


def test_detect_journeys_have_steps_and_click_count() -> None:
    payload = json.loads(Path("tests/fixtures/sample_dom.json").read_text(encoding="utf-8"))
    page = ExtractedPage.model_validate(payload)
    graph = build_nav_graph(page)
    journeys = detect_journeys(page, graph)

    assert all(len(j.steps) >= 1 for j in journeys)
    assert all(j.click_count == max(0, len(j.steps) - 1) for j in journeys)

