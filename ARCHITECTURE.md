# Architecture

## Data Flow

Content Script → (chrome.runtime.sendMessage) → Service Worker  
Service Worker → (fetch POST `/api/v1/audit`) → FastAPI  
FastAPI → LangGraph Pipeline → `AuditReport`  
FastAPI → (response JSON) → Service Worker  
Service Worker → (chrome.storage.local) → Popup React UI

## LangGraph Node Sequence

START  
→ `build_graph_node` (builds `NavGraph` from elements)  
→ `detect_journeys_node` (BFS path finding per `JourneyType`)  
→ `score_friction_node` (applies `FRICTION_RULES` array)  
→ `llm_audit_node` (LLM: interpret + recommend, validated)  
END

## Config-Driven Design

All tunable behavior lives in `backend/config/`:
- `journey_targets.py` — what counts as each journey type
- `rule_config.py` — what counts as friction
- `severity_weights.py` — how friction maps to score
- `selector_config.py` — which DOM elements to extract

