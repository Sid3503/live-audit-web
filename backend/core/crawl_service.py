"""
Deep crawl service: crawls linked pages, builds site map, runs funnel pressure analysis.

Funnel pressure logic:
  Entry page CTAs should be higher than destination page CTAs.
  If CTAs rise going deeper into the funnel, users face more decisions at higher intent — bad design.
  If CTAs drop, the funnel correctly narrows focus — good design.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from backend.config.journey_targets import JOURNEY_TARGETS
from backend.config.selector_config import CTA_TEXT_SIGNALS
from backend.core.memory_store import store_result
from backend.models.report import CrawlReport, FunnelFlow, PageNode

logger = logging.getLogger(__name__)

# Verdict rules — data-driven, evaluated in order, first match wins
VERDICT_RULES: list[dict] = [
    {"condition": lambda d: d < 0,       "verdict": "correct",  "label": "focus narrows"},
    {"condition": lambda d: d == 0,      "verdict": "warning",  "label": "no change"},
    {"condition": lambda d: 0 < d <= 10, "verdict": "warning",  "label": "slightly more noise"},
    {"condition": lambda d: d > 10,      "verdict": "critical", "label": "decision paralysis"},
]

OVERALL_VERDICT_PRIORITY: dict[str, int] = {"critical": 0, "warning": 1, "correct": 2}

# Content path segments to skip — not part of conversion funnels
_CONTENT_PATH_SEGMENTS = frozenset({
    "blog", "news", "newsroom", "press", "media",
    "customers", "case-study", "case_study",
    "careers", "jobs", "about", "team",
    "docs", "documentation", "help", "support",
    "legal", "privacy", "terms", "cookies",
    "community", "forum", "events", "webinar",
    "download", "desktop", "mobile", "mac", "windows", "linux", "android", "ios",
})

# File extensions that are binary/download targets — skip entirely
_SKIP_EXTENSIONS = frozenset({".dmg", ".exe", ".apk", ".ipa", ".msi", ".pkg", ".deb", ".zip"})

# Page tag signals — url path keywords per journey type
_PAGE_TAG_SIGNALS: dict[str, list[str]] = {
    jtype.value: signals
    for jtype, signals in JOURNEY_TARGETS.items()
}


def _apply_verdict(delta: int) -> tuple[str, str]:
    match = next((r for r in VERDICT_RULES if r["condition"](delta)), VERDICT_RULES[-1])
    return match["verdict"], match["label"]


def _direction(delta: int) -> str:
    if delta < 0:
        return "drops"
    if delta > 0:
        return "rises"
    return "flat"


def _is_content_path(path: str) -> bool:
    segments = {s for s in path.lower().split("/") if s}
    return bool(segments & _CONTENT_PATH_SEGMENTS)


def _detect_page_tag(path: str) -> Optional[str]:
    """Classify page by URL path — same logic as the BFS journey detector."""
    lower_path = path.lower()
    for tag, signals in _PAGE_TAG_SIGNALS.items():
        if any(s in lower_path for s in signals):
            return tag
    return None


def _count_ctas_from_links(links: list[dict]) -> int:
    """Count links whose anchor text matches CTA signals."""
    cta_set = CTA_TEXT_SIGNALS
    count = 0
    for link in links:
        text = (link.get("text") or "").lower().strip()
        if text in cta_set or any(s in text for s in cta_set):
            count += 1
    return count


def _count_forms(html: str) -> int:
    return html.lower().count("<form")


def _count_nav_links(links: list[dict]) -> int:
    """Estimate nav links as internal links with short, top-level paths."""
    count = 0
    for link in links:
        href = link.get("href", "")
        path = urlparse(href).path if href.startswith("http") else href
        depth = len([p for p in path.split("/") if p])
        if depth <= 1:
            count += 1
    return count


async def run_deep_crawl(root_url: str, max_pages: int = 10) -> CrawlReport:
    """
    Crawl root URL and linked pages, build site map, compute funnel pressure per flow.
    """
    try:
        from crawl4ai import AsyncWebCrawler, CrawlerRunConfig  # type: ignore[import]
    except ImportError:
        raise RuntimeError("crawl4ai not installed")

    site_map: dict[str, PageNode] = {}
    root_links_for_flow: list[dict] = []

    async with AsyncWebCrawler(verbose=False) as crawler:
        cfg = CrawlerRunConfig(
            page_timeout=20000,
            delay_before_return_html=2.0,
            remove_overlay_elements=True,
        )

        # Crawl root
        root_result = await crawler.arun(url=root_url, config=cfg)
        if not root_result.success:
            logger.warning("Root crawl blocked (anti-bot): %s — returning empty report", root_url)
            return CrawlReport(
                root_url=root_url,
                pages_crawled=0,
                site_map=[],
                funnel_flows=[],
                overall_verdict="correct",
                generated_at=datetime.now(timezone.utc).isoformat(),
            )

        root_path = urlparse(root_url).path or "/"
        root_links = root_result.links.get("internal", [])
        root_links_for_flow = root_links
        root_title = (root_result.metadata or {}).get("title") or None

        site_map[root_path] = PageNode(
            path=root_path,
            cta_count=_count_ctas_from_links(root_links),
            form_count=_count_forms(root_result.html or ""),
            nav_count=_count_nav_links(root_links),
            total=len(root_links),
            tag=None,
            title=root_title,
        )

        # Collect unique same-origin linked URLs, skip content paths
        root_netloc = urlparse(root_url).netloc
        seen_paths: set[str] = {urlparse(root_url).path or "/"}
        targets: list[str] = []
        for link in root_links:
            href = link.get("href", "")
            if not href or href.startswith("#"):
                continue
            abs_href = href if href.startswith("http") else root_url.rstrip("/") + "/" + href.lstrip("/")
            parsed = urlparse(abs_href)
            path = parsed.path or "/"
            ext = path[path.rfind("."):].lower() if "." in path.split("/")[-1] else ""
            if (
                path not in seen_paths
                and parsed.netloc == root_netloc
                and ext not in _SKIP_EXTENSIONS
                and not _is_content_path(path)
            ):
                seen_paths.add(path)
                targets.append(abs_href)
            if len(targets) >= max_pages - 1:
                break

        # Crawl linked pages concurrently
        tasks = [crawler.arun(url=url, config=cfg) for url in targets]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for url, result in zip(targets, results):
            if isinstance(result, Exception) or not getattr(result, "success", False):
                continue
            path = urlparse(url).path or "/"
            if path in site_map:
                continue
            links = result.links.get("internal", [])
            page_title = (result.metadata or {}).get("title") or None
            site_map[path] = PageNode(
                path=path,
                cta_count=_count_ctas_from_links(links),
                form_count=_count_forms(result.html or ""),
                nav_count=_count_nav_links(links),
                total=len(links),
                tag=_detect_page_tag(path),
                title=page_title,
            )

    # Detect flows: root → any crawled dest page that has a tag
    funnel_flows: list[FunnelFlow] = []
    root_node = site_map.get(root_path)
    seen_tags: set[str] = set()

    if root_node:
        for link in root_links_for_flow:
            href = link.get("href", "")
            dest_path = urlparse(href).path if href.startswith("http") else (href if href.startswith("/") else "/" + href)
            dest_node = site_map.get(dest_path)
            if not dest_node or not dest_node.tag or dest_node.tag in seen_tags:
                continue
            seen_tags.add(dest_node.tag)
            delta = dest_node.cta_count - root_node.cta_count
            verdict, label = _apply_verdict(delta)
            funnel_flows.append(FunnelFlow(
                flow_name=dest_node.tag,
                entry_page=root_path,
                dest_page=dest_path,
                entry_ctas=root_node.cta_count,
                dest_ctas=dest_node.cta_count,
                pressure_delta=delta,
                direction=_direction(delta),
                verdict=verdict,
                verdict_label=label,
            ))

    overall = (
        min(funnel_flows, key=lambda f: OVERALL_VERDICT_PRIORITY[f.verdict]).verdict
        if funnel_flows else "correct"
    )

    report = CrawlReport(
        root_url=root_url,
        pages_crawled=len(site_map),
        site_map=list(site_map.values()),
        funnel_flows=funnel_flows,
        overall_verdict=overall,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )

    logger.info(
        "DEEP CRAWL DONE | pages=%d | flows=%d | verdict=%s",
        len(site_map), len(funnel_flows), overall,
    )
    return report


async def run_deep_analysis(seed_url: str) -> None:
    """Background wrapper: crawl and store result in memory_store (used by /audit background task)."""
    try:
        result = await run_deep_crawl(seed_url)
        store_result(seed_url, result.model_dump())
        store_result(seed_url, {"status": "ready", **result.model_dump()})
    except Exception as e:
        logger.error("Deep analysis error: %s", e)
        store_result(seed_url, {"status": "error", "error": str(e)})
