from backend.models.journey import Severity

# Used by score_calculator — single source of truth for severity → numeric weight
SEVERITY_WEIGHTS: dict[Severity, int] = {
    Severity.CRITICAL: 40,
    Severity.HIGH: 20,
    Severity.MEDIUM: 10,
    Severity.LOW: 5,
}

