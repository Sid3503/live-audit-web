from backend.models.element import ElementRole

# Strategy map — drives DOM extraction in the content script (also referenced in domService)
ROLE_SELECTOR_MAP: dict[str, list[str]] = {
    ElementRole.CTA.value: [
        "[data-cta]",
        ".cta",
        "button[type='submit']",
        "a.btn",
        "a.button",
        ".btn-primary",
    ],
    ElementRole.NAV.value: ["nav a", "header a", "[role='navigation'] a", ".nav a", ".navbar a"],
    ElementRole.FORM.value: ["form", "[role='form']"],
    ElementRole.LINK.value: ["main a", "article a", "section a", "footer a"],
    ElementRole.INPUT.value: ["input:not([type='hidden'])", "textarea", "select"],
    ElementRole.UNKNOWN.value: [],
}

CTA_TEXT_SIGNALS: set[str] = {
    "get started",
    "sign up",
    "signup",
    "try free",
    "start free",
    "buy now",
    "purchase",
    "subscribe",
    "contact us",
    "book a demo",
    "request demo",
    "get demo",
    "start trial",
    "free trial",
    "get access",
}

