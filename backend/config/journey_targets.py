import re

from backend.models.journey import JourneyType

# Data-driven config — never put journey detection logic in if-else

# Layer 1: Exact substring signals (fast, deterministic)
JOURNEY_TARGETS: dict[JourneyType, list[str]] = {
    JourneyType.SIGNUP: [
        "sign up",
        "signup",
        "register",
        "create account",
        "get started",
        "start free",
        "try free",
        "get free",        # "Get Notion free", "Get X free"
        "free forever",
        "start for free",
        "join free",
        "open account",
        "create free",
    ],
    JourneyType.PRICING: ["pricing", "plans", "cost", "price", "billing", "subscription", "see plans"],
    JourneyType.CONTACT: [
        "contact",
        "talk to sales",
        "reach us",
        "get in touch",
        "contact us",
        "request a demo",
        "request demo",
        "book a demo",
        "schedule a demo",
        "talk to us",
        "speak to sales",
    ],
    JourneyType.PURCHASE: ["buy", "purchase", "checkout", "add to cart", "order now", "buy now"],
    JourneyType.EXPLORE: ["learn more", "features", "about", "how it works", "tour", "explore"],
}

# Layer 2: Regex intent patterns — catch branded/variant CTAs the signal list misses.
# Examples: "Get Notion free" (signup), "Start building" (signup), "See what's possible" (explore),
#           "Talk to an expert" (contact), "Try Pro for 30 days" (purchase).
INTENT_PATTERNS: dict[JourneyType, re.Pattern[str]] = {
    JourneyType.SIGNUP: re.compile(
        r"\b(get|start|begin|join|create|open|try|access|claim|unlock|launch|activate)\b.{0,30}\b(free|account|trial|access|started|going|building|today|now)\b"
        r"|\b(sign|log)\s*(up|in|into|on)\b"
        r"|\b(register|subscribe|enroll|onboard)\b"
        r"|\bstart\s+building\b"
        r"|\bjoin\b.{0,20}\b(today|now|us|free)\b",
        re.IGNORECASE,
    ),
    JourneyType.CONTACT: re.compile(
        r"\b(request|book|schedule|get|watch|see|try|arrange)\b.{0,25}\b(demo|tour|walkthrough|preview|call|meeting|consultation)\b"
        r"|\b(talk|speak|chat|connect|reach)\b.{0,20}\b(sales|us|team|expert|advisor|specialist)\b"
        r"|\bcontact\b|\bget\s+in\s+touch\b|\blet.{0,5}s\s+(talk|chat|connect)\b",
        re.IGNORECASE,
    ),
    JourneyType.PRICING: re.compile(
        r"\b(see|view|check|compare|explore|find)\b.{0,20}\b(plan|pricing|price|cost|tier|option|package)\b"
        r"|\b(how\s+much|what.{0,10}cost)\b"
        r"|\b(upgrade|downgrade)\b",
        re.IGNORECASE,
    ),
    JourneyType.PURCHASE: re.compile(
        r"\b(buy|purchase|order|checkout|get|shop|grab)\b.{0,20}\b(now|today|it|this|plan|pro|premium|plus|license|seat)\b"
        r"|\badd\s+to\s+cart\b|\bbuy\s+now\b|\bpay\s+(now|monthly|annually)\b",
        re.IGNORECASE,
    ),
    JourneyType.EXPLORE: re.compile(
        r"\b(learn|discover|see|explore|find\s+out|read)\b.{0,20}\b(more|how|what|why|features?|capabilities)\b"
        r"|\b(take\s+a\s+tour|see\s+it\s+in\s+action|watch\s+(a\s+)?video|see\s+how\s+it\s+works)\b"
        r"|\bhow\s+it\s+works\b",
        re.IGNORECASE,
    ),
}

# Per-journey role constraints — overrides the global JOURNEY_ELIGIBLE_ROLES for specific types.
# CONTACT and EXPLORE exclude "link" role: body-copy links containing these words
# (testimonials, footers, article text) should not qualify as journey entry points.
JOURNEY_ROLE_CONSTRAINTS: dict[JourneyType, set[str]] = {
    JourneyType.CONTACT: {"cta", "nav"},
    JourneyType.EXPLORE: {"cta", "nav"},
}
