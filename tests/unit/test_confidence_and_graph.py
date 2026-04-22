"""Regression tests for computed confidence, BFS depth limit, and graph edge constraints."""

import pytest

from backend.core.journey_detector import _compute_confidence, _MAX_PATH_DEPTH, _bfs_path
from backend.models.journey import DetectionMethod, JourneyStep
from backend.pipeline.state import NavEdge, NavGraph


def _make_step(key: bool = False) -> JourneyStep:
    return JourneyStep(element_id="x", label="x", action="click", is_key_action=key)


class TestComputedConfidence:
    def test_bfs_single_step_lower_than_multi(self) -> None:
        single = _compute_confidence(DetectionMethod.BFS_GRAPH, [_make_step()])
        multi = _compute_confidence(DetectionMethod.BFS_GRAPH, [_make_step(), _make_step(key=True), _make_step()])
        assert single < multi

    def test_bfs_long_path_penalised(self) -> None:
        short = _compute_confidence(DetectionMethod.BFS_GRAPH, [_make_step()] * 3)
        long_ = _compute_confidence(DetectionMethod.BFS_GRAPH, [_make_step()] * 8)
        assert long_ < short

    def test_bfs_key_action_density_boosts_confidence(self) -> None:
        no_keys = _compute_confidence(DetectionMethod.BFS_GRAPH, [_make_step(False)] * 3)
        all_keys = _compute_confidence(DetectionMethod.BFS_GRAPH, [_make_step(True)] * 3)
        assert all_keys > no_keys

    def test_text_match_caps_below_bfs(self) -> None:
        text_conf = _compute_confidence(DetectionMethod.TEXT_MATCH, [_make_step()] * 10)
        bfs_conf = _compute_confidence(DetectionMethod.BFS_GRAPH, [_make_step()] * 3)
        assert text_conf < bfs_conf

    def test_text_match_grows_with_steps(self) -> None:
        one = _compute_confidence(DetectionMethod.TEXT_MATCH, [_make_step()])
        three = _compute_confidence(DetectionMethod.TEXT_MATCH, [_make_step()] * 3)
        assert three > one

    def test_text_match_max_capped_at_45pct(self) -> None:
        conf = _compute_confidence(DetectionMethod.TEXT_MATCH, [_make_step()] * 20)
        assert conf <= 0.45

    def test_bfs_max_capped_at_95pct(self) -> None:
        conf = _compute_confidence(DetectionMethod.BFS_GRAPH, [_make_step(True)] * 4)
        assert conf <= 0.95

    def test_empty_steps_returns_zero(self) -> None:
        assert _compute_confidence(DetectionMethod.BFS_GRAPH, []) == 0.0
        assert _compute_confidence(DetectionMethod.TEXT_MATCH, []) == 0.0


class TestBFSDepthLimit:
    def _build_chain(self, length: int) -> tuple[NavGraph, dict]:
        """Build a straight chain graph of `length` nodes."""
        node_ids = [f"n{i}" for i in range(length)]
        edges = [NavEdge(source_id=node_ids[i], target_id=node_ids[i + 1], rule_name="r") for i in range(length - 1)]
        # Fake elements dict — BFS only needs root_id to be in it
        elements_by_id = {nid: object() for nid in node_ids}  # type: ignore[misc]
        graph = NavGraph(node_ids=node_ids, edges=edges, root_id=node_ids[0])
        return graph, elements_by_id

    def test_path_within_depth_limit_found(self) -> None:
        graph, elems = self._build_chain(_MAX_PATH_DEPTH)
        target = {graph.node_ids[-1]}
        path = _bfs_path(graph, elems, graph.root_id, target)  # type: ignore[arg-type]
        assert len(path) == _MAX_PATH_DEPTH

    def test_path_beyond_depth_limit_not_found(self) -> None:
        graph, elems = self._build_chain(_MAX_PATH_DEPTH + 2)
        target = {graph.node_ids[-1]}
        path = _bfs_path(graph, elems, graph.root_id, target)  # type: ignore[arg-type]
        assert path == []


class TestGraphEdgeConstraints:
    def test_nav_to_cta_blocked_when_far_apart(self) -> None:
        from backend.core.graph_builder import EDGE_RULES, build_nav_graph
        from backend.models.element import ExtractedPage, PageElement, PageMetadata, Position

        def _el(id_: str, role: str, y: int, importance: str = "secondary") -> PageElement:
            return PageElement(
                id=id_, text=id_, tag="a", role=role, importance=importance,  # type: ignore[arg-type]
                href=None, path="", visible=True, position=Position(x=0, y=y),
            )

        page = ExtractedPage(
            url="https://x.com",
            title="t",
            elements=[
                _el("nav-home", "nav", y=0),
                _el("cta-buy", "cta", y=500, importance="primary"),  # 500px away — beyond 300px threshold
            ],
            metadata=PageMetadata(total_elements=2, cta_count=1, form_count=0, nav_count=1, extracted_at="t"),
        )
        graph = build_nav_graph(page)
        nav_to_cta_edges = [e for e in graph.edges if e.rule_name == "nav-to-cta"]
        assert len(nav_to_cta_edges) == 0

    def test_nav_to_cta_allowed_when_close(self) -> None:
        from backend.core.graph_builder import build_nav_graph
        from backend.models.element import ExtractedPage, PageElement, PageMetadata, Position

        def _el(id_: str, role: str, y: int, importance: str = "secondary") -> PageElement:
            return PageElement(
                id=id_, text=id_, tag="a", role=role, importance=importance,  # type: ignore[arg-type]
                href=None, path="", visible=True, position=Position(x=0, y=y),
            )

        page = ExtractedPage(
            url="https://x.com",
            title="t",
            elements=[
                _el("nav-home", "nav", y=100),
                _el("cta-buy", "cta", y=200, importance="primary"),  # 100px — within 300px
            ],
            metadata=PageMetadata(total_elements=2, cta_count=1, form_count=0, nav_count=1, extracted_at="t"),
        )
        graph = build_nav_graph(page)
        nav_to_cta_edges = [e for e in graph.edges if e.rule_name == "nav-to-cta"]
        assert len(nav_to_cta_edges) == 1

    def test_proximity_link_blocked_beyond_80px(self) -> None:
        from backend.core.graph_builder import build_nav_graph
        from backend.models.element import ExtractedPage, PageElement, PageMetadata, Position

        def _el(id_: str, role: str, y: int, importance: str = "secondary") -> PageElement:
            return PageElement(
                id=id_, text=id_, tag="a", role=role, importance=importance,  # type: ignore[arg-type]
                href=None, path="", visible=True, position=Position(x=0, y=y),
            )

        page = ExtractedPage(
            url="https://x.com",
            title="t",
            elements=[
                _el("link-features", "link", y=100),
                _el("cta-buy", "cta", y=200, importance="primary"),  # 100px — beyond 80px
            ],
            metadata=PageMetadata(total_elements=2, cta_count=1, form_count=0, nav_count=0, extracted_at="t"),
        )
        graph = build_nav_graph(page)
        prox_edges = [e for e in graph.edges if e.rule_name == "proximity-link"]
        assert len(prox_edges) == 0


class TestPageFrictionRuleSplit:
    def test_no_primary_cta_not_in_friction_rules(self) -> None:
        """Ensure no-primary-cta is not in per-journey FRICTION_RULES anymore."""
        from backend.config.rule_config import FRICTION_RULES
        types = {r.type for r in FRICTION_RULES}
        assert "missing-cta" not in types

    def test_no_nav_links_not_in_friction_rules(self) -> None:
        from backend.config.rule_config import FRICTION_RULES
        types = {r.type for r in FRICTION_RULES}
        assert "missing-navigation" not in types

    def test_page_friction_rules_exist(self) -> None:
        from backend.config.rule_config import PAGE_FRICTION_RULES
        types = {r.type for r in PAGE_FRICTION_RULES}
        assert "missing-cta" in types
        assert "missing-navigation" in types

    def test_evaluate_page_friction_fires_when_no_cta(self) -> None:
        from backend.core.rule_engine import evaluate_page_friction
        from backend.models.element import ExtractedPage, PageMetadata

        page = ExtractedPage(
            url="u", title="t", elements=[],
            metadata=PageMetadata(total_elements=0, cta_count=0, form_count=0, nav_count=0, extracted_at="t"),
        )
        fps = evaluate_page_friction(page)
        types = {fp.type for fp in fps}
        assert "missing-cta" in types
        assert "missing-navigation" in types

    def test_evaluate_page_friction_silent_when_healthy(self) -> None:
        from backend.core.rule_engine import evaluate_page_friction
        from backend.models.element import ExtractedPage, PageMetadata

        page = ExtractedPage(
            url="u", title="t", elements=[],
            metadata=PageMetadata(total_elements=10, cta_count=2, form_count=0, nav_count=4, extracted_at="t"),
        )
        fps = evaluate_page_friction(page)
        assert fps == []
