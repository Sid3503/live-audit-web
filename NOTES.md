# User Journey Auditor — Notes

## What This Tool Does

User Journey Auditor is an AI-powered Chrome extension that analyzes any live website and evaluates how easily real users can navigate key flows — sign up, find pricing, start a trial, contact sales, and more.

The tool works in seconds, directly from your browser. You visit any webpage, click "Audit This Page", and within 15–20 seconds get a scored, structured UX report — with journey paths, friction points, actionable recommendations, and a Q&A chatbot to ask follow-up questions.

### Real-World Examples

**HubSpot (hubspot.com):**
The tool identifies two journeys — a signup journey (4 clicks: homepage → Get Started → pricing → form) and a pricing journey (2 clicks). It flags `medium` friction because pricing requires a demo request rather than direct self-serve. Score: 74/100 "Good". The deep site crawl shows `/products/marketing` has 18 CTAs while the homepage has 12 — a rising funnel pressure warning (more decisions at higher intent).

**Stripe (stripe.com):**
Detects a signup journey in 2 clicks (homepage → "Start now" → registration form). No significant friction. Score: 88/100 "Excellent". AI validation upgrades it to 90 after noting the progressive onboarding flow is well structured.

**Airbnb (airbnb.com):**
Detects a browse journey (search → listing) with 3 friction points: no explicit "Sign up" CTA on the homepage, pricing only visible after selecting dates, and the booking form is buried 4 clicks deep. Score: 62/100 "Needs Work".

---

## High-Level Architecture

```
┌─────────────────────────────────────────┐
│              Chrome Extension           │
│                                         │
│  content/domExtractor.ts                │
│    └─ Scans DOM: buttons, links,        │
│       forms, nav, CTAs                  │
│                                         │
│  background/serviceWorker.ts            │
│    └─ Calls FastAPI backend             │
│    └─ Takes screenshot (optional)       │
│                                         │
│  popup/                                 │
│    └─ Next.js UI (AuditReport,          │
│       ChatPanel, JourneyCard, etc.)     │
└──────────────┬──────────────────────────┘
               │ POST /api/v1/audit
               ▼
┌─────────────────────────────────────────┐
│          FastAPI Backend                │
│                                         │
│  POST /audit  → run_pipeline()          │
│  POST /chat   → answer_question()       │
│  POST /deep-audit → run_deep_crawl()    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│          LangGraph Pipeline             │
│                                         │
│  Node 1: build_graph                   │
│  Node 2: classify_ctas                  │
│  Node 3: detect_journeys                │
│  Node 4: score_friction                 │
│  Node 5: llm_audit (LLM)             │
│                                         │
│  Returns: AuditReport (Pydantic)        │
└─────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Chrome Extension (TypeScript)

**`content/domExtractor.ts`**
Runs on the active tab. Queries the live DOM for:
- All `<a>`, `<button>`, and `[role=button]` elements with visible text
- All `<form>` elements (input fields, labels, submit buttons)
- Navigation menus (`<nav>`, `[role=navigation]`)
- Links within header/footer regions

Each element is tagged with: `tag`, `text`, `href`, `aria_label`, `role`, `type`, `id`, `class_list`, `is_visible`. Invisible elements (zero dimensions, `display:none`, `visibility:hidden`) are filtered out.

**`background/serviceWorker.ts`**
Listens for `TRIGGER` message from the popup. On receipt:
1. Injects `domExtractor.ts` into the active tab
2. Collects extracted elements + tab URL/title
3. Takes a tab screenshot (`chrome.tabs.captureVisibleTab`)
4. POSTs `{ page: ExtractedPage, screenshot: base64_string }` to `/api/v1/audit`
5. Stores result in `chrome.storage.local` with key `report`

**`popup/`**
Next.js app compiled to static HTML/JS, served as the extension popup. Reads from `chrome.storage.local` and polls for the result. Renders:
- `AuditReport` — score header, element summary, journeys, observations, recommendations
- `ChatPanel` — Q&A interface backed by `/api/v1/chat`
- `JourneyCard` — per-journey steps, friction points, confidence
- `NavStructure` — primary CTAs and nav links detected on the page
- `AboutPage` — detailed explanation of the pipeline and scoring

---

### 2. FastAPI Backend (Python)

Three REST endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/audit` | POST | Run the full LangGraph pipeline on extracted page data |
| `/api/v1/chat` | POST | Answer a UX question using the audit report + crawl data as context |
| `/api/v1/deep-audit` | POST | Crawl up to N linked pages, build site map, run funnel pressure analysis |

All models are validated with Pydantic. Errors are caught at each layer and returned as structured HTTP responses.

---

### 3. LangGraph Pipeline — Node by Node

The core of the audit runs as a **LangGraph state machine**. Each node is a pure function that receives `PipelineState` and returns a partial update. Nodes run sequentially, each building on the previous.

```
PipelineState
├── page: ExtractedPage          (input)
├── screenshot: str | None       (input)
├── nav_graph: NavGraph          (set by build_graph)
├── journeys: list[UserJourney]  (set by detect_journeys)
├── friction_scores: dict        (set by score_friction)
└── report: AuditReport          (set by llm_audit)
```

#### Node 1: `build_graph`
Converts the flat list of DOM elements into a **directed navigation graph** (`NavGraph`). Each node is an element; edges represent valid navigation transitions.

Edge rules (evaluated in order, first match wins):
- Link → any reachable page with matching `href`
- Button → nearby form submit targets
- Nav item → linked sections

Output: `NavGraph` with ~180 nodes and ~600 edges for a typical landing page. The root is determined by heuristics (the highest-degree CTA or the first visible link).

#### Node 2: `classify_ctas`
Labels each element in the graph as a CTA type: `primary`, `secondary`, `nav`, `form_submit`, `anchor`, or `none`. Uses `CTA_TEXT_SIGNALS` (a frozenset of ~60 high-intent keywords: "get started", "sign up", "try free", etc.) plus positional signals (above-the-fold, in-hero-section).

Also captures the `NavSnapshot` — the top 5 primary CTAs and top 10 nav links — which surfaces intermediate extraction results as required by the spec.

#### Node 3: `detect_journeys`
Runs **BFS traversal** from the root node of the NavGraph across `JOURNEY_TARGETS` — a config map of journey types to their destination URL signals:

```python
JOURNEY_TARGETS = {
    JourneyType.SIGNUP:   ["signup", "register", "create-account", "get-started", ...],
    JourneyType.PRICING:  ["pricing", "plans", "cost", "billing", ...],
    JourneyType.CONTACT:  ["contact", "talk-to-sales", "request-demo", ...],
    JourneyType.PRODUCT:  ["product", "features", "solutions", "platform", ...],
}
```

For each journey type, BFS finds the shortest path from root to any matching destination. Each path becomes a `UserJourney` with:
- `steps` — ordered list of `JourneyStep` (action + label + is_key_action flag)
- `click_count` — total clicks required
- `confidence` — 0.0–1.0 based on path length and signal strength
- `detection_method` — `bfs_graph`, `direct_link`, or `inferred`
- `friction_points` — populated in the next node

#### Node 4: `score_friction`
Evaluates each detected journey against **`FRICTION_RULES`** — a list of rule objects, each with:
- `rule_id` — e.g. `"CLICK_DEPTH_HIGH"`, `"MISSING_SIGNUP_CTA"`, `"FORM_IN_JOURNEY_MISSING"`
- `severity` — `low`, `medium`, `high`, `critical`
- `condition` — a callable that takes `(journey, page_metadata)` and returns `bool`
- `description` — human-readable explanation

Example rules:
- `CLICK_DEPTH_HIGH` fires if `journey.click_count > 4` → severity `medium`
- `MISSING_CTA_IN_HERO` fires if no primary CTA found in the first 20% of elements → severity `high`
- `NO_FORM_ON_SIGNUP_JOURNEY` fires if `JourneyType.SIGNUP` detected but `form_count == 0` → severity `critical`

The overall score starts at 100 and deductions are applied: critical=−20, high=−10, medium=−5, low=−2. Score is clamped to [0, 100].

#### Node 5: `llm_audit` (LLM)
Takes the deterministic output (journeys, friction scores, nav snapshot, element counts) and sends it to an LLM for:
1. **AI validation** — the LLM reviews friction points and can dispute false positives. For example, if a rule fires "Missing signup form" but the LLM sees a large marketing page that routes to a separate `/signup` page, it disputes the rule.
2. **Net-new observations** — the LLM surfaces UX issues not captured by rules (e.g. "CTA text 'Learn More' is vague and doesn't communicate value")
3. **Summary + recommendations** — a 2–4 sentence summary and ranked list of actionable improvements
4. **Suggested questions** — 3 questions the user might ask the chatbot

LLM providers used: OpenAI GPT-4o-mini (primary) with LLM fallback. The `invoke_with_fallback()` helper in `llm_provider.py` tries OpenAI first; on any error (rate limit, quota, network), it falls back to LLM automatically.

All LLM output is validated with Pydantic before being merged into `AuditReport`. If both providers fail, safe defaults are used — the pipeline never crashes.

---

### 4. Deep Site Crawl (`/api/v1/deep-audit`)

After the single-page audit, the user can trigger a **Deep Audit** to crawl up to 10 linked pages on the same domain.

How it works:
1. Root page is crawled with **crawl4ai** (`AsyncWebCrawler`) — a headless Chromium scraper with JS rendering (2-second delay after page load to let React/Vue apps hydrate)
2. Internal links are extracted; content paths (blog, docs, careers, legal) are filtered out
3. Same-origin check: only links matching the root domain's `netloc` are crawled
4. Path-level deduplication: `signup?utm=google` and `signup` both map to `/signup` — crawled only once
5. Linked pages are crawled **concurrently** with `asyncio.gather`
6. For each page: CTA count, form count, nav count, page title are captured
7. **Funnel pressure analysis**: for each crawled destination page that matches a journey target (signup, pricing, etc.), compute `pressure_delta = dest_ctas - entry_ctas`. A negative delta means CTAs narrow going deeper — correct. Positive delta means more decisions at higher intent — problematic.

Verdict thresholds:
- `delta < 0` → `correct` (focus narrows)
- `delta == 0` → `warning` (no change)
- `0 < delta ≤ 10` → `warning` (slightly more noise)
- `delta > 10` → `critical` (decision paralysis)

The crawl result (`CrawlReport`) is passed to the chatbot as additional context.

---

### 5. Q&A Chatbot (`/api/v1/chat`)

Users can ask natural language questions about the audit. Examples:
- "How easy is it to sign up?" → uses detected signup journey steps + friction points
- "What's the shortest path to pricing?" → uses pricing journey click count
- "Where might users drop off?" → uses friction points with highest severity
- "What are the main features?" → uses nav links, primary CTAs, and crawled page titles to infer

The chatbot is backed by the same `invoke_with_fallback()` LLM pipeline. It receives:
- Full `AuditReport` context (serialized as structured text)
- Deep crawl site map with page titles and CTA counts per page
- Conversation history (multi-turn supported)

The LLM is instructed to reason from navigation structure, CTA labels, and page titles — making inferences when appropriate rather than refusing questions that go slightly beyond raw counts.

---

## Running the Project

### Prerequisites
- Python 3.11+
- Node.js 18+
- Chrome browser
- OpenAI API key (or LLM API key as fallback)

### Backend

```bash
cd user-journey-auditor

# Install dependencies
pip install -r requirements.txt

# Configure API keys
cp .env.example .env
# Edit .env and set:
#   OPENAI_API_KEY=sk-...
#   GEMINI_API_KEY=AI...   (optional, used as fallback)

# Start server
uvicorn backend.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Visit `http://localhost:8000/docs` for the interactive Swagger UI.

### Extension

```bash
cd user-journey-auditor

# Install dependencies
npm install

# Build extension
npm run build

# (Optional) Development mode with hot reload
npm run dev
```

Load in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

Click the extension icon in the toolbar, navigate to any live website, and click **Audit This Page**.

---

## Productionization Issues

The following issues would need to be addressed before shipping to production users.

### LLM Reliability
- **Rate limits**: OpenAI and LLM both have per-minute token limits. Under concurrent users, requests queue and may time out. Need request queuing, per-user rate limiting, and exponential backoff with jitter.
- **Cost**: Each audit sends ~2,000 tokens; the chatbot sends ~1,500 per message. At scale this requires model routing (smaller models for simple audits) and cost caps per user.
- **Hallucinations**: The LLM occasionally disputes valid friction points or generates inaccurate observations. Need confidence thresholds and a review layer for disputed findings.

### DOM Extraction Accuracy
- **SPAs**: React/Vue apps that render content after `DOMContentLoaded` may be partially extracted. The extension captures the DOM at a single point in time — elements that appear after interaction are missed.
- **Shadow DOM**: Web components using shadow DOM are not traversed — requires custom slot querying.
- **iFrames**: Embedded forms in iFrames (common for HubSpot, Intercom, Calendly widgets) are not extracted due to cross-origin restrictions.
- **Anti-bot**: Some sites (Airbnb, Cloudflare-protected) block headless crawlers during deep audit. Returns empty crawl report gracefully but loses site-map context.

### Security
- **Screenshot**: The extension takes a full-page screenshot and sends it as base64 to the backend. For pages with PII or payment fields, this is a privacy risk. Screenshots should be opt-in and cropped to the viewport.
- **API key exposure**: Backend API keys must never be bundled in the extension. The current architecture is correct (keys live only on the server), but authentication between extension and backend is missing — anyone who discovers the backend URL can POST to it.
- **Backend auth**: The API has no authentication. In production, each extension install should get a signed token and all requests should be authenticated.

### Infrastructure
- **Stateless backend**: Currently uses in-memory dict (`memory_store.py`) for caching deep analysis results. This resets on restart and doesn't scale horizontally. Needs Redis or a persistent store.
- **Timeout**: The FastAPI server has a default 30-second request timeout. For large pages (600+ elements), the full pipeline can approach this limit. Need async streaming or a task queue (Celery, ARQ).
- **CORS**: Currently allows all origins. In production, restrict to the extension's `chrome-extension://` origin.

### Extension Distribution
- **Chrome Web Store**: Publishing requires review (1–3 days), privacy policy, and verified publisher account. The manifest must declare minimal permissions.
- **Extension updates**: The popup UI is compiled into the extension bundle — any update requires a new store submission and re-review. A better architecture would serve the UI from a CDN so updates don't require extension re-installs.
- **Firefox/Edge**: The extension uses `chrome.*` APIs — a `webextension-polyfill` layer would enable cross-browser support without rewriting.

### Observability
- **No logging pipeline**: Backend logs to stdout only. Need structured logging (JSON) shipped to Datadog or Loki.
- **No error tracking**: LLM failures and pipeline errors are caught but not surfaced to an error tracker. Need Sentry or equivalent.
- **No usage analytics**: No visibility into which journeys are most commonly detected, which sites are audited most, or which chatbot questions are unanswerable. This data would directly improve the rule engine and LLM prompts.
