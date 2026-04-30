"""Shared predicate for filtering non-CTA noise from element lists.

Used by classify_ctas (before LLM call) and llm_audit (before navSnapshot).
"""

import re

_NOISE_RE = re.compile(
    r"^[\d$€£¥]"                                        # starts with digit or currency symbol
    r"|^[A-Za-z]{1,3}\$"                                # currency prefix: US$, AU$, CA$, NZ$
    r"|[%+M]\s*\+?\s*$"                                 # ends with %, +, or metric suffixes (200M+)
    r"|\d{3,}"                                           # 3+ consecutive digits → stat text
    r"|^(previous|next|show |hide |close |open |skip |pause |play |stop )"  # media/carousel controls
    r"|^pause[:\s]|^play[:\s]"                           # "Pause: Hero", "Play: intro" style
    r"|\b(testimonial|customer story|slide)\b"           # slider labels
    r"|\b(unifies|powers|improves|consolidates|grows with|relies on|chose|trusts)\b"  # testimonial verbs
    r"|choose your country"                              # localisation widget
    r"|choose a time of day"                             # theme/time-of-day switcher
    r"|\.com\b"                                          # domain names (company logos/links)
    r"|^(cookie|privacy|terms and|legal notice|manage cookies|accept all|reject all)"  # consent/legal UI
    r"|\b(cookie settings|cookie preferences)\b"
    r"|^(english|español|français|deutsch|italiano|português|日本語|한국어|中文)\b"  # language selectors
    r"|^(popular|recent|more|all)\s+(templates?|categor|apps?|integrations?|products?|examples?)"  # browse filters
    r"|\b(settings|preferences)\s*$"                    # standalone settings labels
    r"|open .{0,35}(menu|dropdown|navigation)\b"        # aria-label dropdown triggers
    r"|^(back to home|back to top|scroll to)\b",        # navigation utility labels
    re.IGNORECASE,
)


def is_cta_noise(text: str) -> bool:
    """Return True if the text looks like a stat, testimonial, or UI control — not a real CTA."""
    return bool(_NOISE_RE.search(text))


def is_meaningful_cta(text: str, *, max_len: int = 60) -> bool:
    """Return True if text is a plausible real CTA (not noise, right length)."""
    stripped = text.strip()
    return 3 <= len(stripped) <= max_len and not is_cta_noise(stripped)
