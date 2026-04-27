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
        "get free",
        "free forever",
        "start for free",
        "join free",
        "open account",
        "create free",
    ],
    JourneyType.PRICING: [
        "pricing",
        "plans",
        "see plans",
        "see pricing",
        "view pricing",
        "pricing plans",
        "compare plans",
    ],
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
    JourneyType.PURCHASE: [
        "buy",
        "purchase",
        "checkout",
        "add to cart",
        "order now",
        "buy now",
    ],
    JourneyType.EXPLORE: [
        "learn more",
        "features",
        "about",
        "how it works",
        "tour",
        "explore",
    ],
    JourneyType.LOGIN: [
        "log in",
        "login",
        "sign in",
        "signin",
        "log back in",
        "access account",
        "my account",
        "account login",
    ],
    JourneyType.DEMO: [
        "watch demo",
        "see demo",
        "live demo",
        "product demo",
        "demo video",
        "see it in action",
        "watch a demo",
        "view demo",
    ],
    JourneyType.SUPPORT: [
        "help",
        "support",
        "help center",
        "get help",
        "faq",
        "troubleshoot",
        "knowledge base",
        "contact support",
        "submit a ticket",
        "open a ticket",
    ],
    JourneyType.ONBOARDING: [
        "get started",
        "quick start",
        "getting started",
        "setup guide",
        "onboarding",
        "welcome guide",
        "start here",
        "first steps",
    ],
    JourneyType.CART: [
        "add to cart",
        "view cart",
        "cart",
        "basket",
        "add to bag",
        "view bag",
    ],
    JourneyType.UPGRADE: [
        "upgrade",
        "upgrade plan",
        "go pro",
        "upgrade to pro",
        "upgrade now",
        "unlock premium",
        "switch to annual",
        "upgrade account",
    ],
    JourneyType.NEWSLETTER: [
        "subscribe",
        "newsletter",
        "subscribe to newsletter",
        "get updates",
        "stay updated",
        "join our newsletter",
        "get our newsletter",
        "email updates",
    ],
    JourneyType.DOCUMENTATION: [
        "docs",
        "documentation",
        "api docs",
        "developer docs",
        "read the docs",
        "view docs",
        "api reference",
        "guides",
    ],
    JourneyType.SEARCH: [
        "search",
        "find",
        "search bar",
        "site search",
    ],
}

# Layer 2: Regex intent patterns — catch branded/variant CTAs the signal list misses.
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
    JourneyType.LOGIN: re.compile(
        r"\b(log|sign)\s*(in|into|back\s+in)\b"
        r"|\baccount\s+(login|access)\b"
        r"|\bmy\s+account\b",
        re.IGNORECASE,
    ),
    JourneyType.DEMO: re.compile(
        r"\b(watch|see|view|request|book|schedule)\b.{0,20}\b(demo|walkthrough|tour|preview|screencast)\b"
        r"|\bsee\s+it\s+in\s+action\b"
        r"|\bwatch\s+(a\s+)?(product\s+)?demo\b",
        re.IGNORECASE,
    ),
    JourneyType.SUPPORT: re.compile(
        r"\b(get|find|contact|reach|submit)\b.{0,20}\b(help|support|assistance|answer|ticket)\b"
        r"|\b(help\s+center|knowledge\s+base|faq|troubleshoot)\b",
        re.IGNORECASE,
    ),
    JourneyType.ONBOARDING: re.compile(
        r"\b(get|quick|start)\b.{0,15}\b(started|start|setup|going)\b"
        r"|\b(onboarding|welcome\s+guide|first\s+steps|setup\s+guide)\b",
        re.IGNORECASE,
    ),
    JourneyType.UPGRADE: re.compile(
        r"\b(upgrade|unlock|go|switch)\b.{0,20}\b(pro|premium|plus|annual|paid|plan|tier)\b"
        r"|\bunlock\s+(all|full|premium|advanced)\b",
        re.IGNORECASE,
    ),
    JourneyType.NEWSLETTER: re.compile(
        r"\b(subscribe|join|get|sign\s+up)\b.{0,20}\b(newsletter|updates|digest|weekly|monthly)\b"
        r"|\bemail\s+(updates|list|newsletter)\b",
        re.IGNORECASE,
    ),
    JourneyType.DOCUMENTATION: re.compile(
        r"\b(read|view|explore|open|check)\b.{0,20}\b(docs|documentation|api|reference|guide|manual)\b"
        r"|\bapi\s+reference\b|\bdeveloper\s+(docs|portal)\b",
        re.IGNORECASE,
    ),
    JourneyType.SEARCH: re.compile(
        r"\b(search|find|look\s+up|filter)\b.{0,20}\b(product|content|article|page|result)\b"
        r"|\bsearch\s+bar\b|\bsite\s+search\b",
        re.IGNORECASE,
    ),
    JourneyType.CART: re.compile(
        r"\b(add\s+to|view|open|go\s+to)\b.{0,10}\b(cart|bag|basket)\b",
        re.IGNORECASE,
    ),
}

# Per-journey role constraints — overrides the global JOURNEY_ELIGIBLE_ROLES for specific types.
JOURNEY_ROLE_CONSTRAINTS: dict[JourneyType, set[str]] = {
    JourneyType.CONTACT: {"cta", "nav"},
    JourneyType.EXPLORE: {"cta", "nav"},
    JourneyType.LOGIN: {"cta", "nav"},
    JourneyType.SUPPORT: {"cta", "nav", "link"},
    JourneyType.DOCUMENTATION: {"cta", "nav", "link"},
    JourneyType.SEARCH: {"input", "cta", "nav"},
    JourneyType.NEWSLETTER: {"input", "cta"},
    JourneyType.DEMO: {"cta", "nav"},
    JourneyType.UPGRADE: {"cta"},
}

# Detection strategy ordering per journey type.
# Each entry is an ordered list of strategies to attempt; first success wins.
# Strategies: "nav_first" | "footer_first" | "bfs_from_root" | "proximity_form" | "search_element" | "multi_step_chain"
JOURNEY_STRATEGIES: dict[JourneyType, list[str]] = {
    JourneyType.SIGNUP:        ["bfs_from_root", "proximity_form", "multi_step_chain"],
    JourneyType.PRICING:       ["nav_first", "bfs_from_root"],
    JourneyType.CONTACT:       ["nav_first", "bfs_from_root", "proximity_form"],
    JourneyType.PURCHASE:      ["bfs_from_root", "proximity_form"],
    JourneyType.EXPLORE:       ["nav_first", "bfs_from_root"],
    JourneyType.LOGIN:         ["nav_first", "bfs_from_root"],
    JourneyType.DEMO:          ["bfs_from_root", "nav_first"],
    JourneyType.SUPPORT:       ["nav_first", "footer_first", "bfs_from_root"],
    JourneyType.ONBOARDING:    ["bfs_from_root", "multi_step_chain"],
    JourneyType.CART:          ["bfs_from_root", "proximity_form"],
    JourneyType.UPGRADE:       ["bfs_from_root"],
    JourneyType.NEWSLETTER:    ["proximity_form", "footer_first"],
    JourneyType.DOCUMENTATION: ["nav_first", "footer_first", "bfs_from_root"],
    JourneyType.SEARCH:        ["search_element", "nav_first"],
}

# Confidence scores per detection method name
STRATEGY_CONFIDENCE: dict[str, float] = {
    "nav_first":      0.88,
    "footer_first":   0.80,
    "bfs_from_root":  0.85,
    "proximity_form": 0.75,
    "search_element": 0.90,
    "multi_step_chain": 0.82,
}
