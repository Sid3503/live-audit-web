import json
from pathlib import Path

import pytest

from backend.models.element import ExtractedPage
from backend.pipeline.graph import run_pipeline


@pytest.mark.asyncio
async def test_pipeline_runs_without_llm_key() -> None:
    payload = json.loads(Path("tests/fixtures/sample_dom.json").read_text(encoding="utf-8"))
    page = ExtractedPage.model_validate(payload)
    report = await run_pipeline(page)

    assert report.url == page.url
    assert report.title == page.title
    assert 0 <= report.overall_score <= 100
    assert report.qualitative_label in {"Poor", "Needs Work", "Good", "Excellent"}
    assert len(report.recommendations) >= 1

