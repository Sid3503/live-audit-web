# User Journey Auditor

An AI-powered Chrome extension that audits any live website and tells you how easy it is for real users to sign up, find pricing, contact sales, make a purchase, or explore the product — with a scored UX report, friction analysis, and a Q&A chatbot.

---

## What It Does

Visit any website, click **Audit This Page**, and get back in ~15 seconds:

- A **0–100 UX score** (Poor / Needs Work / Good / Excellent)
- **Detected user journeys** — the actual click paths a user would take
- **Friction points** — specific issues slowing users down, with severity levels
- **AI observations** — things heuristics can't catch (vague CTAs, cognitive overload)
- **Actionable recommendations** — specific, ranked, not generic
- **A Q&A chatbot** — ask follow-up questions about the audit in plain English
- **Deep site crawl** — crawl up to 10 linked pages and analyze funnel pressure

---

## How It Works

The extension extracts interactive DOM elements (buttons, links, forms, nav items) from the live page and sends them to a FastAPI backend. The backend runs a **LangGraph pipeline** — a 5-node state machine that builds a navigation graph, detects journey paths via BFS traversal, scores friction with heuristic rules, and validates findings with an LLM (OpenAI primary, Google Gemini fallback).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design and [NOTES.md](NOTES.md) for a deep-dive into every component.

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- Chrome browser
- An OpenAI API key **or** a Google Gemini API key (or both — one is used as fallback)

---

## Setup & Run

### 1. Clone and enter the project

```bash
git clone <repo-url>
cd user-journey-auditor
```

### 2. Set up the backend

```bash
# Install Python dependencies
pip install -r requirements.txt

# Configure environment variables
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in your API keys:

```env
OPENAI_API_KEY=sk-...          # Required if using OpenAI
GEMINI_API_KEY=AI...           # Required if using Google Gemini (fallback)
OPENAI_MODEL=gpt-4o-mini       # Optional — defaults to gpt-4o-mini
GEMINI_MODEL=models/gemini-2.5-flash  # Optional — defaults to gemini-2.5-flash
```

You only need one key. If both are set, OpenAI is used first and Gemini is the fallback.

### 3. Start the backend server

```bash
uvicorn backend.main:app --reload --port 8000
```

The API is now running at `http://localhost:8000`. You can explore the endpoints at `http://localhost:8000/docs`.

### 4. Build the Chrome extension

```bash
# Install Node.js dependencies
npm install

# Build the extension
npm run build
```

This produces a `dist/` folder with the compiled extension.

### 5. Load the extension in Chrome

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder inside `user-journey-auditor/`

The extension icon appears in your Chrome toolbar.

### 6. Run your first audit

1. Navigate to any website (try `stripe.com`, `notion.so`, or your own product)
2. Click the extension icon in the toolbar
3. Click **Audit This Page**
4. Wait ~15 seconds for the report

---

## Running Tests

```bash
# From the user-journey-auditor directory
pytest -q
```

The test suite includes unit tests for the graph builder, journey detector, rule engine, and score calculator, plus an integration test that runs the full pipeline without an LLM key.

To run a specific test file:

```bash
pytest tests/unit/test_score_calculator.py -v
pytest tests/integration/test_pipeline.py -v
```

---

## API Reference

The backend exposes four endpoints under `/api/v1`:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/audit` | Run the full LangGraph pipeline on an extracted page |
| `POST` | `/chat` | Answer a UX question about a completed audit |
| `POST` | `/deep-audit` | Crawl linked pages and analyze funnel pressure |
| `GET` | `/deep-analysis` | Poll for a cached deep crawl result |
| `GET` | `/health` | Health check |

Interactive docs: `http://localhost:8000/docs`

### Example: Audit a page

```bash
curl -X POST http://localhost:8000/api/v1/audit \
  -H "Content-Type: application/json" \
  -d '{
    "page": {
      "url": "https://example.com",
      "title": "Example",
      "elements": [
        {
          "id": "button-get-started-0",
          "text": "Get Started",
          "tag": "button",
          "role": "cta",
          "importance": "primary",
          "href": "https://example.com/signup",
          "path": "header > nav > button",
          "visible": true,
          "position": {"x": 120, "y": 80}
        }
      ],
      "metadata": {
        "total_elements": 1,
        "cta_count": 1,
        "form_count": 0,
        "nav_count": 0,
        "extracted_at": "2024-01-01T00:00:00Z"
      }
    }
  }'
```

### Example: Ask a question about an audit

```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How easy is it to sign up?",
    "report": { ... },
    "history": []
  }'
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | One of these two | — | OpenAI API key (primary LLM) |
| `GEMINI_API_KEY` | One of these two | — | Google Gemini API key (fallback LLM) |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model for text tasks |
| `OPENAI_VISION_MODEL` | No | `gpt-4o-mini` | OpenAI model for vision tasks |
| `GEMINI_MODEL` | No | `models/gemini-2.5-flash` | Gemini model |
| `VITE_UJA_API_URL` | No | `http://localhost:8000/api/v1/audit` | Backend URL for the extension |

---

## Project Structure

```
user-journey-auditor/
├── extension/          # Chrome Extension (TypeScript)
├── backend/            # FastAPI + LangGraph pipeline (Python)
│   ├── api/            # REST endpoints
│   ├── pipeline/       # LangGraph nodes and state
│   ├── core/           # Business logic (graph, journeys, scoring, crawl)
│   ├── models/         # Pydantic data models
│   └── config/         # All tunable behavior (rules, signals, weights)
├── tests/              # Unit and integration tests
├── requirements.txt    # Python dependencies
└── package.json        # Node.js build config
```

---

## Troubleshooting

**Extension shows "No page data"**
The content script may not have run yet. Refresh the page and try again. Some pages with strict CSP headers block content scripts.

**Audit returns a very low score on a simple page**
The page may be blocking DOM extraction. Check the browser console for CSP errors. The score floor (30–75) applies when few or no elements are extracted.

**LLM features not working**
Check that at least one API key is set in `backend/.env`. The pipeline works without LLM keys — it falls back to heuristics-only mode with a generic summary.

**Deep audit returns empty results**
Some sites (Cloudflare-protected, Airbnb) block headless crawlers. The service returns an empty crawl report gracefully — the single-page audit still works.

**`crawl4ai` not found**
Install it separately if needed: `pip install crawl4ai`. It requires a Chromium installation — run `crawl4ai-setup` after installing.

**Port 8000 already in use**
Change the port: `uvicorn backend.main:app --reload --port 8001` and update `VITE_UJA_API_URL` in `backend/.env` accordingly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Chrome Extension | TypeScript, Vite, `@crxjs/vite-plugin`, React |
| Popup UI | Next.js (static export), Tailwind CSS |
| Backend | FastAPI, Python 3.11+ |
| Pipeline | LangGraph, LangChain |
| LLM | OpenAI GPT-4o-mini (primary), Google Gemini (fallback) |
| Deep Crawl | crawl4ai (headless Chromium) |
| Data Validation | Pydantic v2 |
| Testing | pytest, pytest-asyncio |
