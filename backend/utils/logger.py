"""Logging configuration."""

import logging
from typing import Final

DEFAULT_LEVEL: Final[str] = "INFO"


def configure_logging(level: str = DEFAULT_LEVEL) -> None:
    """Configure application logging."""

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

