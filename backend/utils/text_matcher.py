"""Simple text matching utilities."""

import re


def normalize_text(text: str) -> str:
    """Normalize text for matching."""

    return re.sub(r"\s+", " ", text.strip().lower())


def contains_any(text: str, needles: list[str]) -> bool:
    """Check if normalized text contains any needle."""

    hay = normalize_text(text)
    return any(normalize_text(n) in hay for n in needles)

