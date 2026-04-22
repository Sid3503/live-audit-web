"""Simple in-memory store for deep analysis results, keyed by URL with 15-min TTL."""

import time
from typing import Any

_TTL_SECONDS = 900  # 15 minutes

_store: dict[str, tuple[float, Any]] = {}


def store_result(url: str, data: Any) -> None:
    _store[url] = (time.monotonic(), data)


def get_result(url: str) -> Any | None:
    entry = _store.get(url)
    if entry is None:
        return None
    ts, data = entry
    if time.monotonic() - ts > _TTL_SECONDS:
        del _store[url]
        return None
    return data


def clear_result(url: str) -> None:
    _store.pop(url, None)
