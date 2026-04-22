import json
from pathlib import Path

from backend.core.graph_builder import build_nav_graph
from backend.models.element import ExtractedPage


def test_build_nav_graph_builds_root_and_nodes() -> None:
    payload = json.loads(Path("tests/fixtures/sample_dom.json").read_text(encoding="utf-8"))
    page = ExtractedPage.model_validate(payload)
    graph = build_nav_graph(page)

    assert graph.root_id in set(graph.node_ids)
    assert len(graph.node_ids) == page.metadata.total_elements


def test_build_nav_graph_has_some_edges() -> None:
    payload = json.loads(Path("tests/fixtures/sample_dom.json").read_text(encoding="utf-8"))
    page = ExtractedPage.model_validate(payload)
    graph = build_nav_graph(page)

    assert len(graph.edges) > 0

