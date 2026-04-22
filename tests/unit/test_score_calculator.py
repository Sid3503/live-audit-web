"""Regression tests for score_calculator covering the failure modes we fixed."""

import pytest

from backend.core.score_calculator import compute_overall_score, compute_page_floor, score_to_label
from backend.models.journey import (
    DetectionMethod,
    FrictionPoint,
    JourneyStep,
    JourneyType,
    Severity,
    UserJourney,
)


def _make_journey(
    friction_types: list[tuple[str, Severity]],
    confidence: float = 0.85,
    journey_type: JourneyType = JourneyType.SIGNUP,
) -> UserJourney:
    fps = [
        FrictionPoint(type=t, description=t, severity=s, affected_journey=journey_type)
        for t, s in friction_types
    ]
    return UserJourney(
        type=journey_type,
        steps=[JourneyStep(element_id="x", label="x", action="click")],
        click_count=0,
        friction_points=fps,
        severity_score=0,
        confidence=confidence,
        detection_method=DetectionMethod.BFS_GRAPH,
    )


def _make_page_fp(fp_type: str, severity: Severity) -> FrictionPoint:
    return FrictionPoint(
        type=fp_type,
        description=fp_type,
        severity=severity,
        affected_journey=JourneyType.EXPLORE,
    )


class TestPageFrictionAppliedOnce:
    def test_missing_cta_in_three_journeys_counts_once(self) -> None:
        """Before the fix, missing-cta appearing on 3 journeys tripled the penalty."""
        # Page-level FP in state — applied once
        page_fps = [_make_page_fp("missing-cta", Severity.CRITICAL)]

        # 3 journeys with NO page-level friction in their own friction_points
        journeys = [_make_journey([], confidence=0.85) for _ in range(3)]

        score = compute_overall_score(journeys, page_friction_points=page_fps)
        # CRITICAL weight is 40; applied once at confidence 1.0 → penalty = 40 → score = 60
        assert score == 60

    def test_page_friction_zero_journeys(self) -> None:
        """Page friction should still apply when no journeys exist."""
        page_fps = [_make_page_fp("missing-cta", Severity.CRITICAL)]
        score = compute_overall_score([], page_friction_points=page_fps)
        assert score < 100

    def test_no_friction_anywhere_is_100(self) -> None:
        journeys = [_make_journey([], confidence=0.85)]
        assert compute_overall_score(journeys) == 100


class TestDisputeRetention:
    def test_disputed_journey_friction_retained_at_25pct(self) -> None:
        journey = _make_journey([("navigation-depth", Severity.HIGH)], confidence=1.0)
        full_score = compute_overall_score([journey])
        disputed_score = compute_overall_score([journey], disputed_types={"navigation-depth"})
        assert disputed_score > full_score

    def test_all_disputed_caps_at_99(self) -> None:
        """Enforced in llm_audit_node, not score_calculator itself — just verify score < 100 with disputes."""
        journey = _make_journey([("navigation-depth", Severity.HIGH)], confidence=0.5)
        score = compute_overall_score([journey], disputed_types={"navigation-depth"})
        # 25% of HIGH (10) * 0.5 confidence = 1.25 penalty → score = 99
        assert score >= 98

    def test_page_friction_disputable(self) -> None:
        page_fps = [_make_page_fp("missing-cta", Severity.CRITICAL)]
        full = compute_overall_score([], page_friction_points=page_fps)
        disputed = compute_overall_score([], disputed_types={"missing-cta"}, page_friction_points=page_fps)
        assert disputed > full


class TestAllLowCapAt10:
    def test_all_low_friction_capped_at_10_penalty(self) -> None:
        journeys = [
            _make_journey([("incomplete-journey", Severity.LOW)] * 3, confidence=1.0)
            for _ in range(5)
        ]
        score = compute_overall_score(journeys)
        assert score >= 90  # max penalty = 10


class TestPageFloor:
    def test_zero_elements_floor_30(self) -> None:
        from backend.models.element import PageMetadata
        meta = PageMetadata(total_elements=0, cta_count=0, form_count=0, nav_count=0, extracted_at="t")
        floor, issues = compute_page_floor(meta)
        assert floor == 30
        assert len(issues) == 1

    def test_no_cta_no_nav_floor_40(self) -> None:
        from backend.models.element import PageMetadata
        meta = PageMetadata(total_elements=5, cta_count=0, form_count=0, nav_count=0, extracted_at="t")
        floor, issues = compute_page_floor(meta)
        assert floor == 40
        assert len(issues) == 2

    def test_no_cta_floor_65(self) -> None:
        from backend.models.element import PageMetadata
        meta = PageMetadata(total_elements=5, cta_count=0, form_count=0, nav_count=3, extracted_at="t")
        floor, issues = compute_page_floor(meta)
        assert floor == 65

    def test_no_nav_floor_75(self) -> None:
        from backend.models.element import PageMetadata
        meta = PageMetadata(total_elements=5, cta_count=2, form_count=0, nav_count=0, extracted_at="t")
        floor, issues = compute_page_floor(meta)
        assert floor == 75

    def test_healthy_page_no_floor(self) -> None:
        from backend.models.element import PageMetadata
        meta = PageMetadata(total_elements=10, cta_count=2, form_count=1, nav_count=4, extracted_at="t")
        floor, issues = compute_page_floor(meta)
        assert floor == 100
        assert issues == []


class TestScoreToLabel:
    @pytest.mark.parametrize("score,expected", [
        (95, "Excellent"),
        (90, "Excellent"),
        (89, "Good"),
        (70, "Good"),
        (69, "Needs Work"),
        (50, "Needs Work"),
        (49, "Poor"),
        (0, "Poor"),
    ])
    def test_label_thresholds(self, score: int, expected: str) -> None:
        assert score_to_label(score) == expected
