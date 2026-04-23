# User Journey Auditor — Notes

> A deep-dive into how this tool works, why it was built this way, and what every moving part actually does.

---

## What Is It?

User Journey Auditor is an AI-powered Chrome extension that audits any live website and tells you how easy — or hard — it is for a real user to complete key actions: sign up, find pricing, contact sales, make a purchase, or just explore the product.

You visit a page, click **Audit This Page**, and within 15–20 seconds you get:

- A **0–100 UX score** with a qualitative label (Poor / Needs Work / Good / Excellent)
- **Detected user journeys** — the actual click paths a user would take, with step counts and confidence scores
- **Friction points** — specific issues that slow users down, each tagged with severity
- **AI observations** — things heuristics can't catch, like vague CTA copy or cognitive overload
- **Actionable recommendations** — ranked, specific, not generic
- **A Q&A chatbot** — ask follow-up questions about the audit in plain English
- **Deep site crawl** — crawl up to 10 linked pages and analyze funnel pressure across the site

---

## What Problem Does It Solve?

### Without this tool

UX audits are manual, slow, and expensive. A UX consultant reviews a site by hand, takes notes, and produces a report days later. The feedback is qualitative ("the signup flow feels long") with no data behind it. Developers don't know which specific elements to fix. Product teams can't track UX health over time.

Automated tools like Lighthouse measure performance and accessibility — not user journey quality. They don't tell you whether a user can actually find the signup button in 2 clicks or whether the pricing page is buried behind a demo request wall.

### With this tool

You get a structured, scored, reproducible UX audit in under 20 seconds — directly from your browser, on any live website. The output is specific enough to act on immediately: "The signup journey requires 6 clicks — reduce to 3 by surfacing the registration form on the homepage."

It works on competitor sites too. You can audit Stripe, HubSpot, or Notion and compare their UX scores against your own product.

---

## Real-World Examples

**Stripe (stripe.com)**
The tool detects a signup journey in 2 clicks: homepage → "Start now" → registration form. No significant friction. Score: **88/100 "Excellent"**. The AI notes the progressive onboarding flow is well-structured and upgrades the score to 90 after disputing a low-confidence "single-step journey" finding.

**HubSpot (hubspot.com)**
Detects two journeys — signup (4 clicks: homepage → Get Started → pricing → form) and pricing (2 clicks). Flags `medium` friction because pricing requires a demo request rather than direct self-serve. Score: **74/100 "Good"**. The deep site crawl shows `/products/marketing` has 18 CTAs while the homepage has 12 — a rising funnel pressure warning (more decisions at higher intent = bad design).

**Airbnb (airbnb.com)**
Detects a browse journey (search → listing) with 3 friction points: no explicit "Sign up" CTA on the homepage, pricing only visible after selecting dates, and the booking form is buried 4 clicks deep. Score: **62/100 "Needs Work"**. The AI observes that the search-first design prioritizes exploration over conversion — a deliberate product choice, but still a friction source for new users.

**A typical SaaS landing page**
Detects a signup journey via BFS graph traversal: `hero CTA ("Get Started") → pricing page → signup form`. Flags `competing-ctas` because there are 5 primary CTAs above the fold. Score: **58/100 "Needs Work"**. Recommendation: "Reduce above-fold CTAs to one primary action — users face decision paralysis with 5 competing options."

---

## The Chrome Extension — How It Works

The extension has three TypeScript modules that run in different browser contexts.

### Content Script: `domExtractor.ts`

This runs directly inside the page you're auditing — it has full access to the live DOM.

It queries the DOM for every interactive element using a role-based selector map:

```typescript
// From elementParser.ts — the selector map drives extraction
const ROLE_SELECTOR_MAP = {
  cta: ["button", "[role='button']", "input[type='submit']", "[data-cta]", ".cta", ...],
  nav: ["nav a", "header a", "[role='navigation'] a", "[role='menuitem']", ...],
  form: ["form", "[role='form']"],
  link: ["main a", "article a", "section a", "footer a"],
  input: ["input:not([type='hidden'])", "textarea", "select"],
}
```

For each matched element, it captures:
- `text` — from `aria-label`, `title`, `alt`, or `innerText` (in that priority order)
- `role` — inferred from tag, ARIA role, CSS class, and CTA text signals
- `importance` — `primary` if the text matches a high-intent keyword ("get started", "sign up", "try free"), `secondary` otherwise
- `position` — `{x, y}` from `getBoundingClientRect()`
- `visible` — filtered out if `display:none`, `visibility:hidden`, zero dimensions, or opacity 0
- `href` — for links and CTAs, the destination URL

It also traverses **shadow DOM** — web components built with Lit, Stencil, or custom elements are fully supported.

After extraction, it sends an `EXTRACTED` message to the background service worker with the full `ExtractedPage` payload.

**SPA support:** The extractor re-runs automatically on navigation. It watches three signals:
1. `popstate` events (React Router, Next.js, Vue Router)
2. `<title>` element mutations (reliable SPA route change signal)
3. Large DOM replacements (>15 nodes added at once)

All re-extractions are debounced by 1 second to avoid flooding the background with partial renders.

### Background Service Worker: `serviceWorker.ts`

The service worker is the network layer. It never touches the DOM — it only handles messages and makes API calls.

Message types it handles:

| Message | What it does |
|---|---|
| `EXTRACTED` | Stores the extracted page in `chrome.storage.local` |
| `TRIGGER` | Captures a screenshot, then POSTs to `/api/v1/audit` |
| `GET_REPORT` | Returns the stored report from `chrome.storage.local` |
| `DEEP_AUDIT` | POSTs to `/api/v1/deep-audit` for a multi-page crawl |

The screenshot is captured with `chrome.tabs.captureVisibleTab()` — a PNG encoded as a base64 data URL. It's sent to the backend alongside the extracted page data, enabling the LLM to visually ground its observations (e.g., "the hero section has low contrast" or "the CTA is below the fold on mobile").

### Message Router: `messageRouter.ts`

A thin type-safe dispatch layer. It validates the message shape, routes to the correct handler, and returns `{ok: true}` or `{ok: false, error: string}` to the sender. This keeps `serviceWorker.ts` clean — no `if (message.type === ...)` chains.

### Popup UI

A Next.js app compiled to static HTML/JS and served as the extension popup. It reads from `chrome.storage.local` and renders:
- Score header with qualitative label
- Element summary (total elements, CTAs, forms, nav links)
- Journey cards — per-journey steps, friction points, confidence, detection method
- AI observations and recommendations
- Nav snapshot — primary CTAs and nav links detected on the page
- Chat panel — Q&A interface backed by `/api/v1/chat`
- Deep audit panel — site map and funnel pressure analysis

---

## The Backend — How It Works

The backend is a FastAPI server with three endpoints and a LangGraph pipeline at its core.

### API Endpoints

```
POST /api/v1/audit        → Run the full LangGraph pipeline
POST /api/v1/chat         → Answer a question about a completed audit
POST /api/v1/deep-audit   → Crawl linked pages and analyze funnel pressure
GET  /api/v1/deep-analysis → Poll for deep crawl result (cached 15 min)
GET  /health              → Health check
```

### Data Models

Everything is validated with Pydantic. The key models:

**`ExtractedPage`** — what the extension sends:
```python
ExtractedPage(
    url="https://stripe.com",
    title="Stripe | Financial Infrastructure for the Internet",
    elements=[
        PageElement(id="button-start-now-0", text="Start now", tag="button",
                    role=ElementRole.CTA, importance=ElementImportance.PRIMARY,
                    href="https://dashboard.stripe.com/register",
                    position=Position(x=120, y=340), visible=True, path="header > nav > button"),
        ...
    ],
    metadata=PageMetadata(total_elements=47, cta_count=8, form_count=0, nav_count=12, extracted_at="...")
)
```

**`AuditReport`** — what the pipeline returns:
```python
AuditReport(
    url="https://stripe.com",
    overall_score=90,
    qualitative_label="Excellent",
    journeys=[UserJourney(type=JourneyType.SIGNUP, steps=[...], click_count=2, confidence=0.85)],
    friction_points=[],
    disputed_findings=[],
    llm_observations=[LLMObservation(observation="Progressive onboarding reduces signup friction", ...)],
    recommendations=["Add a pricing comparison table...", ...],
    suggested_questions=["How does the signup flow compare to competitors?", ...],
    summary="Stripe's homepage presents a clear, low-friction signup path...",
)
```

---

## The LangGraph Pipeline — Node by Node

This is the core of the tool. The pipeline is a **LangGraph state machine** — a directed graph of pure functions, each receiving the current state and returning a partial update. No node has side effects beyond logging.

```
START
  ↓
build_graph_node       → Converts elements into a navigation graph
  ↓
classify_ctas_node     → LLM batch-classifies primary CTAs by intent
  ↓
detect_journeys_node   → BFS traversal finds user journey paths
  ↓
score_friction_node    → Applies heuristic rules to detect friction
  ↓
llm_audit_node         → LLM validates findings, adds observations, scores
  ↓
END → AuditReport
```

The state object passed between nodes:

```python
PipelineState(
    extracted_page=...,       # Input: from extension
    screenshot=...,           # Input: optional base64 PNG
    nav_graph=...,            # Set by: build_graph_node
    cta_classifications={},   # Set by: classify_ctas_node
    journeys=[],              # Set by: detect_journeys_node
    page_friction_points=[],  # Set by: score_friction_node
    report=None,              # Set by: llm_audit_node
    status="building_graph",
)
```

### Node 1: `build_graph_node`

Converts the flat list of DOM elements into a **directed navigation graph** (`NavGraph`). Each element is a node; edges represent valid navigation transitions.

Edge rules (evaluated in order, first match wins):

```python
EDGE_RULES = [
    EdgeRule("cta-chain",      # primary CTA → secondary CTA/link
             lambda a, b: a.importance == "primary" and b.importance == "secondary"
                          and a.role == "cta" and b.role in ("cta", "link")),

    EdgeRule("nav-to-cta",     # nav link → CTA (within 300px vertical proximity)
             lambda a, b: a.role == "nav" and b.role == "cta"
                          and abs(a.position.y - b.position.y) < 300),

    EdgeRule("input-to-submit", # form input → submit button
             lambda a, b: a.role == "input" and b.role == "cta" and b.tag in ("button", "input")),

    EdgeRule("proximity-link",  # link → CTA (within 80px — same CTA group)
             lambda a, b: a.role == "link" and b.role == "cta"
                          and abs(a.position.y - b.position.y) < 80),
]
```

The root node is the highest-importance element closest to the top of the page — typically the hero CTA.

A typical landing page produces ~180 nodes and ~600 edges.

### Node 2: `classify_ctas_node`

Before journey detection, the LLM gets a chance to classify CTAs that heuristics might miss — branded copy, non-English text, or marketing language that doesn't match the keyword list.

Example: "Get Notion free" doesn't match any exact signal in `JOURNEY_TARGETS[SIGNUP]`, but the LLM correctly classifies it as `signup`.

The node sends all primary CTAs to the LLM in a single batch call:

```
Input to LLM:
  0: Get Notion free
  1: See all features
  2: Talk to an expert
  3: Watch a demo

LLM output:
  {"classifications": [
    {"index": 0, "type": "signup"},
    {"index": 2, "type": "contact"},
    {"index": 3, "type": "contact"}
  ]}
```

The result is stored as `cta_classifications: {element_id → journey_type}` and used as a third signal source in the next node. If the LLM fails, the node returns an empty dict and the pipeline continues without it.

### Node 3: `detect_journeys_node`

This is where the actual journey paths are found. The detector uses **three signal layers** in combination:

**Layer 1 — Exact keyword signals** (`JOURNEY_TARGETS`):
```python
JOURNEY_TARGETS = {
    JourneyType.SIGNUP:   ["sign up", "signup", "register", "get started", "try free", "start free", ...],
    JourneyType.PRICING:  ["pricing", "plans", "cost", "billing", "subscription", ...],
    JourneyType.CONTACT:  ["contact", "talk to sales", "request demo", "book a demo", ...],
    JourneyType.PURCHASE: ["buy", "purchase", "checkout", "add to cart", "buy now", ...],
    JourneyType.EXPLORE:  ["learn more", "features", "about", "how it works", "tour", ...],
}
```

**Layer 2 — Regex intent patterns** (`INTENT_PATTERNS`):
```python
# Catches branded/variant CTAs the signal list misses
INTENT_PATTERNS = {
    JourneyType.SIGNUP: re.compile(
        r"\b(get|start|begin|join|create|open|try|access|claim|unlock)\b.{0,30}\b(free|account|trial|access|started)\b"
        r"|\b(sign|log)\s*(up|in|into|on)\b"
        r"|\b(register|subscribe|enroll)\b",
        re.IGNORECASE,
    ),
    # ... similar patterns for CONTACT, PRICING, PURCHASE, EXPLORE
}
```

**Layer 3 — LLM classifications** (from `classify_ctas_node`):
The element IDs classified by the LLM in the previous node.

For each journey type, the detector takes the union of all three layers as target elements, then runs **BFS** from the graph root to find the shortest path:

```python
# Simplified BFS
def _bfs_path(graph, elements_by_id, root_id, target_ids) -> list[str]:
    queue = deque([[root_id]])
    visited = {root_id}
    while queue:
        path = queue.popleft()
        if path[-1] in target_ids:
            return path  # shortest path found
        for neighbor in adjacency[path[-1]]:
            if neighbor not in visited:
                queue.append(path + [neighbor])
    return []
```

If BFS finds a path → `DetectionMethod.BFS_GRAPH` (most reliable, confidence 0.70–0.95)
If BFS fails but heuristics matched → `DetectionMethod.TEXT_MATCH` (fallback, confidence 0.30–0.45)
If only LLM matched → `DetectionMethod.LLM_CLASSIFIED` (semantic, confidence 0.55–0.70)

Each detected journey becomes a `UserJourney`:
```python
UserJourney(
    type=JourneyType.SIGNUP,
    steps=[
        JourneyStep(element_id="button-get-started-0", label="Get Started", action="click", is_key_action=True),
        JourneyStep(element_id="a-pricing-3", label="Pricing", action="navigate", is_key_action=False),
        JourneyStep(element_id="button-start-trial-7", label="Start Trial", action="click", is_key_action=True),
    ],
    click_count=2,
    confidence=0.85,
    detection_method=DetectionMethod.BFS_GRAPH,
    entry_point="Get Started",
    exit_point="Start Trial",
    key_actions=["Get Started", "Start Trial"],
)
```

### Node 4: `score_friction_node`

Applies two sets of rules:

**Per-journey rules** (`FRICTION_RULES`) — evaluated once per detected journey:

| Rule ID | Condition | Severity | Type |
|---|---|---|---|
| `too-many-clicks` | `click_count > 5` | HIGH | `navigation-depth` |
| `signup-no-form` | Signup journey, no form on page, CTA doesn't link externally | MEDIUM | `missing-form` |
| `single-step-journey` | `click_count == 0` and `steps < 2` | LOW | `incomplete-journey` |
| `dead-end-cta` | Last step is a CTA with no `href` or `href="#"` | MEDIUM | `dead-end` |

**Page-level rules** (`PAGE_FRICTION_RULES`) — evaluated exactly once per page, regardless of journey count:

| Rule ID | Condition | Severity | Type |
|---|---|---|---|
| `no-primary-cta` | `cta_count == 0` | CRITICAL | `missing-cta` |
| `no-nav-links` | `nav_count == 0` | HIGH | `missing-navigation` |
| `competing-ctas` | >3 distinct primary CTAs above y=600px | MEDIUM | `cta-overload` |

The page-level rules are applied once — not once per journey. This prevents a `missing-cta` finding from tripling the score penalty just because three journeys were detected.

### Node 5: `llm_audit_node`

The final node sends the deterministic output to an LLM for validation and enrichment.

**What the LLM receives:**
```
Page: Stripe | Financial Infrastructure for the Internet
URL: https://stripe.com
Score (pre-validation): 88/100
Elements: 47 total | 8 CTAs | 0 forms | 12 nav links

Key interactive elements found:
  - Start now
  - Contact sales
  - See the docs
  - Explore Stripe

Detected journeys:
  [signup] 3 steps, 2 clicks, method=bfs_graph, confidence=0.85
    path: Start now → Create your account → Verify email
  [contact] 2 steps, 1 click, method=text_match, confidence=0.40
    path: Contact sales

Heuristic friction findings to validate:
  rule_id=incomplete-journey | severity=low | journey=contact | confidence=0.4 | description=Journey is a direct single action
```

**What the LLM returns (validated with Pydantic):**
```json
{
  "summary": "Stripe presents a clear, low-friction signup path with minimal clicks. The contact journey is intentionally direct — a single CTA routing to a sales form is appropriate for an enterprise product.",
  "recommendations": [
    "Add a pricing comparison table to the homepage to reduce the need to navigate to /pricing",
    "Surface the API documentation link more prominently for developer audiences"
  ],
  "disputed_findings": [
    {
      "rule_id": "incomplete-journey",
      "severity": "low",
      "dispute_reason": "A single-step contact CTA is appropriate for enterprise sales — forcing more steps would add friction, not reduce it"
    }
  ],
  "observations": [
    {"observation": "The hero section uses high-contrast CTAs with clear value propositions", "severity": "low", "category": "visual_hierarchy"},
    {"observation": "Developer-focused copy ('API', 'docs') may alienate non-technical buyers", "severity": "medium", "category": "audience_targeting"}
  ],
  "suggested_questions": [
    "How does Stripe's signup flow compare to typical SaaS benchmarks?",
    "What's the shortest path to the API documentation?",
    "Are there any accessibility issues with the navigation structure?"
  ]
}
```

**Scoring after LLM validation:**

1. Disputed findings are retained at **25% of their original penalty** (uncertain, not proven wrong)
2. If any disputes exist, the score is capped at **99** (uncertainty means no perfect score)
3. A **page floor** is applied based on structural composition:
   - 0 elements → floor 30
   - No CTAs + no nav → floor 40
   - No CTAs → floor 65
   - No nav → floor 75
   - Healthy page → no floor

The page floor prevents empty or blocked pages from scoring 100 just because no friction rules fired.

**LLM provider fallback:**

```python
# llm_provider.py — tries OpenAI first, falls back to Google Gemini
def invoke_with_fallback(messages, json_mode=False) -> tuple[str, Provider]:
    providers = []
    if OPENAI_API_KEY:   providers.append("openai")
    if GEMINI_API_KEY:   providers.append("google")

    for provider in providers:
        try:
            response = client.invoke(messages)
            return response.content, provider
        except Exception:
            continue  # try next provider

    raise RuntimeError("All LLM providers failed")
```

If both providers fail, the pipeline uses safe defaults — a generic summary, two fallback recommendations, and no disputed findings. The pipeline never crashes.

**Vision support:** If a screenshot was captured, the LLM receives it alongside the text prompt via the OpenAI vision API. This enables visual observations like "the primary CTA is below the fold" or "the form has low contrast against the background."

---

## The Scoring System

The score starts at 100 and deductions are applied:

```
Severity weights:
  CRITICAL → -40 points
  HIGH     → -20 points
  MEDIUM   → -10 points
  LOW      → -5 points

Each penalty is scaled by journey confidence:
  penalty = severity_weight × journey_confidence × dispute_factor

Page-level friction uses confidence = 1.0 (structural fact, not probabilistic)

Special rule: if ALL friction is LOW severity, cap total penalty at 10
  (prevents a page with many minor issues from scoring worse than one with a single HIGH issue)
```

Example calculation:
```
Journey: SIGNUP, confidence=0.85
  Friction: too-many-clicks (HIGH, weight=20)
  Penalty: 20 × 0.85 = 17 points

Page friction: competing-ctas (MEDIUM, weight=10)
  Penalty: 10 × 1.0 = 10 points

Total penalty: 27 points
Score: 100 - 27 = 73 → "Good"
```

---

## The Deep Site Crawl

After the single-page audit, users can trigger a **Deep Audit** to crawl up to 10 linked pages on the same domain.

The crawl uses **crawl4ai** — a headless Chromium scraper with a 2-second JS rendering delay, so React/Vue apps fully hydrate before extraction.

**Funnel pressure analysis:**

The key insight is that CTAs should *narrow* as users go deeper into a funnel. If a destination page has *more* CTAs than the entry page, users face more decisions at higher intent — that's bad design.

```python
VERDICT_RULES = [
    {"condition": lambda d: d < 0,       "verdict": "correct",  "label": "focus narrows"},
    {"condition": lambda d: d == 0,      "verdict": "warning",  "label": "no change"},
    {"condition": lambda d: 0 < d <= 10, "verdict": "warning",  "label": "slightly more noise"},
    {"condition": lambda d: d > 10,      "verdict": "critical", "label": "decision paralysis"},
]
```

Example output for HubSpot:
```
Homepage (12 CTAs) → /products/marketing (18 CTAs)
  delta = +6 → verdict: "warning" (slightly more noise)

Homepage (12 CTAs) → /pricing (4 CTAs)
  delta = -8 → verdict: "correct" (focus narrows)
```

Content paths (blog, docs, careers, legal) are filtered out — they're not part of conversion funnels. Binary file links (.dmg, .exe, .apk) are skipped entirely.

---

## The Q&A Chatbot

After an audit, users can ask natural language questions:

- "How easy is it to sign up?" → uses detected signup journey steps + friction points
- "What's the shortest path to pricing?" → uses pricing journey click count
- "Where might users drop off?" → uses friction points with highest severity
- "What are the main features?" → infers from nav links, primary CTAs, and crawled page titles
- "How does this compare to Stripe?" → requires running a separate audit on Stripe first

The chatbot receives the full `AuditReport` as structured context, plus the deep crawl site map if available. It's instructed to reason from navigation structure and CTA labels — making inferences when appropriate, not refusing questions that go slightly beyond raw counts.

Multi-turn conversation is supported — the full history is sent with each request.

---

## Config-Driven Design

All tunable behavior lives in `backend/config/`. Nothing is hardcoded in the pipeline nodes.

| File | What it controls |
|---|---|
| `journey_targets.py` | What text signals and regex patterns count as each journey type |
| `rule_config.py` | What conditions trigger friction, and at what severity |
| `severity_weights.py` | How friction severity maps to score deductions |
| `selector_config.py` | Which CSS selectors to use for DOM extraction |

To add a new journey type (e.g., `DEMO`), you add it to `JourneyType` enum, add signals to `JOURNEY_TARGETS`, and optionally add a regex to `INTENT_PATTERNS`. No pipeline code changes needed.

To add a new friction rule, you add a `FrictionRule` to `FRICTION_RULES` with a condition lambda. The rule engine picks it up automatically.

---

## Productionization Issues

These are the known gaps between the current implementation and a production-ready system.

### LLM Reliability
- **Rate limits:** OpenAI and Gemini both have per-minute token limits. Under concurrent users, requests queue and may time out. Need request queuing, per-user rate limiting, and exponential backoff with jitter.
- **Cost:** Each audit sends ~2,000 tokens; the chatbot sends ~1,500 per message. At scale this requires model routing (smaller models for simple audits) and cost caps per user.
- **Hallucinations:** The LLM occasionally disputes valid friction points or generates inaccurate observations. The 25% dispute retention partially mitigates this — disputed findings still contribute to the score.

### DOM Extraction Accuracy
- **SPAs:** React/Vue apps that render content after `DOMContentLoaded` may be partially extracted. The extension captures the DOM at a single point in time — elements that appear after interaction are missed.
- **Shadow DOM:** The extractor traverses shadow roots, but deeply nested shadow trees (shadow-in-shadow) may be missed.
- **iFrames:** Embedded forms in iFrames (HubSpot, Intercom, Calendly widgets) are not extracted due to cross-origin restrictions.
- **Anti-bot:** Some sites (Airbnb, Cloudflare-protected) block headless crawlers during deep audit. The service returns an empty crawl report gracefully.

### Security
- **Screenshot PII:** The extension takes a full-page screenshot and sends it as base64 to the backend. For pages with PII or payment fields, this is a privacy risk. Screenshots should be opt-in and cropped to the viewport.
- **Backend auth:** The API has no authentication. In production, each extension install should get a signed token and all requests should be authenticated.
- **CORS:** Currently allows all origins (`allow_origins=["*"]`). In production, restrict to the extension's `chrome-extension://` origin.

### Infrastructure
- **Stateless backend:** Uses in-memory dict (`memory_store.py`) for caching deep analysis results. This resets on restart and doesn't scale horizontally. Needs Redis or a persistent store.
- **Timeout:** FastAPI's default 30-second request timeout. For large pages (600+ elements), the full pipeline can approach this limit. Need async streaming or a task queue (Celery, ARQ).

### Extension Distribution
- **Chrome Web Store:** Publishing requires review (1–3 days), privacy policy, and verified publisher account.
- **Extension updates:** The popup UI is compiled into the extension bundle — any update requires a new store submission. A better architecture would serve the UI from a CDN.
- **Firefox/Edge:** The extension uses `chrome.*` APIs — a `webextension-polyfill` layer would enable cross-browser support.

### Observability
- **No logging pipeline:** Backend logs to stdout only. Need structured JSON logging shipped to Datadog or Loki.
- **No error tracking:** LLM failures and pipeline errors are caught but not surfaced to an error tracker. Need Sentry or equivalent.
- **No usage analytics:** No visibility into which journeys are most commonly detected, which sites are audited most, or which chatbot questions are unanswerable.
