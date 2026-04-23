# Architecture

> A complete map of the project — every file, every folder, every connection.

---

## Project Structure

```
user-journey-auditor/
├── extension/                    # Chrome Extension (TypeScript, MV3)
│   ├── manifest.json             # Extension manifest — permissions, entry points
│   ├── assets/icons/             # Extension icons (16px, 48px, 128px)
│   ├── background/
│   │   ├── serviceWorker.ts      # Background service worker — API calls, storage
│   │   └── messageRouter.ts      # Type-safe message dispatch
│   └── content/
│       ├── domExtractor.ts       # Content script — DOM traversal, element extraction
│       ├── elementParser.ts      # Role/importance detection, selectors, ID generation
│       └── visibilityDetector.ts # Visibility checks, viewport position
│
├── backend/                      # FastAPI Backend (Python 3.11+)
│   ├── main.py                   # FastAPI app, CORS, router registration
│   ├── api/
│   │   └── routes.py             # REST endpoints: /audit, /chat, /deep-audit
│   ├── pipeline/                 # LangGraph pipeline
│   │   ├── graph.py              # StateGraph definition and compilation
│   │   ├── state.py              # PipelineState, NavGraph, NavEdge models
│   │   └── nodes/
│   │       ├── build_graph.py    # Node 1: elements → NavGraph
│   │       ├── classify_ctas.py  # Node 2: LLM batch CTA classification
│   │       ├── detect_journeys.py # Node 3: BFS journey detection
│   │       ├── score_friction.py # Node 4: friction rule evaluation
│   │       ├── llm_audit.py      # Node 5: LLM validation + AuditReport assembly
│   │       ├── llm_provider.py   # OpenAI/Gemini client with fallback
│   │       └── llm_chat.py       # Q&A chatbot over AuditReport
│   ├── core/                     # Pure business logic (no LangGraph dependency)
│   │   ├── graph_builder.py      # NavGraph construction from elements
│   │   ├── journey_detector.py   # BFS + text match + LLM signal detection
│   │   ├── rule_engine.py        # Friction rule evaluation
│   │   ├── score_calculator.py   # 0-100 score computation
│   │   ├── crawl_service.py      # Deep crawl + funnel pressure analysis
│   │   └── memory_store.py       # In-memory cache (15-min TTL)
│   ├── models/                   # Pydantic data models
│   │   ├── element.py            # PageElement, ExtractedPage, PageMetadata
│   │   ├── journey.py            # UserJourney, JourneyStep, FrictionPoint
│   │   └── report.py             # AuditReport, CrawlReport, DisputedFinding
│   ├── config/                   # All tunable behavior — no logic in pipeline nodes
│   │   ├── journey_targets.py    # Signal lists + regex patterns per journey type
│   │   ├── rule_config.py        # Friction rules with conditions and severities
│   │   ├── severity_weights.py   # Severity → numeric score weight mapping
│   │   └── selector_config.py    # CSS selectors for DOM extraction
│   └── utils/
│       ├── logger.py             # Logging configuration
│       ├── id_generator.py       # Deterministic element ID generation
│       └── text_matcher.py       # Text normalization and matching helpers
│
├── tests/
│   ├── fixtures/
│   │   ├── sample_dom.json       # Example ExtractedPage for testing
│   │   └── sample_journeys.json  # Example journeys for testing
│   ├── unit/
│   │   ├── test_graph_builder.py
│   │   ├── test_journey_detector.py
│   │   ├── test_rule_engine.py
│   │   ├── test_score_calculator.py
│   │   └── test_confidence_and_graph.py
│   └── integration/
│       └── test_pipeline.py      # Full pipeline run without LLM key
│
├── package.json                  # Node.js build config (Vite, React, TypeScript)
├── requirements.txt              # Python dependencies
├── pytest.ini                    # Pytest configuration
├── tailwind.config.ts            # Tailwind CSS config
├── postcss.config.js             # PostCSS config
├── vite.config.ts                # Vite build config (extension bundling)
├── fix-export.js                 # Post-build script: fix Next.js static export
├── patch-manifest.js             # Post-build script: patch extension manifest
└── extract-inline.js             # Post-build script: extract inline scripts
```

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Chrome Extension                        │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Content Script (domExtractor.ts)                   │    │
│  │  Runs inside the audited page                       │    │
│  │  • Queries DOM with ROLE_SELECTOR_MAP               │    │
│  │  • Traverses shadow DOM for web components          │    │
│  │  • Filters invisible elements                       │    │
│  │  • Re-extracts on SPA navigation (debounced 1s)     │    │
│  │  • Sends EXTRACTED → background                     │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │ chrome.runtime.sendMessage         │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │  Background Service Worker (serviceWorker.ts)        │    │
│  │  • Stores extracted page in chrome.storage.local    │    │
│  │  • On TRIGGER: captures screenshot, calls /audit    │    │
│  │  • On DEEP_AUDIT: calls /deep-audit                 │    │
│  │  • Stores report in chrome.storage.local            │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │ chrome.storage.local               │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │  Popup UI (Next.js → static HTML/JS)                │    │
│  │  • Reads report from storage                        │    │
│  │  • Renders score, journeys, friction, observations  │    │
│  │  • Chat panel → POST /api/v1/chat                   │    │
│  │  • Deep audit panel → DEEP_AUDIT message            │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────┬───────────────────────────────┘
                               │ POST /api/v1/audit
                               │ POST /api/v1/chat
                               │ POST /api/v1/deep-audit
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                         │
│                                                              │
│  routes.py                                                   │
│  ├── POST /audit        → run_pipeline(page, screenshot)     │
│  ├── POST /chat         → answer_question(question, report)  │
│  ├── POST /deep-audit   → run_deep_crawl(url, max_pages)     │
│  └── GET  /deep-analysis → get_result(url) from memory_store │
│                                                              │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    LangGraph Pipeline                        │
│                                                              │
│  PipelineState flows through 5 sequential nodes:            │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │ build_graph │ → │classify_ctas │ → │detect_journeys   │  │
│  │             │   │  (LLM call)  │   │  (BFS + signals) │  │
│  └─────────────┘   └──────────────┘   └────────┬─────────┘  │
│                                                 │            │
│  ┌──────────────────────────────────────────────▼─────────┐  │
│  │  score_friction → llm_audit → AuditReport              │  │
│  │  (rule engine)    (LLM call)                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## User Flow

### Single-Page Audit

```
1. User navigates to any website in Chrome

2. domExtractor.ts runs automatically (document_idle)
   └─ Extracts visible elements: CTAs, nav, forms, links, inputs
   └─ Sends EXTRACTED message to service worker
   └─ Service worker stores in chrome.storage.local

3. User opens extension popup, clicks "Audit This Page"
   └─ Popup sends TRIGGER message to service worker

4. Service worker:
   └─ Reads extracted_page from chrome.storage.local
   └─ Captures screenshot with chrome.tabs.captureVisibleTab()
   └─ Sets status = "auditing"
   └─ POSTs {page, screenshot} to POST /api/v1/audit

5. FastAPI receives request
   └─ Validates ExtractedPage with Pydantic
   └─ Calls run_pipeline(page, screenshot)

6. LangGraph pipeline runs (5 nodes, ~3-8 seconds):
   └─ build_graph:      elements → NavGraph (nodes + edges)
   └─ classify_ctas:    LLM classifies primary CTAs by intent
   └─ detect_journeys:  BFS finds journey paths (signup, pricing, contact, ...)
   └─ score_friction:   rules evaluate each journey + page structure
   └─ llm_audit:        LLM validates findings, adds observations, builds AuditReport

7. FastAPI returns AuditReport JSON

8. Service worker stores report in chrome.storage.local
   └─ Sets status = "done"

9. Popup reads report from storage
   └─ Renders score, journeys, friction points, observations, recommendations
   └─ Displays suggested questions for the chatbot
```

### Deep Site Crawl

```
1. User clicks "Deep Audit" in popup
   └─ Popup sends DEEP_AUDIT message with root URL and max_pages

2. Service worker POSTs to POST /api/v1/deep-audit

3. Backend runs run_deep_crawl(url, max_pages):
   └─ Crawls root URL with crawl4ai (headless Chromium, 2s JS delay)
   └─ Extracts internal links, filters content paths and binary files
   └─ Crawls linked pages concurrently (asyncio.gather)
   └─ Counts CTAs, forms, nav links per page
   └─ Detects funnel flows: root → destination pages with journey tags
   └─ Computes pressure_delta = dest_ctas - entry_ctas per flow
   └─ Assigns verdict: correct / warning / critical

4. Returns CrawlReport with site_map and funnel_flows

5. Service worker stores crawl_report in chrome.storage.local

6. Popup renders site map and funnel pressure analysis
```

### Q&A Chatbot

```
1. User types a question in the chat panel

2. Popup POSTs to POST /api/v1/chat:
   {question, report: AuditReport, history: ChatMessage[], crawl_data?}

3. Backend calls answer_question(question, report, history, crawl_data):
   └─ Builds context string from AuditReport (journeys, friction, observations)
   └─ Appends deep crawl context if available (site map, funnel flows)
   └─ Builds message list: [SystemMessage, HumanMessage(context), ...history, HumanMessage(question)]
   └─ Calls invoke_with_fallback(messages)

4. LLM generates answer grounded in audit data

5. Returns ChatResponse {answer}

6. Popup appends to chat history and displays
```

---

## LangGraph Flow

```
START
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  build_graph_node                                           │
│                                                             │
│  Input:  extracted_page.elements (flat list)                │
│  Output: nav_graph (NavGraph with nodes + edges)            │
│                                                             │
│  Algorithm:                                                 │
│  1. Find root: highest-importance element nearest top       │
│  2. For each element pair, apply EDGE_RULES (first match):  │
│     • cta-chain:      primary CTA → secondary CTA/link      │
│     • nav-to-cta:     nav link → CTA (within 300px)         │
│     • input-to-submit: form input → submit button           │
│     • proximity-link: link → CTA (within 80px)              │
│  3. Return NavGraph(node_ids, edges, root_id)               │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  classify_ctas_node                                         │
│                                                             │
│  Input:  extracted_page.elements (primary CTAs only)        │
│  Output: cta_classifications {element_id → journey_type}    │
│                                                             │
│  Algorithm:                                                 │
│  1. Filter: role=cta, importance=primary, non-empty text    │
│  2. Send all labels to LLM in single batch call             │
│  3. LLM classifies by intent (not just keywords)            │
│  4. Store {element_id → journey_type} in state              │
│  5. On failure: return empty dict, continue pipeline        │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  detect_journeys_node                                       │
│                                                             │
│  Input:  nav_graph, cta_classifications                     │
│  Output: journeys (list[UserJourney])                       │
│                                                             │
│  For each JourneyType (signup, pricing, contact, ...):      │
│                                                             │
│  Layer 1: Exact signals (JOURNEY_TARGETS)                   │
│    "sign up", "get started", "try free", ...                │
│                                                             │
│  Layer 2: Regex patterns (INTENT_PATTERNS)                  │
│    r"\b(get|start|join)\b.{0,30}\b(free|account)\b"        │
│                                                             │
│  Layer 3: LLM classifications (cta_classifications)         │
│    element_ids classified as this journey type              │
│                                                             │
│  target_ids = Layer1 ∪ Layer2 ∪ Layer3                      │
│                                                             │
│  BFS from root → any target_id                              │
│    Found:    DetectionMethod.BFS_GRAPH   (conf 0.70–0.95)   │
│    Not found + heuristics: TEXT_MATCH    (conf 0.30–0.45)   │
│    Not found + LLM only:   LLM_CLASSIFIED (conf 0.55–0.70)  │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  score_friction_node                                        │
│                                                             │
│  Input:  journeys, extracted_page                           │
│  Output: journeys (with friction_points), page_friction_points│
│                                                             │
│  Per-journey rules (FRICTION_RULES):                        │
│    too-many-clicks:    click_count > 5 → HIGH               │
│    signup-no-form:     signup + no form + no external link  │
│                        → MEDIUM                             │
│    single-step-journey: click_count=0, steps<2 → LOW        │
│    dead-end-cta:       last step CTA has no href → MEDIUM   │
│                                                             │
│  Page-level rules (PAGE_FRICTION_RULES) — applied once:     │
│    no-primary-cta:     cta_count == 0 → CRITICAL            │
│    no-nav-links:       nav_count == 0 → HIGH                │
│    competing-ctas:     >3 primary CTAs above y=600 → MEDIUM │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  llm_audit_node                                             │
│                                                             │
│  Input:  journeys, page_friction_points, screenshot?        │
│  Output: report (AuditReport)                               │
│                                                             │
│  1. Compute pre-validation score (score_calculator)         │
│  2. Build audit prompt (journeys + friction + metadata)     │
│  3. Call LLM (vision if screenshot, text otherwise)         │
│     → summary, recommendations, disputed_findings,          │
│       observations, suggested_questions                     │
│  4. Re-score with disputed findings at 25% weight           │
│  5. Cap at 99 if any disputes exist                         │
│  6. Apply page floor (structural minimum)                   │
│  7. Assemble AuditReport                                    │
│                                                             │
│  LLM fallback chain:                                        │
│    OpenAI GPT-4o-mini → Google Gemini → safe defaults       │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
END → AuditReport
```

---

## Data Models

### Extension → Backend

```typescript
// What the extension sends
interface ExtractedPage {
  url: string
  title: string
  elements: PageElement[]
  metadata: PageMetadata
}

interface PageElement {
  id: string          // e.g. "button-get-started-0"
  text: string        // e.g. "Get Started"
  tag: string         // e.g. "button"
  role: ElementRole   // "cta" | "nav" | "form" | "link" | "input" | "unknown"
  importance: ElementImportance  // "primary" | "secondary" | "tertiary"
  href?: string       // destination URL for links/CTAs
  path: string        // CSS path for debugging
  visible: boolean    // filtered: only visible elements sent
  position: { x: number, y: number }  // from getBoundingClientRect()
}
```

### Pipeline State

```python
class PipelineState(BaseModel):
    extracted_page: ExtractedPage       # Input from extension
    screenshot: Optional[str]           # Optional base64 PNG
    nav_graph: Optional[NavGraph]       # Set by build_graph_node
    cta_classifications: dict[str, str] # Set by classify_ctas_node
    journeys: list[UserJourney]         # Set by detect_journeys_node
    page_friction_points: list[FrictionPoint]  # Set by score_friction_node
    report: Optional[AuditReport]       # Set by llm_audit_node
    status: PipelineStatus
    error: Optional[str]
```

### Final Output

```python
class AuditReport(BaseModel):
    url: str
    title: str
    journeys: list[UserJourney]
    summary: str
    recommendations: list[str]
    overall_score: int                  # 0-100
    pre_validation_score: int           # Score before LLM dispute adjustment
    qualitative_label: str              # "Poor" | "Needs Work" | "Good" | "Excellent"
    element_summary: PageMetadata
    nav_snapshot: NavSnapshot           # Top 5 CTAs + top 10 nav links
    page_issues: list[str]              # Reasons for page floor application
    disputed_findings: list[DisputedFinding]
    llm_observations: list[LLMObservation]
    suggested_questions: list[str]
    generated_at: str
```

---

## Scoring System

```
Base score: 100

Severity weights (severity_weights.py):
  CRITICAL → 40 points
  HIGH     → 20 points
  MEDIUM   → 10 points
  LOW      →  5 points

Journey friction penalty:
  penalty = severity_weight × journey_confidence × dispute_factor
  dispute_factor = 0.25 if disputed, else 1.0

Page friction penalty (applied once, confidence = 1.0):
  penalty = severity_weight × dispute_factor

Special rules:
  • If ALL friction is LOW severity → cap total penalty at 10
  • If any disputes exist → cap score at 99
  • Page floor applied after LLM validation:
      0 elements          → floor 30
      no CTAs + no nav    → floor 40
      no CTAs             → floor 65
      no nav              → floor 75
      healthy page        → no floor

Label thresholds:
  90–100 → Excellent
  70–89  → Good
  50–69  → Needs Work
  0–49   → Poor
```

---

## Config Layer

All tunable behavior is in `backend/config/`. Pipeline nodes contain no hardcoded thresholds.

### `journey_targets.py`

Defines what text signals and regex patterns map to each journey type.

```python
JOURNEY_TARGETS = {
    JourneyType.SIGNUP: ["sign up", "signup", "register", "get started", "try free", ...],
    JourneyType.PRICING: ["pricing", "plans", "cost", "billing", ...],
    # ...
}

INTENT_PATTERNS = {
    JourneyType.SIGNUP: re.compile(
        r"\b(get|start|join)\b.{0,30}\b(free|account|trial)\b", re.IGNORECASE
    ),
    # ...
}

# Per-journey role constraints — CONTACT and EXPLORE exclude "link" role
# to avoid body-copy links triggering journey detection
JOURNEY_ROLE_CONSTRAINTS = {
    JourneyType.CONTACT: {"cta", "nav"},
    JourneyType.EXPLORE: {"cta", "nav"},
}
```

### `rule_config.py`

Defines friction rules as data objects with condition lambdas.

```python
FRICTION_RULES = [
    FrictionRule(
        id="too-many-clicks",
        description="Journey requires more than 5 clicks",
        check=lambda j, _: j.click_count > 5,
        severity=Severity.HIGH,
        type="navigation-depth",
    ),
    # ...
]

PAGE_FRICTION_RULES = [
    PageFrictionRule(
        id="no-primary-cta",
        description="No primary CTA detected on page",
        check=lambda p: p.metadata.cta_count == 0,
        severity=Severity.CRITICAL,
        type="missing-cta",
    ),
    # ...
]
```

### `selector_config.py`

CSS selectors for DOM extraction — mirrors the extension's `ROLE_SELECTOR_MAP`.

```python
ROLE_SELECTOR_MAP = {
    "cta": ["[data-cta]", ".cta", "button[type='submit']", "a.btn", ...],
    "nav": ["nav a", "header a", "[role='navigation'] a", ...],
    "form": ["form", "[role='form']"],
    "link": ["main a", "article a", "section a", "footer a"],
    "input": ["input:not([type='hidden'])", "textarea", "select"],
}

CTA_TEXT_SIGNALS = {"get started", "sign up", "try free", "buy now", ...}
```

---

## LLM Provider Architecture

```
invoke_with_fallback(messages, json_mode=False)
  │
  ├─ OPENAI_API_KEY present?
  │   └─ Try OpenAI (GPT-4o-mini by default)
  │       ├─ Success → return (content, "openai")
  │       └─ Failure → log warning, try next
  │
  ├─ GEMINI_API_KEY present?
  │   └─ Try Google Gemini (gemini-2.0-flash by default)
  │       ├─ Success → return (content, "google")
  │       └─ Failure → log warning
  │
  └─ Both failed → raise RuntimeError

invoke_with_vision(system_prompt, text_prompt, screenshot_data_url)
  │
  ├─ Try OpenAI vision API (gpt-4o-mini)
  │   ├─ Success → return (content, "openai")
  │   └─ Failure → fall back to invoke_with_fallback (text-only)
  │
  └─ Returns (content, provider)
```

Models are configurable via environment variables:
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `OPENAI_VISION_MODEL` (default: `gpt-4o-mini`)
- `GEMINI_MODEL` (default: `models/gemini-2.5-flash`)

---

## Deep Crawl Architecture

```
run_deep_crawl(root_url, max_pages=10)
  │
  ├─ Crawl root URL (crawl4ai, 2s JS delay)
  │   └─ Extract internal links
  │   └─ Filter: same-origin, not content paths, not binary files
  │
  ├─ Crawl linked pages concurrently (asyncio.gather)
  │   └─ Count CTAs, forms, nav links per page
  │   └─ Detect page tag from URL path (signup, pricing, contact, ...)
  │
  ├─ Build site_map: list[PageNode]
  │
  ├─ Detect funnel flows: root → tagged destination pages
  │   └─ pressure_delta = dest_ctas - entry_ctas
  │   └─ Apply VERDICT_RULES:
  │       delta < 0    → "correct"  (focus narrows)
  │       delta == 0   → "warning"  (no change)
  │       0 < delta ≤ 10 → "warning" (slightly more noise)
  │       delta > 10   → "critical" (decision paralysis)
  │
  └─ Return CrawlReport(site_map, funnel_flows, overall_verdict)

Content paths filtered out (not conversion funnels):
  blog, news, docs, careers, about, legal, privacy, terms, community, events, ...

Binary extensions skipped:
  .dmg, .exe, .apk, .ipa, .msi, .pkg, .deb, .zip
```

---

## Extension Build Pipeline

```
npm run build
  │
  ├─ npm run build:ui
  │   └─ Next.js static export → ui/out/
  │
  ├─ node fix-export.js
  │   └─ Fix Next.js static export paths for extension context
  │
  ├─ vite build
  │   └─ Bundle TypeScript extension files → dist/
  │   └─ @crxjs/vite-plugin handles MV3 service worker bundling
  │
  ├─ node patch-manifest.js
  │   └─ Update manifest.json with correct hashed asset paths
  │
  └─ cp -r ui/out/* dist/
      └─ Merge popup UI into extension dist folder
```

---

## Key Design Decisions

**Config-driven, not code-driven**
All tunable behavior (journey signals, friction rules, severity weights, selectors) lives in `backend/config/`. Adding a new journey type or friction rule requires only a config change — no pipeline code changes.

**Three-layer signal model**
Journey detection uses exact signals → regex patterns → LLM classification in combination. This handles the full spectrum from simple keyword matches ("sign up") to branded copy ("Get Notion free") to non-English CTAs.

**Confidence-weighted scoring**
Friction penalties are scaled by journey confidence. A friction point on a BFS-detected journey (confidence 0.85) contributes more to the score than the same friction on a text-match journey (confidence 0.35). This prevents low-confidence detections from dominating the score.

**Dispute retention at 25%**
When the LLM disputes a friction finding, it's not removed — it's retained at 25% weight. This reflects epistemic uncertainty: the LLM might be wrong. Disputed findings still contribute to the score, just less.

**Page floor**
Journey rules only fire when journeys are detected. A page with zero CTAs has no journeys, so no journey friction fires — it would score 100 without the page floor. The floor enforces a structural minimum based on element counts.

**Immutable state**
Each LangGraph node receives the current state and returns a partial update via `model_copy(update={...})`. No node mutates state in place. This makes the pipeline easy to test and debug — each node's output is fully deterministic given its input.

**Graceful LLM degradation**
The pipeline never crashes on LLM failure. `classify_ctas_node` returns empty classifications. `llm_audit_node` uses safe defaults (generic summary, two fallback recommendations). The score is computed from heuristics alone.
