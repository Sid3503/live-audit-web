# The 5 LangGraph Nodes — Complete Guide

> Everything explained simply. Same style as our chat — analogies first, dry runs, no jargon.

---

## Before the Nodes: Key Terms

You need these definitions before anything makes sense.

**CTA (Call To Action)**
A button or link asking the user to DO something.
```
YES: "Get Started", "Sign Up", "Buy Now", "Contact Sales"
NO:  "Home", "About", "Privacy Policy"
```

**Element Role** — every element on the page gets one label:

| Role | What it is | Example |
|---|---|---|
| `cta` | Action button or link | "Get Started", "Buy Now" |
| `nav` | Navigation link | "Pricing", "About" in navbar |
| `form` | A form container | The `<form>` wrapper |
| `link` | Body content link | Links inside articles, sections |
| `input` | A fillable field | Email box, text field, dropdown |
| `unknown` | Couldn't classify | Anything else |

**Primary vs Secondary** — importance within CTAs:
```
PRIMARY:   text matches a hardcoded high-intent list
           "get started", "sign up", "try free", "buy now"...

SECONDARY: everything else
           "see how it works", "learn more", "watch demo"...
```

**NavGraph** — the map Node 1 builds:
```
nodes: list of all element IDs
edges: list of connections (A -> B)
root:  the starting element for BFS
```

**PipelineState** — the baton passed between all 5 nodes:
```
Starts with:  {page elements, screenshot}
After Node 1: + nav_graph
After Node 2: + cta_classifications
After Node 3: + journeys
After Node 4: + friction_points
After Node 5: + final report
```

---

## The Big Picture

Think of the pipeline as a baton race. 5 runners. Each does one job, adds their result to the baton, passes it on.

```
Raw page elements
      |
   Node 1: Build a map of how elements connect
      |
   Node 2: Ask LLM what the ambiguous buttons mean
      |
   Node 3: Find the shortest path for each journey type
      |
   Node 4: Check each path for problems
      |
   Node 5: LLM reviews everything, writes the final report
      |
   AuditReport (score, journeys, friction, recommendations)
```

---

## Node 1: The Map Maker

**Job: Turn a flat list of elements into a connected map.**

### The Analogy

You're a new employee. Someone hands you a list of every room in the building:
```
Room A: Reception
Room B: Coffee machine
Room C: Meeting room
Room D: Exit
```
That list tells you nothing about how to get anywhere. You need a map — which rooms connect to which.
Node 1 builds that map.

### How Primary/Secondary Gets Decided

This happens BEFORE Node 1, in the Chrome extension's content script. By the time Node 1 runs, every element already has its importance label.

The content script checks one thing: does the button text match a hardcoded high-intent list?

```
HIGH-INTENT LIST:
  "get started", "sign up", "try free", "start free",
  "buy now", "purchase", "subscribe", "contact us",
  "book a demo", "request demo", "free trial", "get access"

"Get Started"     -> in list? YES -> PRIMARY
"See how it works" -> in list? NO  -> SECONDARY
"Get Notion free"  -> in list? NO  -> SECONDARY
"Pricing"          -> in list? NO  -> SECONDARY
```

"Get Notion free" becomes SECONDARY here. That's exactly why Node 2 (LLM) exists — to catch these cases.

### What Node 1 Receives

A flat list like this:
```
btn-0: text="Get Started"      role=cta    importance=PRIMARY    y=200
btn-1: text="See how it works"  role=cta    importance=SECONDARY  y=240
nav-0: text="Pricing"           role=nav    importance=SECONDARY  y=60
nav-1: text="About"             role=nav    importance=SECONDARY  y=60
inp-0: text=""                  role=input  importance=SECONDARY  y=500
btn-2: text="Subscribe"         role=cta    importance=PRIMARY    y=510
```

Node 1's only job: draw connections between these.

### The 4 Connection Rules

Node 1 checks every possible pair of elements. For each pair, it asks 4 questions in order. First question that says YES wins — no duplicate edges.

---

#### Rule 1: cta-chain — "Big button leads to smaller button"

```
Condition A: element A is a PRIMARY CTA
Condition B: element B is a SECONDARY CTA or link
-> If both true: connect A to B
```

Real world: A store has a big "SHOP NOW" sign. Right below it, smaller text: "or browse the catalogue". These belong together.

On a webpage:
```
[ GET STARTED ]          <- primary CTA
  or see how it works    <- secondary CTA
```

Dry run:
```
PAIR: btn-0 ("Get Started", PRIMARY CTA) and btn-1 ("See how it works", SECONDARY CTA)

  Rule 1: Is btn-0 PRIMARY CTA? YES
          Is btn-1 SECONDARY CTA? YES
  -> CONNECT. Stop checking other rules.
  Edge: btn-0 -> btn-1
```

---

#### Rule 2: nav-to-cta — "Menu item points toward a nearby button"

```
Condition A: element A has role = "nav"
Condition B: element B has role = "cta"
Condition C: vertical distance between them < 300px
-> If all three true: connect A to B
```

Real world: IKEA overhead sign says "Checkout ->". Twenty meters later, the actual checkout counter. The sign leads you to the action.

On a webpage:
```
[ Home ]  [ Pricing ]  [ About ]    <- navbar at y=60px

[ Start Free Trial ]                <- CTA at y=280px
```

"Pricing" in the nav leads users toward "Start Free Trial".

Why 300px limit? Without it, "Pricing" in the navbar would connect to "Contact Us" in the footer at y=2400px. That's not a real connection.

Dry run:
```
PAIR: nav-0 ("Pricing", y=60) and btn-0 ("Get Started", CTA, y=200)

  Rule 1: Is nav-0 PRIMARY CTA? NO (it's nav, not cta)
  Rule 2: Is nav-0 a nav? YES
          Is btn-0 a CTA? YES
          Distance: |60 - 200| = 140px. Is 140 < 300? YES
  -> CONNECT.
  Edge: nav-0 -> btn-0

PAIR: nav-0 ("Pricing", y=60) and btn-2 ("Subscribe", CTA, y=510)

  Rule 2: Is nav-0 a nav? YES
          Is btn-2 a CTA? YES
          Distance: |60 - 510| = 450px. Is 450 < 300? NO
  -> NO EDGE. Too far apart.
```

---

#### Rule 3: input-to-submit — "Fill this, then click that"

```
Condition A: element A has role = "input"
Condition B: element B has role = "cta" AND tag is "button" or "input"
-> If both true: connect A to B
```

Real world: A vending machine. You put in money (input), then press the button for your drink (submit). Always paired.

On a webpage:
```
[ Enter your email...  ]  [ Subscribe ]
       input                   button
```

No proximity check needed. If there's an input and a submit button anywhere on the page, they're a pair.

The arrow direction represents user flow — user fills input FIRST, clicks button SECOND:
```
email field -> Subscribe button
  (first)        (second)
```

Dry run:
```
PAIR: inp-0 (email input, role=input) and btn-2 ("Subscribe", role=cta, tag=button)

  Rule 1: Is inp-0 PRIMARY CTA? NO
  Rule 2: Is inp-0 a nav? NO
  Rule 3: Is inp-0 an input? YES
          Is btn-2 a CTA with tag button? YES
  -> CONNECT.
  Edge: inp-0 -> btn-2
```

---

#### Rule 4: proximity-link — "These two are physically right next to each other"

```
Condition A: element A has role = "link"
Condition B: element B has role = "cta"
Condition C: vertical distance between them < 80px
-> If all three true: connect A to B
```

Real world: A product card in an online store:
```
+-------------------------+
|  Nike Air Max           |
|  $120                   |
|  Learn more  [Buy Now]  |  <- 30px apart
+-------------------------+
```
"Learn more" and "Buy Now" are in the same card. Connect them.

Why 80px and not 300px like Rule 2? Links appear everywhere — paragraphs, footers, sidebars. A loose check would create fake connections across the whole page. 80px means "same UI component."

Dry run:
```
PAIR: link-0 ("Learn more", y=420) and btn-0 ("Buy Now", CTA, y=450)

  Rule 4: Is link-0 a link? YES
          Is btn-0 a CTA? YES
          Distance: |420 - 450| = 30px. Is 30 < 80? YES
  -> CONNECT.

PAIR: link-1 ("Privacy Policy", y=420) and btn-1 ("Get Started", CTA, y=200)

  Rule 4: Is link-1 a link? YES
          Is btn-1 a CTA? YES
          Distance: |420 - 200| = 220px. Is 220 < 80? NO
  -> NO EDGE.
```

---

### The Root Element

After all edges are built, Node 1 picks the root — the starting point for BFS in Node 3.

Rule: **the PRIMARY element with the smallest y value** (closest to the top of the page).

In practice: almost always the hero CTA — "Get Started", "Try Free", etc.

### What Node 1 Produces

```
BEFORE Node 1:
  [flat list of 6 elements]

AFTER Node 1:
  NavGraph(
    nodes: [btn-0, btn-1, nav-0, nav-1, inp-0, btn-2],
    edges: [
      btn-0 -> btn-1   (cta-chain)
      nav-0 -> btn-0   (nav-to-cta)
      inp-0 -> btn-2   (input-to-submit)
    ],
    root: btn-0
  )

Visualized:
  nav-0 ("Pricing") ---------> btn-0 ("Get Started")
                                      |
                                      v
                               btn-1 ("See how it works")

  inp-0 (email field) -------> btn-2 ("Subscribe")
```

Node 1 is done. Baton passed to Node 2.

---

## Node 2: The Translator

**Job: Figure out what the ambiguous buttons mean.**

### The Analogy

You're sorting mail. Most envelopes have clear labels — INVOICE, BILL, PACKAGE. Easy.
But some just say "From: John" with no label. You have to open them and figure out what they are.

Node 2's job: figure out what the unlabeled buttons mean.

### Why This Node Exists

The hardcoded keyword list handles obvious CTAs:
```
"Sign up"     -> signup (keyword match)
"Get started" -> signup (keyword match)
"Pricing"     -> pricing (keyword match)
```

But what about:
```
"Get Notion free"   -> ??? (not in any keyword list)
"Talk to an expert" -> ??? (not exactly "contact us")
"See it in action"  -> ??? (could be explore or contact)
```

A human reads "Get Notion free" and instantly knows it means signup. The LLM can do the same. A keyword list cannot.

### What Gets Sent to the LLM

Only PRIMARY CTAs with non-empty text. Not nav links, not inputs, not secondary buttons.

Why only primary? Secondary CTAs are supporting actions. They're not journey entry points. Sending them wastes tokens and adds noise.

### Dry Run

```
Page: notion.so

Primary CTAs found:
  0: "Get Notion free"
  1: "Request a demo"
  2: "Watch video"

Sent to LLM:
  "Classify these by user intent:
   signup, pricing, contact, purchase, explore, or none"

LLM responds:
  index 0 -> signup   ("Get Notion free" = create an account)
  index 1 -> contact  ("Request a demo" = talk to sales)
  index 2 -> explore  ("Watch video" = learn more)

Stored as:
  cta_classifications = {
    "btn-get-notion-free-0": "signup",
    "btn-request-demo-1":    "contact",
    "btn-watch-video-2":     "explore"
  }
```

This dict gets handed to Node 3 as the third signal source.

### If the LLM Fails

Empty dict. Node 3 still runs using only keywords and regex. The pipeline never stops — LLM is enhancement, not requirement.

### What Node 2 Produces

```
BEFORE Node 2:
  cta_classifications = {}

AFTER Node 2:
  cta_classifications = {
    "btn-get-notion-free-0": "signup",
    "btn-request-demo-1":    "contact",
    "btn-watch-video-2":     "explore"
  }
```

Node 2 is done. Baton passed to Node 3.

---

## Node 3: The Path Finder

**Job: Find the shortest click path for each journey type.**

### The Analogy

You're playing a maze game. The maze is the graph from Node 1. You start at the entrance (root). Your goal: find the shortest path to the exit (a signup button, pricing page, etc.).

BFS is your strategy: explore all paths one step at a time, level by level, until you find the exit. This guarantees the shortest path.

### The Core Question

For each journey type, Node 3 asks:
> "Starting from the root, what is the shortest path to reach a relevant element?"

That's it. Everything else is setup for that question.

### Step 1: Build the Target Set

Before running BFS, you need to know what the "exit" looks like. Three sources tell you:

```
SOURCE 1 - Exact keywords (JOURNEY_TARGETS):
  Does element text contain any word from the signup list?
  signup list = ["sign up", "signup", "register", "get started", "try free"...]

SOURCE 2 - Regex patterns (INTENT_PATTERNS):
  Does element text match the signup regex?
  Catches: "Get Notion free", "Start your trial", "Join for free"

SOURCE 3 - LLM labels (from Node 2):
  Was this element classified as "signup" by the LLM?

target_ids = SOURCE1 OR SOURCE2 OR SOURCE3
```

### Step 2: BFS — The Actual Search

BFS = Breadth First Search. Level by level exploration.

```
Start: put the root in a queue
Queue: [ [btn-0] ]

STEP 1: Take [btn-0] from queue
  Is btn-0 in target_ids? 
    YES -> path found! Return [btn-0]
    NO  -> add btn-0's neighbors to queue, continue

STEP 2: Take [btn-0, btn-1] from queue
  Is btn-1 in target_ids?
    YES -> path found! Return [btn-0, btn-1]
    NO  -> add btn-1's neighbors, continue

...keep going until found or queue empty
```

Why level by level? Because this guarantees the SHORTEST path. You find the closest destination first.

### Full Dry Run: Notion Homepage

```
Elements:
  btn-0: "Get Started"       PRIMARY CTA   y=200
  btn-1: "See how it works"  SECONDARY CTA y=240
  nav-0: "Pricing"           NAV           y=60
  btn-2: "Get started free"  SECONDARY CTA y=800

Graph edges (from Node 1):
  btn-0 -> btn-1   (cta-chain)
  nav-0 -> btn-0   (nav-to-cta)

Root: btn-0

LLM classifications (from Node 2):
  btn-0 -> "signup"

===========================================
FINDING SIGNUP JOURNEY:
===========================================

Target set for signup:
  Source 1 (keywords): btn-0 "Get Started" matches -> add btn-0
                       btn-2 "Get started free" matches -> add btn-2
  Source 2 (regex): no additional matches
  Source 3 (LLM): btn-0 classified as signup -> already in set

  target_ids = {btn-0, btn-2}

BFS from root (btn-0):
  Queue: [ [btn-0] ]

  Take [btn-0]:
    Is btn-0 in {btn-0, btn-2}? YES -> FOUND!
    Path = [btn-0]

Signup journey:
  steps: ["Get Started"]
  click_count: 0
  method: BFS_GRAPH
  confidence: 0.70  (single step)

===========================================
FINDING PRICING JOURNEY:
===========================================

Target set for pricing:
  Source 1 (keywords): nav-0 "Pricing" matches -> add nav-0
  target_ids = {nav-0}

BFS from root (btn-0):
  Queue: [ [btn-0] ]

  Take [btn-0]:
    Is btn-0 in {nav-0}? NO
    btn-0's neighbors: [btn-1]
    Queue: [ [btn-0, btn-1] ]

  Take [btn-0, btn-1]:
    Is btn-1 in {nav-0}? NO
    btn-1's neighbors: none
    Queue: []

  Queue empty. BFS FAILED.

  Why? The edge goes nav-0 -> btn-0 (nav leads TO root).
  BFS starts at btn-0 and follows outgoing edges.
  There's no path FROM btn-0 TO nav-0. Arrow points wrong way.

FALLBACK: Text Match
  Collect elements matching pricing keywords -> [nav-0]
  Sort by y position -> [nav-0]

Pricing journey:
  steps: ["Pricing"]
  click_count: 0
  method: TEXT_MATCH
  confidence: 0.35  (keyword fallback, lower confidence)
```

### The Three Outcomes

```
OUTCOME 1: BFS_GRAPH (confidence 0.70-0.95)
  When: BFS found a path through the graph
  Means: confirmed navigation route exists
  Most reliable

OUTCOME 2: TEXT_MATCH (confidence 0.30-0.45)
  When: BFS found nothing, but keywords/regex matched
  Means: relevant elements exist but no graph path between them
  Fallback

OUTCOME 3: LLM_CLASSIFIED (confidence 0.55-0.70)
  When: BFS found nothing, keywords found nothing, LLM classified an element
  Means: LLM understood intent but heuristics missed it entirely
  Middle ground
```

### Confidence Numbers — Why These Values

```
BFS single step (1 element):  0.70
  -> Found it, but trivially short. Less certain.

BFS 2-4 steps:  0.85
  -> Ideal depth. Multi-step path confirmed. High confidence.

BFS 5+ steps:  drops toward 0.60
  -> Long paths are less reliable.

TEXT_MATCH:  0.30 + (0.05 x steps), max 0.45
  -> Just keyword matching. No graph confirmation.

LLM_CLASSIFIED:  0.55 + (0.05 x steps), max 0.70
  -> LLM understood intent. Better than keywords, worse than graph.
```

Confidence flows into scoring. Same HIGH severity friction on two journeys:
```
BFS journey (confidence 0.85):   penalty = 20 x 0.85 = 17 points
Text match journey (conf 0.35):  penalty = 20 x 0.35 = 7 points
```
Same rule. Same severity. Very different impact.

### What Node 3 Produces

```
BEFORE Node 3:
  journeys = []

AFTER Node 3:
  journeys = [
    UserJourney(
      type: "signup",
      steps: ["Get Started"],
      click_count: 0,
      confidence: 0.70,
      method: BFS_GRAPH,
      friction_points: []   <- empty, filled by Node 4
    ),
    UserJourney(
      type: "pricing",
      steps: ["Pricing"],
      click_count: 0,
      confidence: 0.35,
      method: TEXT_MATCH,
      friction_points: []
    )
  ]
```

Node 3 is done. Baton passed to Node 4.

---

## Node 4: The Inspector

**Job: Check each journey for problems using a rulebook.**

### The Analogy

A restaurant health inspector walks in with a checklist. They don't redesign the kitchen. They just check specific conditions:
- Is the fridge below 4 degrees? Yes or No
- Are there handwashing stations? Yes or No
- Is raw meat stored above cooked meat? Yes or No

Each violation gets a severity: critical (close the restaurant), major (fix in 24 hours), minor (fix this week).

Node 4 is that inspector. The journeys are the kitchen. The rules are the checklist.

### Two Types of Checks

```
TYPE A: Per-journey checks
  Run once for EACH journey found in Node 3.
  Like checking each dish individually.

TYPE B: Page-level checks
  Run ONCE for the whole page, regardless of journey count.
  Like checking the overall kitchen layout.
```

Why separate? If "no CTA on page" was a per-journey check and you found 3 journeys, you'd penalize the same problem 3 times. That's wrong. Page-level checks fire exactly once.

---

### Per-Journey Rules

**Rule 1: too-many-clicks**
```
Condition: click_count > 5
Severity:  HIGH
Type:      "navigation-depth"

Why 5? Industry benchmark: good flows are 2-3 clicks.
5 is the outer edge of acceptable. 6+ is objectively too many.
```

**Rule 2: signup-no-form**
```
Condition: journey type is SIGNUP
           AND form_count == 0 on the page
           AND the CTA does NOT link to an external page
Severity:  MEDIUM
Type:      "missing-form"

Logic: You detected a signup journey but there's nowhere to sign up.
The external link check is important:
  - Stripe's "Start now" links to dashboard.stripe.com -> external -> rule does NOT fire
  - A page with a signup CTA that goes nowhere -> rule FIRES
```

**Rule 3: single-step-journey**
```
Condition: click_count == 0 AND steps < 2
Severity:  LOW
Type:      "incomplete-journey"

A single-element journey might be fine (direct CTA).
LOW severity = worth noting, not a real problem.
The LLM in Node 5 often disputes this one.
```

**Rule 4: dead-end-cta**
```
Condition: last element in journey is a CTA
           AND that CTA has no href, or href="#", or href="/"
Severity:  MEDIUM
Type:      "dead-end"

The user followed the path and hit a wall.
The button goes nowhere. Always a bug.
```

---

### Page-Level Rules

**Rule 5: no-primary-cta**
```
Condition: cta_count == 0
Severity:  CRITICAL
Type:      "missing-cta"

Users have no action to take. The page is a dead end.
```

**Rule 6: no-nav-links**
```
Condition: nav_count == 0
Severity:  HIGH
Type:      "missing-navigation"

Users can't move anywhere. Stuck on this page.
```

**Rule 7: competing-ctas**
```
Condition: more than 3 DISTINCT primary CTA texts
           in the top 600px of the page
Severity:  MEDIUM
Type:      "cta-overload"

Why 600px? Roughly "above the fold" on a 1080p screen.
Why 3? One primary action + one secondary + one nav escape = fine.
Four or more competing primaries = decision paralysis.
Why DISTINCT? Same CTA repeated 3 times counts as 1, not 3.
```

---

### Full Dry Run

```
Journeys from Node 3:
  signup:  steps=["Get Started"], click_count=0, confidence=0.70
  pricing: steps=["Pricing"],     click_count=0, confidence=0.35

Page metadata:
  cta_count: 5
  nav_count: 8
  form_count: 0
  Primary CTAs above y=600: "Get Started", "Try Free", "Watch Demo", "Contact Us", "See Pricing"
  -> 5 distinct labels

===========================================
PER-JOURNEY: SIGNUP JOURNEY
===========================================

Rule 1 too-many-clicks: click_count=0 > 5? NO -> no friction

Rule 2 signup-no-form:
  Is journey SIGNUP? YES
  form_count == 0? YES
  Does CTA link externally? "Get Started" href="https://app.example.com" -> YES, external
  -> External link means signup happens off-page -> rule does NOT fire

Rule 3 single-step-journey:
  click_count == 0? YES
  steps < 2? YES (only 1 step)
  -> FIRES. LOW severity.
  FrictionPoint added: type="incomplete-journey", severity=LOW

Rule 4 dead-end-cta:
  Last step is "Get Started", href="https://app.example.com"
  Has a real destination -> NO friction

Signup journey result:
  friction_points: [FrictionPoint(type="incomplete-journey", severity=LOW)]

===========================================
PER-JOURNEY: PRICING JOURNEY
===========================================

Rule 3 single-step-journey:
  click_count == 0? YES. steps < 2? YES.
  -> FIRES. LOW severity.

Pricing journey result:
  friction_points: [FrictionPoint(type="incomplete-journey", severity=LOW)]

===========================================
PAGE-LEVEL CHECKS (run once)
===========================================

Rule 5 no-primary-cta: cta_count=5, not 0 -> NO friction

Rule 6 no-nav-links: nav_count=8, not 0 -> NO friction

Rule 7 competing-ctas:
  Distinct primary CTAs above y=600: 5 labels
  5 > 3? YES -> FIRES. MEDIUM severity.
  page_friction_points: [FrictionPoint(type="cta-overload", severity=MEDIUM)]
```

### How Confidence Affects the Score

The friction penalty is not just severity weight. It's:
```
penalty = severity_weight x journey_confidence x dispute_factor
```

Same LOW severity finding on two journeys:
```
Signup (confidence 0.70):  penalty = 5 x 0.70 = 3.5 points
Pricing (confidence 0.35): penalty = 5 x 0.35 = 1.75 points
```

Page-level friction always uses confidence = 1.0 (structural fact, not probabilistic):
```
competing-ctas (MEDIUM): penalty = 10 x 1.0 = 10 points
```

### What Node 4 Produces

```
BEFORE Node 4:
  journeys[signup].friction_points = []
  journeys[pricing].friction_points = []
  page_friction_points = []

AFTER Node 4:
  journeys[signup].friction_points = [
    FrictionPoint(type="incomplete-journey", severity=LOW)
  ]
  journeys[pricing].friction_points = [
    FrictionPoint(type="incomplete-journey", severity=LOW)
  ]
  page_friction_points = [
    FrictionPoint(type="cta-overload", severity=MEDIUM)
  ]
```

Node 4 is done. Baton passed to Node 5.

---

## Node 5: The Validator + Report Writer

**Job: LLM reviews everything, disputes false positives, writes the final report.**

### The Analogy

The health inspector (Node 4) filed their report. Now a senior manager reviews it before it goes public.

The manager can say:
- "This violation is valid, keep it"
- "This violation is a false positive, dispute it"
- "I also noticed something the inspector missed"
- "Here's my overall summary and recommendations"

That's Node 5. The LLM is the senior manager.

### What the LLM Receives

A structured text prompt containing everything the pipeline found:

```
Page: Stripe | Financial Infrastructure for the Internet
URL: https://stripe.com
Score (pre-validation): 88/100
Elements: 47 total | 8 CTAs | 0 forms | 12 nav links

Key interactive elements found:
  - Start now
  - Contact sales
  - See the docs

Detected journeys:
  [signup] 1 step, 0 clicks, method=bfs_graph, confidence=0.70
    path: Start now
  [contact] 1 step, 0 clicks, method=text_match, confidence=0.40
    path: Contact sales

Heuristic friction findings to validate:
  rule_id=incomplete-journey | severity=low | journey=signup | confidence=0.70
  rule_id=incomplete-journey | severity=low | journey=contact | confidence=0.40
```

If a screenshot was captured, the LLM also receives the image. This lets it see things the DOM data can't tell you — like a CTA being below the fold, or low contrast.

### What the LLM Returns

```json
{
  "summary": "Stripe presents a clear, low-friction signup path. The contact journey is intentionally direct.",
  "recommendations": [
    "Add a pricing comparison table to the homepage",
    "Surface API documentation link more prominently for developers"
  ],
  "disputed_findings": [
    {
      "rule_id": "incomplete-journey",
      "dispute_reason": "A direct signup CTA routing to a dedicated registration page is intentional design, not friction"
    }
  ],
  "observations": [
    {
      "observation": "Developer-focused copy may alienate non-technical buyers",
      "severity": "medium",
      "category": "audience_targeting"
    }
  ],
  "suggested_questions": [
    "How does Stripe's signup flow compare to typical SaaS benchmarks?",
    "What is the shortest path to the API documentation?"
  ]
}
```

All of this is validated with Pydantic before being used. If the JSON is malformed, fallback defaults kick in.

### What Happens to Disputed Findings

Disputed findings are NOT removed. They're retained at 25% of their original penalty.

```
Logic: The LLM might be wrong. Uncertainty doesn't mean zero penalty.
       It means reduced penalty.

incomplete-journey (LOW=5) on signup (confidence=0.70):
  Normal:   5 x 0.70 x 1.00 = 3.5 points
  Disputed: 5 x 0.70 x 0.25 = 0.875 points
```

Also: if ANY disputes exist, the score is capped at 99. You can't get a perfect score when there's uncertainty.

### The Scoring Formula

```
Start: 100

Severity weights:
  CRITICAL -> 40 points
  HIGH     -> 20 points
  MEDIUM   -> 10 points
  LOW      ->  5 points

Journey friction penalty:
  penalty = severity_weight x journey_confidence x dispute_factor

Page friction penalty (applied once, confidence = 1.0):
  penalty = severity_weight x dispute_factor

Special rule:
  If ALL friction is LOW severity -> cap total penalty at 10
  (prevents many minor issues from scoring worse than one HIGH issue)

Final: max(0, min(100, 100 - total_penalty))
```

### The Page Floor

After scoring, a structural minimum is applied:

```
0 elements on page       -> floor 30
No CTAs AND no nav       -> floor 40
No CTAs (but has nav)    -> floor 65
No nav (but has CTAs)    -> floor 75
Healthy page             -> no floor
```

Why? A page with zero CTAs has no journeys, so no journey friction fires. Without the floor, it would score 100. The floor enforces: you can't score well if your page has no interactive elements.

### Score to Label

```
90-100 -> Excellent
70-89  -> Good
50-69  -> Needs Work
0-49   -> Poor
```

### Full Dry Run: Scoring

```
From Node 4:
  signup journey:  incomplete-journey (LOW=5), confidence=0.70
  pricing journey: incomplete-journey (LOW=5), confidence=0.35
  page:            cta-overload (MEDIUM=10)

LLM disputes: incomplete-journey on signup

Penalty calculation:
  signup incomplete-journey:  5 x 0.70 x 0.25 (disputed) = 0.875
  pricing incomplete-journey: 5 x 0.35 x 1.00            = 1.75
  page cta-overload:          10 x 1.0 x 1.00            = 10.0

  Total penalty = 0.875 + 1.75 + 10.0 = 12.625

  Not all LOW (cta-overload is MEDIUM) -> no 10-point cap

  Score = 100 - 12.625 = 87.375 -> rounds to 87

  Disputes exist -> cap at 99 -> 87 is already below 99, no change

  Page floor: cta_count=5, nav_count=8 -> healthy page -> no floor

Final score: 87/100 -> "Good"
```

### LLM Fallback Chain

```
Screenshot exists?
  YES -> try OpenAI vision API
           success -> use it
           fails   -> fall back to text-only
  NO  -> text-only

Text-only:
  Try OpenAI (GPT-4o-mini)
    success -> done
    fails   -> try Google Gemini
      success -> done
      fails   -> use safe defaults
                 (generic summary, 2 fallback recommendations, no disputes)
```

The pipeline NEVER crashes. Safe defaults always exist.

### What Node 5 Produces

```
AuditReport(
  url: "https://stripe.com",
  overall_score: 87,
  pre_validation_score: 85,   <- score before LLM disputes
  qualitative_label: "Good",
  journeys: [...],
  summary: "Stripe presents a clear, low-friction signup path...",
  recommendations: ["Add pricing comparison table..."],
  disputed_findings: [DisputedFinding(rule_id="incomplete-journey", ...)],
  llm_observations: [LLMObservation(observation="Developer-focused copy...")],
  suggested_questions: ["How does Stripe's signup flow compare...?"],
  page_issues: [],
  generated_at: "2024-01-01T00:00:00Z"
)
```

This is the final output. Sent back to the extension. Rendered in the popup.

---

## The Complete Flow — One Page Summary

```
INPUT: 47 page elements (buttons, links, forms, nav items)

NODE 1 (Map Maker)
  Checks 47x46 = 2162 pairs
  Applies 4 rules: cta-chain, nav-to-cta, input-to-submit, proximity-link
  Produces: NavGraph with ~600 edges, root = hero CTA

NODE 2 (Translator)
  Sends primary CTAs to LLM
  LLM classifies by intent (not just keywords)
  Produces: {element_id -> journey_type} dict

NODE 3 (Path Finder)
  For each of 5 journey types:
    Builds target set from keywords + regex + LLM labels
    Runs BFS from root to any target
    Falls back to text match if BFS fails
  Produces: list of UserJourney with steps, clicks, confidence

NODE 4 (Inspector)
  Per-journey: 4 rules (too-many-clicks, signup-no-form, single-step, dead-end)
  Page-level: 3 rules (no-cta, no-nav, competing-ctas)
  Produces: friction_points attached to each journey + page_friction_points

NODE 5 (Validator + Report Writer)
  LLM reviews all findings
  Disputes false positives (retained at 25% penalty)
  Adds observations heuristics can't detect
  Computes final score with confidence weighting + page floor
  Produces: AuditReport (score, label, journeys, recommendations, chatbot questions)

OUTPUT: AuditReport -> sent to Chrome extension -> rendered in popup
```

---

## Quick Reference: All Rules

### Node 1 Edge Rules

| Rule | Element A | Element B | Extra Condition |
|---|---|---|---|
| cta-chain | PRIMARY cta | SECONDARY cta or link | none |
| nav-to-cta | nav | cta | distance < 300px |
| input-to-submit | input | cta with tag button/input | none |
| proximity-link | link | cta | distance < 80px |

### Node 3 Detection Methods

| Method | When | Confidence |
|---|---|---|
| BFS_GRAPH | Graph path found | 0.70-0.95 |
| TEXT_MATCH | BFS failed, keywords matched | 0.30-0.45 |
| LLM_CLASSIFIED | BFS failed, only LLM matched | 0.55-0.70 |

### Node 4 Friction Rules

| Rule | Condition | Severity | Scope |
|---|---|---|---|
| too-many-clicks | click_count > 5 | HIGH | per-journey |
| signup-no-form | signup + no form + no external link | MEDIUM | per-journey |
| single-step-journey | 0 clicks, < 2 steps | LOW | per-journey |
| dead-end-cta | last CTA has no destination | MEDIUM | per-journey |
| no-primary-cta | cta_count == 0 | CRITICAL | page-level |
| no-nav-links | nav_count == 0 | HIGH | page-level |
| competing-ctas | > 3 distinct CTAs above y=600 | MEDIUM | page-level |

### Node 5 Severity Weights

| Severity | Points Deducted |
|---|---|
| CRITICAL | 40 |
| HIGH | 20 |
| MEDIUM | 10 |
| LOW | 5 |

### Score Labels

| Score | Label |
|---|---|
| 90-100 | Excellent |
| 70-89 | Good |
| 50-69 | Needs Work |
| 0-49 | Poor |
