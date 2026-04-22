"""Deterministic id helpers."""

import hashlib


def stable_id(*parts: str, prefix: str = "el") -> str:
    """Generate a stable short id from input parts."""

    payload = "|".join(p.strip() for p in parts if p is not None)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{digest}"

