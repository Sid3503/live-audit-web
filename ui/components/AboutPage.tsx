"use client"

import { ReactElement, ReactNode } from "react"

interface Props {
  onBack: () => void
}

const STEP = ({ n, title, detail }: { n: number; title: string; detail: string }) => (
  <li className="flex gap-3">
    <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-indigo-600 text-white rounded-none font-bold text-[10px] mt-0.5">{n}</span>
    <span className="text-sm text-gray-600 leading-relaxed">
      <strong className="text-gray-800">{title} — </strong>{detail}
    </span>
  </li>
)

const EXAMPLE = ({ label, color, text }: { label: string; color: string; text: string }) => (
  <div className={`border p-3 shadow-sm hover:-translate-y-0.5 transition-transform ${color}`}>
    <p className="text-xs font-semibold mb-1">{label}</p>
    <p className="text-xs text-gray-600">{text}</p>
  </div>
)

const TERM = ({ word, def }: { word: string; def: string }) => (
  <div className="border-b border-gray-100 py-2">
    <p className="text-xs font-semibold text-gray-800">{word}</p>
    <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{def}</p>
  </div>
)

const NodeCard = ({
  n, color, title, role, children,
}: {
  n: number; color: string; title: string; role: string; children: ReactNode
}) => (
  <div className="border border-gray-200 bg-white rounded-none overflow-hidden">
    <div className={`flex items-center gap-2 px-3 py-2 ${color}`}>
      <span className="w-5 h-5 flex items-center justify-center bg-white/30 text-white font-bold text-[10px] rounded-none shrink-0">{n}</span>
      <div>
        <p className="text-[11px] font-bold text-white leading-tight">{title}</p>
        <p className="text-[9px] text-white/70 uppercase tracking-wider">{role}</p>
      </div>
    </div>
    <div className="px-3 py-2.5 text-xs text-gray-600 leading-relaxed space-y-1.5">{children}</div>
  </div>
)

const EdgeRule = ({
  name, from, arrow, to, why,
}: {
  name: string; from: string; arrow: string; to: string; why: string
}) => (
  <div className="bg-gray-50 border border-gray-200 px-3 py-2 rounded-none">
    <div className="flex items-center gap-1.5 mb-1">
      <span className="text-[10px] font-bold text-indigo-600 font-mono">{name}</span>
    </div>
    <p className="font-mono text-[10px] text-gray-700 mb-1">
      <span className="text-blue-600">{from}</span>
      <span className="text-gray-400"> {arrow} </span>
      <span className="text-green-600">{to}</span>
    </p>
    <p className="text-[10px] text-gray-500 leading-relaxed">{why}</p>
  </div>
)

const CodeBlock = ({ lines }: { lines: string[] }) => (
  <div className="bg-gray-900 rounded-none px-3 py-2.5 font-mono text-[10px] text-gray-300 leading-relaxed overflow-x-auto">
    {lines.map((l, i) => (
      <div key={i} className={l.startsWith("//") ? "text-gray-500" : l.startsWith("→") ? "text-green-400 pl-2" : l.startsWith("✓") ? "text-green-400" : l.startsWith("✗") ? "text-red-400" : ""}>{l || "\u00A0"}</div>
    ))}
  </div>
)

export default function AboutPage({ onBack }: Props): ReactElement {
  return (
    <div className="flex flex-col h-full bg-white text-gray-900 animate-fade-in-up">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">How does this work?</h2>
        <button
          id="about-close-btn"
          onClick={onBack}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          Close
        </button>
      </div>

      <div className="p-5 space-y-7 overflow-y-auto pb-24">

        {/* What is this */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">What is this?</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            The <strong>User Journey Auditor</strong> is an AI-powered Chrome extension that reads any webpage and tells you how easy — or hard — it is for a real user to complete key goals like signing up, finding pricing, or contacting sales.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed mt-2">
            Think of it as hiring a UX expert to review your site in under 15 seconds. It finds dead ends, buried buttons, confusing navigation, and missing forms — then gives a score and actionable recommendations.
          </p>
        </section>

        {/* How it works — pipeline */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">What happens when you click "Start Audit"?</h3>
          <ol className="space-y-4">
            <STEP n={1} title="Page is scanned"
              detail="A content script reads every button, link, form, and navigation element on the page — without loading any external resources or changing anything. It extracts labels, positions, and relationships." />
            <STEP n={2} title="A navigation graph is built"
              detail="All elements are connected into a graph — like a map of the page. Buttons that lead to other sections become edges. The auditor traces paths through this graph to find journeys." />
            <STEP n={3} title="Journeys are detected"
              detail="The auditor searches the graph for known journey types: signup, pricing, contact, purchase, explore. It uses real link tracing first, then keyword matching, then AI classification as a fallback." />
            <STEP n={4} title="Friction rules are applied"
              detail='Each journey is checked against a set of UX rules. Examples: "Does the signup journey lead to a form?" "Does this CTA lead anywhere?" "Are there too many competing buttons on screen at once?"' />
            <STEP n={5} title="AI reviews the screenshot"
              detail="A vision-capable AI model looks at an actual screenshot of the page and checks whether the flagged issues are real. It can overrule false alarms — for example, it won't penalise Stripe for having off-page auth when that's the standard pattern." />
            <STEP n={6} title="Score and report are generated"
              detail="The final score (0–100) reflects both the rule violations and the AI's verdict. You get a summary, per-journey breakdowns, disputed findings, UX observations, and prioritised recommendations." />
          </ol>
        </section>

        {/* ── LangGraph Deep Dive ─────────────────────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Inside the AI Pipeline</h3>
          <p className="text-xs text-gray-500 leading-relaxed mb-4">
            Imagine walking into a store and asking: <em>"How easy is it to buy something here?"</em> You'd look for the checkout, count the steps, spot confusing signs, dead ends, too many options. That's exactly what this pipeline does — for websites, automatically, in 15 seconds.
          </p>

          {/* The 5 desks flow */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-none px-3 py-2.5 mb-4">
            <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wider mb-2">Think of it as 5 people passing a folder</p>
            <div className="flex items-center gap-1 flex-wrap text-[10px] font-mono text-indigo-600">
              {["Desk 1", "→", "Desk 2", "→", "Desk 3", "→", "Desk 4", "→", "Desk 5", "→", "Report"].map((s, i) => (
                <span key={i} className={s === "→" ? "text-indigo-300" : "font-semibold"}>{s}</span>
              ))}
            </div>
            <p className="text-[10px] text-indigo-500 mt-1.5">Each person opens the folder, does their job, adds notes, passes it on.</p>
          </div>

          {/* Node cards */}
          <div className="space-y-3 mb-4">

            <NodeCard n={1} color="bg-indigo-600" title="Build Graph" role="The Map Maker">
              <p>Converts the flat list of DOM elements into a <strong>map of connections</strong> — like a subway map. Individual buttons mean nothing alone; what matters is which ones have tracks between them.</p>
              <p className="text-gray-400">~47 elements → ~600 edges. One element is marked as the start (the hero CTA at the top of the page).</p>
            </NodeCard>

            {/* Edge rules inside Node 1 */}
            <div className="ml-3 space-y-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">The 4 Connection Rules</p>

              <EdgeRule
                name="cta-chain"
                from="Primary CTA"
                arrow="→"
                to="Secondary CTA / link"
                why='"GET STARTED" (big bold button) → "or see how it works" (smaller link below it). Same CTA group — primary leads, secondary catches the hesitant user.'
              />
              <EdgeRule
                name="nav-to-cta"
                from="Nav link"
                arrow="→ (within 300px)"
                to="CTA"
                why='"Pricing" in the navbar → "Start Free Trial" button below it. The 300px guard prevents the navbar from connecting to the footer 2000px away.'
              />
              <EdgeRule
                name="input-to-submit"
                from="Form input"
                arrow="→"
                to="Submit button"
                why='[ Enter your email ] → [ Subscribe ]. Always connected — models how forms work.'
              />
              <EdgeRule
                name="proximity-link"
                from="Link"
                arrow="→ (within 80px)"
                to="CTA"
                why='"Learn more" ↔ "Buy Now" (40px apart). 80px is tight enough to mean same UI card. Links are everywhere — a loose check would create fake cross-page connections.'
              />

              <div className="bg-amber-50 border border-amber-200 px-3 py-2 rounded-none">
                <p className="text-[10px] text-amber-700"><strong>First match wins.</strong> If A and B satisfy both cta-chain and proximity-link, only cta-chain fires. No duplicate edges.</p>
              </div>
            </div>

            <NodeCard n={2} color="bg-violet-600" title="Classify CTAs" role="The Translator">
              <p>Keywords handle obvious labels ("sign up", "get started"). But what about <em>"Get Notion free"</em> or <em>"Talk to an expert"</em>?</p>
              <p>This node sends ambiguous primary CTAs to the LLM and asks: <em>"what is the user trying to do when they click this?"</em></p>
              <CodeBlock lines={[
                "0: Get Notion free    → signup",
                "1: Talk to an expert  → contact",
                "2: See all features   → (not confident, skip)",
                "3: Sign up            → (keywords handle this)",
              ]} />
              <p className="text-gray-400">If LLM fails → node passes empty result. Pipeline never stops.</p>
            </NodeCard>

            <NodeCard n={3} color="bg-blue-600" title="Detect Journeys" role="The Path Finder">
              <p>Uses the graph from Node 1 + labels from Node 2 to find the <strong>shortest path</strong> from root to each journey destination.</p>
              <p className="font-semibold text-gray-700">Think of it like a GPS (BFS = Breadth-First Search):</p>
              <CodeBlock lines={[
                "Start: [Get Started]  (root)",
                "Destination: any signup-type element",
                "",
                "→ [Start Trial]   signup? YES → found!",
                "→ [Pricing]       signup? No → keep going",
              ]} />
              <p className="font-semibold text-gray-700 mt-1">Three signal layers build the target set:</p>
              <div className="space-y-1">
                {[
                  ["Keywords", 'text contains "sign up", "get started", "try free"', "Fast, high precision"],
                  ["Regex", 'matches "get [x] free", "start [x] trial"', "Catches branded variants"],
                  ["LLM labels", "Node 2 classified this element as signup", "Catches everything else"],
                ].map(([layer, what, note]) => (
                  <div key={layer} className="flex gap-2">
                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-none shrink-0 self-start mt-0.5">{layer}</span>
                    <div>
                      <p className="text-[10px] text-gray-700">{what}</p>
                      <p className="text-[10px] text-gray-400">{note}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="font-semibold text-gray-700 mt-1">Confidence score per journey:</p>
              <div className="space-y-1">
                {[
                  ["BFS on graph", "0.70–0.95", "green", "Real navigation path confirmed"],
                  ["LLM labels only", "0.55–0.70", "yellow", "Semantic, no graph confirmation"],
                  ["Text match fallback", "0.30–0.45", "red", "Best guess, verify manually"],
                ].map(([method, range, color, note]) => (
                  <div key={method} className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-semibold shrink-0 ${color === "green" ? "text-green-600" : color === "yellow" ? "text-yellow-600" : "text-red-500"}`}>{range}</span>
                    <span className="text-[10px] text-gray-600">{method} — {note}</span>
                  </div>
                ))}
              </div>
            </NodeCard>

            <NodeCard n={4} color="bg-orange-500" title="Score Friction" role="The Inspector">
              <p>Like a building inspector with a checklist. For every journey, runs through the friction rules. <strong>No LLM — pure rule evaluation.</strong></p>
              <p className="font-semibold text-gray-700">Per-journey checks:</p>
              <div className="space-y-1">
                {[
                  ["too-many-clicks", "HIGH", "> 5 clicks to complete journey"],
                  ["dead-end-cta", "MEDIUM", "Last CTA has no href or links to #"],
                  ["signup-no-form", "MEDIUM", "Signup journey but zero forms on page"],
                  ["single-step", "LOW", "0 clicks, 1 element — probably shallow"],
                ].map(([rule, sev, desc]) => (
                  <div key={rule} className="flex gap-2 items-start">
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded-none border shrink-0 mt-0.5 ${sev === "HIGH" ? "bg-orange-100 text-orange-600 border-orange-200" : sev === "MEDIUM" ? "bg-yellow-100 text-yellow-600 border-yellow-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>{sev}</span>
                    <div>
                      <p className="text-[10px] font-mono text-gray-700">{rule}</p>
                      <p className="text-[10px] text-gray-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="font-semibold text-gray-700 mt-1">Page-level checks (fire once, not per journey):</p>
              <p className="text-[10px] text-gray-500">If "no CTA" was a per-journey rule, a page with 3 journeys gets penalised 3× for the same problem. Page rules fire exactly once.</p>
              <div className="space-y-1 mt-1">
                {[
                  ["no-primary-cta", "CRITICAL", "Zero CTAs — users have no action"],
                  ["no-nav-links", "HIGH", "No navigation — users are stranded"],
                  ["competing-ctas", "MEDIUM", "> 3 distinct primary CTAs in top 600px"],
                ].map(([rule, sev, desc]) => (
                  <div key={rule} className="flex gap-2 items-start">
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded-none border shrink-0 mt-0.5 ${sev === "CRITICAL" ? "bg-red-100 text-red-600 border-red-200" : sev === "HIGH" ? "bg-orange-100 text-orange-600 border-orange-200" : "bg-yellow-100 text-yellow-600 border-yellow-200"}`}>{sev}</span>
                    <div>
                      <p className="text-[10px] font-mono text-gray-700">{rule}</p>
                      <p className="text-[10px] text-gray-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </NodeCard>

            <NodeCard n={5} color="bg-emerald-600" title="LLM Audit" role="The Reviewer">
              <p>The only node that uses an LLM for judgment. It receives all prior output and does four things:</p>
              <div className="space-y-1">
                {[
                  ["Validate", "Disputes false-positive friction findings with explicit reasoning"],
                  ["Observe", "Adds 2–3 UX insights heuristics can't detect (copy clarity, trust signals, cognitive load)"],
                  ["Summarize", "2 sentences on the page's real UX health"],
                  ["Recommend", "2–5 actions, ordered by impact"],
                ].map(([label, desc]) => (
                  <div key={label} className="flex gap-2">
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-none shrink-0 self-start mt-0.5">{label}</span>
                    <p className="text-[10px] text-gray-600">{desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-gray-400 mt-1">Primary: OpenAI GPT-4o-mini. Fallback: Gemini 2.0 Flash. If both fail → safe defaults, pipeline completes.</p>
            </NodeCard>
          </div>

          {/* Dry run */}
          <div className="bg-gray-50 border border-gray-200 rounded-none px-3 py-3">
            <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-2">Dry run — Stripe homepage</p>
            <CodeBlock lines={[
              "175 elements extracted",
              "",
              "Node 1 → NavGraph: 180 nodes, 590 edges",
              '  root = "Start now" (hero CTA)',
              "",
              "Node 2 → LLM classifies:",
              '  "Start now"       → signup',
              '  "Contact sales"   → contact',
              "",
              "Node 3 → 3 journeys found:",
              "  signup  → 1 click  (conf 0.92, bfs_graph)",
              "  pricing → 1 click  (conf 0.88, direct_link)",
              "  contact → 1 click  (conf 0.90, bfs_graph)",
              "",
              "Node 4 → friction:",
              "  LOW: single-step-journey on signup",
              "  PAGE: no issues",
              "",
              "Node 5 → LLM disputes single-step",
              '  "Direct CTA is correct for developers"',
              "",
              "✓ Final score: 99/100  Excellent",
            ]} />
          </div>
        </section>

        {/* Journey types */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">What journeys does it detect?</h3>
          <div className="space-y-2">
            {[
              { type: "Sign up", color: "bg-blue-100 text-blue-700 border-blue-200", desc: "The path from landing to creating an account. Checks for a visible signup CTA and an associated form." },
              { type: "Pricing", color: "bg-purple-100 text-purple-700 border-purple-200", desc: "Can a user find pricing information within 1–2 clicks? Hidden pricing is a known conversion killer." },
              { type: "Contact", color: "bg-teal-100 text-teal-700 border-teal-200", desc: "Is there a clear path to reach the sales team or support? Checks for contact forms or sales CTAs." },
              { type: "Purchase", color: "bg-green-100 text-green-700 border-green-200", desc: "Can a user reach a checkout or buy flow? Looks for 'buy', 'checkout', 'add to cart' style CTAs." },
              { type: "Explore", color: "bg-gray-100 text-gray-700 border-gray-200", desc: "General navigation paths — does the page help users discover features, about pages, or documentation?" },
            ].map(({ type, color, desc }) => (
              <div key={type} className={`flex gap-3 items-start border rounded-none px-3 py-2 ${color}`}>
                <span className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 mt-0.5 px-1.5 py-0.5 border rounded-none ${color}`}>{type}</span>
                <p className="text-xs text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Friction rules explained */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">What friction rules are checked?</h3>
          <div className="space-y-3">
            {[
              { name: "Dead end", sev: "medium", ex: "A 'Get Demo' button that links nowhere. User clicks, nothing happens. They leave." },
              { name: "Signup with no form", sev: "medium", ex: "A page whose signup CTA redirects externally with no form visible — new users have no clear next step." },
              { name: "Single-step journey", sev: "low", ex: "A 'Pricing' link that just shows a text link — no dedicated pricing page, no interactive comparison. Fine for returning users, confusing for new ones." },
              { name: "CTA overload", sev: "high", ex: "A homepage with 18 buttons all demanding attention at once — 'Sign up', 'Watch demo', 'Talk to sales', 'See docs'… users freeze and do nothing." },
            ].map(({ name, sev, ex }) => (
              <div key={name} className="bg-gray-50 border border-gray-200 rounded-none px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-800">{name}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-none border ${
                    sev === "high" ? "bg-orange-100 text-orange-600 border-orange-200" :
                    sev === "medium" ? "bg-yellow-100 text-yellow-600 border-yellow-200" :
                    "bg-gray-100 text-gray-500 border-gray-200"
                  }`}>{sev}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{ex}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Score explained */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">How is the score calculated?</h3>
          <p className="text-sm text-gray-600 leading-relaxed mb-3">
            The score starts at 100 and friction points subtract from it. Each deduction depends on the rule's severity and confidence of the journey it was found on. The AI then reviews the screenshot and can dispute rules — restoring points for false alarms.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { range: "90 – 100", label: "Excellent", color: "bg-green-100 border-green-200 text-green-700" },
              { range: "75 – 89",  label: "Good",      color: "bg-blue-100 border-blue-200 text-blue-700" },
              { range: "50 – 74",  label: "Needs Work", color: "bg-yellow-100 border-yellow-200 text-yellow-700" },
              { range: "0 – 49",   label: "Poor",      color: "bg-red-100 border-red-200 text-red-700" },
            ].map(({ range, label, color }) => (
              <div key={label} className={`border rounded-none px-3 py-2 ${color}`}>
                <p className="text-xs font-bold">{label}</p>
                <p className="text-[10px] font-mono mt-0.5">{range}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Deep analysis */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">What is the Deep Site Analysis?</h3>
          <p className="text-sm text-gray-600 leading-relaxed mb-3">
            The standard audit looks at one page. The <strong>Deep Site Analysis</strong> crawls up to 10 pages linked from the current one and measures <em>funnel pressure</em> — how CTA density changes as users go deeper into the site.
          </p>
          <div className="space-y-2">
            <EXAMPLE
              label="✓ Good funnel — focus narrows"
              color="bg-green-50 border border-green-200 rounded-none"
              text="Homepage has 20 CTAs. Pricing page has 4 CTAs. As users go deeper, they face fewer distractions — the funnel is correctly directing attention toward conversion."
            />
            <EXAMPLE
              label="✗ Bad funnel — decision paralysis"
              color="bg-red-50 border border-red-200 rounded-none"
              text="Homepage has 8 CTAs. Checkout page has 22 CTAs. Users are bombarded with choices at the exact moment they're most ready to convert — this kills conversions."
            />
          </div>
        </section>

        {/* Glossary */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Glossary</h3>
          <div className="bg-gray-50 border border-gray-200 rounded-none px-3 py-1">
            <TERM word="CTA (Call to Action)" def="Any button or link asking the user to do something — 'Sign Up', 'Buy Now', 'Learn More'. The main driver of conversions." />
            <TERM word="Friction" def="Anything that makes a user's path to their goal harder than it needs to be — extra clicks, confusing labels, broken links, missing forms." />
            <TERM word="Journey" def="A named user goal + the path to reach it. A 'signup journey' = the series of steps from landing to account creation." />
            <TERM word="Confidence %" def="How certain the auditor is that a detected journey is real. 70%+ = strong. Below 50% = treat as a hint, verify manually." />
            <TERM word="Funnel pressure" def="The CTA count change between two pages. Negative = fewer distractions (good). Positive = more noise deeper in the funnel (bad)." />
            <TERM word="AI dispute" def="When the AI overrules a rule violation after reviewing the screenshot — used to remove false alarms from the score." />
          </div>
        </section>

      </div>

      <div className="p-5 border-t border-gray-200 bg-white sticky bottom-0">
        <button
          id="about-back-btn"
          onClick={onBack}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white"
        >
          Got it, take me back
        </button>
      </div>
    </div>
  )
}
