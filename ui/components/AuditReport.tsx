"use client"

/**
 * Full audit report: score, nav structure, journeys, recommendations, AI validation, Q&A.
 */
import { useState } from "react"
import ElementSummary from "./ElementSummary"
import NavStructure from "./NavStructure"
import JourneyCard from "./JourneyCard"
import ChatPanel from "./ChatPanel"
import Tooltip from "./Tooltip"

interface DisputedFinding {
  original_rule_id: string
  original_severity: string
  dispute_reason: string
}

interface LLMObservation {
  observation: string
  severity: string
  category: string
}

interface NavSnapshot {
  primary_ctas: string[]
  nav_links: string[]
}

interface AuditReportData {
  url: string
  title: string
  overall_score: number
  pre_validation_score?: number
  qualitative_label: string
  summary: string
  recommendations: string[]
  journeys: any[]
  element_summary: any
  nav_snapshot?: NavSnapshot
  page_issues?: string[]
  disputed_findings?: DisputedFinding[]
  llm_observations?: LLMObservation[]
  generated_at: string
}

interface Props {
  report:            AuditReportData
  rawReport:         Record<string, unknown>
  activeJourney?:    any
  activeStep?:       number
  onStartVisualize?: (journey: any) => void
  onStepNext?:       () => void
  onStepPrev?:       () => void
  onStepJump?:       (index: number) => void
  onStopVisualize?:  () => void
}

// ─── Funnel analysis types ────────────────────────────────────────────────────

interface FunnelFlow {
  flow_name: string
  entry_page: string
  dest_page: string
  entry_ctas: number
  dest_ctas: number
  pressure_delta: number
  direction: "drops" | "rises" | "flat"
  verdict: "correct" | "warning" | "critical"
  verdict_label: string
}

interface PageNode {
  path: string
  cta_count: number
  tag?: string
}

interface CrawlReport {
  root_url: string
  pages_crawled: number
  site_map: PageNode[]
  funnel_flows: FunnelFlow[]
  overall_verdict: "correct" | "warning" | "critical"
}

const VERDICT_STYLES: Record<string, string> = {
  correct:  "bg-green-100 text-green-700 border-green-200",
  warning:  "bg-yellow-100 text-yellow-700 border-yellow-200",
  critical: "bg-red-100 text-red-700 border-red-200",
}

const DIRECTION_ICON: Record<string, string> = {
  drops: "↓",
  rises: "↑",
  flat:  "→",
}

const VERDICT_TIPS: Record<string, string> = {
  correct:  "Good — CTA count drops going deeper. Users face fewer decisions as they approach the goal. This is correct funnel design.",
  warning:  "Caution — CTA count stays flat or rises slightly. Users face similar or more choices deeper in the funnel, which can distract from converting.",
  critical: "Bad — CTA count rises sharply going deeper. Users hit decision paralysis right when they're closest to converting. Fix urgently.",
}

const DELTA_TIP = (delta: number, dir: string) =>
  dir === "drops"
    ? `CTAs drop by ${Math.abs(delta)} — focus narrows as intended. Good.`
    : dir === "rises"
    ? `CTAs rise by ${delta} — more noise deeper in the funnel. Investigate which CTAs are distracting users near conversion.`
    : "CTA count unchanged — funnel doesn't narrow. Consider reducing options on destination pages."

function FunnelFlowCard({ flow }: { flow: FunnelFlow }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-none mb-2 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-500">{flow.flow_name}</span>
          <Tooltip text={VERDICT_TIPS[flow.verdict]} width={230}>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-none border cursor-default ${VERDICT_STYLES[flow.verdict]}`}>
              {flow.verdict_label}
            </span>
          </Tooltip>
        </div>
        <Tooltip text={DELTA_TIP(flow.pressure_delta, flow.direction)} width={220}>
          <span className={`text-sm font-mono font-semibold cursor-default ${
            flow.direction === "drops" ? "text-green-600" :
            flow.direction === "rises" ? "text-red-500" : "text-gray-400"
          }`}>
            {DIRECTION_ICON[flow.direction]} {Math.abs(flow.pressure_delta)} CTAs
          </span>
        </Tooltip>
      </div>
      <div className="flex items-center px-3 py-2 gap-3 text-xs">
        <div className="flex flex-col items-center bg-white border border-gray-200 rounded-none px-2 py-1 min-w-0">
          <span className="font-mono font-semibold text-gray-800">{flow.entry_ctas}</span>
          <span className="text-gray-400 truncate max-w-[90px] text-[10px]">{flow.entry_page}</span>
        </div>
        <span className={`text-base font-semibold ${flow.direction === "drops" ? "text-green-500" : "text-red-400"}`}>
          {DIRECTION_ICON[flow.direction]}
        </span>
        <div className="flex flex-col items-center bg-white border border-gray-200 rounded-none px-2 py-1 min-w-0">
          <span className="font-mono font-semibold text-gray-800">{flow.dest_ctas}</span>
          <span className="text-gray-400 truncate max-w-[90px] text-[10px]">{flow.dest_page}</span>
        </div>
      </div>
    </div>
  )
}

function DeepAnalysisSection({ crawl }: { crawl: CrawlReport }) {
  return (
    <div className="px-5 mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Funnel Analysis</p>
        <span className="text-xs text-gray-400 font-mono">{crawl.pages_crawled} pages</span>
      </div>
      {crawl.funnel_flows.length === 0 ? (
        <p className="text-xs text-gray-400 font-mono py-2">No cross-page flows detected</p>
      ) : (
        crawl.funnel_flows.map((f, i) => <FunnelFlowCard key={i} flow={f} />)
      )}
      <div className="mt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Site Map</p>
        <div className="space-y-0.5">
          {crawl.site_map.map((page, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-gray-100">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-mono text-gray-500 truncate">{page.path}</span>
                {page.tag && (
                  <span className="text-[9px] font-semibold px-1 py-0.5 bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-none shrink-0">
                    {page.tag}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono text-gray-400 shrink-0 ml-2">{page.cta_count} CTAs</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function AuditReport({
  report,
  rawReport,
  activeJourney,
  activeStep = 0,
  onStartVisualize,
  onStepNext,
  onStepPrev,
  onStepJump,
  onStopVisualize,
}: Props) {
  const [crawl, setCrawl] = useState<CrawlReport | null>(null)
  const [deepStatus, setDeepStatus] = useState<"idle" | "running" | "done" | "error">("idle")
  const [currentPage, setCurrentPage] = useState(0)
  const MAX_PAGES = 10

  function handleDeepAudit(): void {
    setDeepStatus("running")
    setCurrentPage(0)
    chrome.runtime.sendMessage({ type: "DEEP_AUDIT", url: report.url, maxPages: MAX_PAGES })

    let page = 0
    const pageTimer = setInterval(() => {
      page = Math.min(page + 1, MAX_PAGES - 1)
      setCurrentPage(page)
    }, 3000)

    const pollTimer = setInterval(() => {
      chrome.storage.local.get(["crawl_report", "deep_status"], (r) => {
        if (r.deep_status === "done" && r.crawl_report) {
          clearInterval(pageTimer)
          clearInterval(pollTimer)
          setCrawl(r.crawl_report as CrawlReport)
          setDeepStatus("done")
        } else if (r.deep_status === "error") {
          clearInterval(pageTimer)
          clearInterval(pollTimer)
          setDeepStatus("error")
        }
      })
    }, 1000)
  }

  function handleCopy(): void {
    navigator.clipboard.writeText(JSON.stringify(rawReport, null, 2))
  }

  const disputed = report.disputed_findings ?? []
  const observations = report.llm_observations ?? []
  const pageIssues = report.page_issues ?? []
  const scoreAdjusted =
    report.pre_validation_score !== undefined &&
    report.pre_validation_score !== report.overall_score

  const scoreColor =
    report.overall_score >= 90 ? "text-green-400" :
    report.overall_score >= 75 ? "text-blue-300" :
    report.overall_score >= 50 ? "text-yellow-300" : "text-red-400"

  return (
    <div className="pb-6 w-full max-w-[400px]">

      {/* ── Indigo hero header ── */}
      <div className="bg-indigo-600 px-5 pt-5 pb-5 sticky top-0 z-10 animate-fade-in">
        {/* URL + score badge row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="text-[10px] text-indigo-200 font-medium truncate uppercase tracking-wider mt-1 flex-1 min-w-0">
            {report.url}
          </p>
          <Tooltip
            text="UX score out of 100. 90–100 = Excellent · 75–89 = Good · 50–74 = Needs Work · Below 50 = Poor."
            width={220}
          >
            <div className="shrink-0 flex flex-col items-center bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 cursor-default">
              <span className={`text-2xl font-bold leading-none ${scoreColor}`}>{report.overall_score}</span>
              <span className="text-[9px] text-indigo-200 uppercase tracking-wider mt-0.5">{report.qualitative_label}</span>
            </div>
          </Tooltip>
        </div>

        {/* Title */}
        <p className="text-white text-sm font-semibold leading-snug mb-2">{report.title}</p>

        {/* Summary */}
        <p className="text-indigo-100 text-xs leading-relaxed">{report.summary}</p>

        {/* Score adjustment note */}
        {scoreAdjusted && (
          <Tooltip
            text="The AI reviewed flagged rules against the screenshot and overruled false alarms — restoring points where the rule didn't apply to this page's context."
            width={240}
          >
            <p className="mt-2 text-[10px] text-indigo-200 bg-white/10 border border-white/15 rounded-lg px-2.5 py-1 cursor-default inline-block">
              Score adjusted {report.pre_validation_score} → {report.overall_score} after AI dispute
            </p>
          </Tooltip>
        )}
      </div>

      {/* Element counts */}
      <ElementSummary metadata={report.element_summary} navSnapshot={report.nav_snapshot} />

      {/* Navigation structure — intermediate results */}
      {report.nav_snapshot && <NavStructure snapshot={report.nav_snapshot} />}

      {/* Page-level structural issues */}
      {pageIssues.length > 0 && (
        <div className="mx-5 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Page issues</p>
          <div className="space-y-2">
            {pageIssues.map((issue, i) => (
              <div key={i} className="flex gap-2.5 text-sm bg-red-100 border border-red-200 rounded-none px-4 py-2.5 shadow-sm">
                <span className="text-red-500 shrink-0 font-medium mt-0.5">!</span>
                <span className="text-red-700">{issue}</span>
              </div>
            ))}
          </div>
          <div className="h-[1px] bg-gray-200 my-4 mx-1"></div>
        </div>
      )}

      {/* Journeys */}
      {(() => {
        const confident = report.journeys.filter((j: any) => (j.confidence ?? 1) >= 0.5)
        const uncertain = report.journeys.filter((j: any) => (j.confidence ?? 1) < 0.5)
        return (
          <>
            <div className="px-5 flex items-center justify-between mb-3 mt-4">
              <h3 className="text-sm font-semibold text-gray-900">User Journeys</h3>
              <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-none">{confident.length} detected</span>
            </div>
            {confident.length === 0 && uncertain.length === 0 ? (
              <div className="mx-5 mb-4 bg-gray-100 border border-gray-200 rounded-none px-4 py-3 text-center">
                <p className="text-sm text-gray-900 font-medium mb-0.5">No navigation-based journeys detected.</p>
                <p className="text-xs text-gray-600">This page may be search or content-driven, with no standard CTA/nav path to a key action.</p>
              </div>
            ) : (
              confident.map((j: any, i: number) => (
                <JourneyCard
                  key={i}
                  journey={j}
                  isActive={activeJourney?.type === j.type}
                  activeStep={activeJourney?.type === j.type ? activeStep : 0}
                  onStartVisualize={onStartVisualize ?? (() => {})}
                  onStepNext={onStepNext ?? (() => {})}
                  onStepPrev={onStepPrev ?? (() => {})}
                  onStepJump={onStepJump ?? (() => {})}
                  onStopVisualize={onStopVisualize ?? (() => {})}
                />
              ))
            )}
            {uncertain.length > 0 && (
              <details className="mx-5 mb-4 group">
                <summary className="text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-900 transition-colors list-none flex items-center gap-1.5 pb-2">
                  <span className="w-3.5 h-3.5 border border-gray-200 rounded-none flex items-center justify-center text-[9px] group-open:rotate-90 transition-transform">▶</span>
                  {uncertain.length} low-confidence detection{uncertain.length > 1 ? "s" : ""} (below 50%)
                </summary>
                {uncertain.map((j: any, i: number) => (
                  <JourneyCard
                    key={i}
                    journey={j}
                    isActive={activeJourney?.type === j.type}
                    activeStep={activeJourney?.type === j.type ? activeStep : 0}
                    onStartVisualize={onStartVisualize ?? (() => {})}
                    onStepNext={onStepNext ?? (() => {})}
                    onStepPrev={onStepPrev ?? (() => {})}
                    onStepJump={onStepJump ?? (() => {})}
                    onStopVisualize={onStopVisualize ?? (() => {})}
                  />
                ))}
              </details>
            )}
          </>
        )
      })()}

      <div className="px-5 mt-5">
        <div className="h-[1px] bg-[#27272a] my-6"></div>

        {/* Recommendations */}
        <details className="group" open>
          <summary className="text-sm font-semibold text-gray-900 mb-3 cursor-pointer list-none flex items-center justify-between hover:text-indigo-600 transition-colors">
            Recommendations
            <span className="text-xs group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <ul className="space-y-2.5 mt-2">
            {report.recommendations.map((r, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-600 bg-gray-100 border border-gray-200 shadow-sm rounded-none px-4 py-3 hover:-translate-y-0.5 transition-transform">
                <span className="font-semibold text-indigo-600 shrink-0 bg-indigo-100 border border-indigo-200 w-6 h-6 rounded-none flex items-center justify-center text-xs">{i + 1}</span>
                <span className="leading-relaxed pt-0.5">{r}</span>
              </li>
            ))}
          </ul>
        </details>

        {/* Disputed findings */}
        {disputed.length > 0 && (
          <details className="mt-6 group">
            <summary className="text-sm font-semibold text-gray-900 mb-3 cursor-pointer list-none flex items-center justify-between hover:text-indigo-600 transition-colors">
              <Tooltip text="Rules the auditor flagged that the AI reviewed and overruled. These findings were crossed out because the AI judged them inapplicable to this page's context — reducing false alarms." width={240}>
                <span>Disputed Findings</span>
              </Tooltip>
              <span className="text-xs group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="space-y-2 mt-2">
              {disputed.map((d, i) => (
                <div
                  key={i}
                  className="text-sm bg-gray-100 border border-gray-200 rounded-none px-4 py-3"
                >
                  <span className="line-through text-gray-500 font-medium mr-2 text-xs uppercase">
                    {d.original_rule_id}
                  </span>
                  <span className="text-gray-600">{d.dispute_reason}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* LLM observations */}
        {observations.length > 0 && (
          <details className="mt-6 group">
            <summary className="text-sm font-semibold text-gray-900 mb-3 cursor-pointer list-none flex items-center justify-between hover:text-indigo-600 transition-colors">
              <Tooltip text="Visual insights generated by the AI after looking at the page screenshot — things rules alone can't catch, like confusing layouts, unclear hierarchy, or poor contrast." width={240}>
                <span>UX Observations</span>
              </Tooltip>
              <span className="text-xs group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="space-y-2 mt-2">
              {observations.map((o, i) => (
                <div key={i} className="text-sm bg-indigo-100 border border-indigo-200 rounded-none px-4 py-3 flex flex-col gap-1">
                  <span className="text-indigo-600 text-[11px] font-semibold uppercase tracking-wider">{o.category}</span>
                  <span className="text-gray-600 leading-relaxed">{o.observation}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="h-[1px] bg-[#27272a] my-6"></div>

        <button
          id="export-json-btn"
          onClick={handleCopy}
          className="mt-4 mb-2 w-full py-3 text-sm font-medium tracking-wide text-gray-600 bg-gray-100 border border-gray-200 rounded-xl hover:bg-gray-200 hover:text-gray-900 transition-all duration-300 transform active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-gray-200 shadow-sm flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Export Raw JSON
        </button>
      </div>

      {/* Deep site analysis — funnel pressure analysis via Crawl4AI */}
      <div className="mx-5 mt-2 mb-4">
        <div className="h-[1px] bg-gray-200 my-4" />
        {deepStatus === "idle" && (
          <Tooltip
            text="Crawls up to 10 pages linked from this one and measures CTA density at each step. Checks if your funnel correctly narrows focus as users go deeper — e.g. homepage has 20 CTAs, pricing page should have fewer, not more."
           
            width={260}
          >
            <button
              onClick={handleDeepAudit}
              className="w-full py-2.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-none hover:bg-gray-50 hover:text-indigo-600 hover:border-indigo-200 transition-all"
            >
              Run Deep Site Analysis ↗
            </button>
          </Tooltip>
        )}
        {deepStatus === "running" && (
          <p className="text-xs font-mono text-zinc-600 text-center py-2 animate-pulse">
            crawling page {currentPage + 1} / {MAX_PAGES}…
          </p>
        )}
        {deepStatus === "error" && (
          <p className="text-xs text-red-500 text-center py-2">Deep audit failed — check backend logs</p>
        )}
      </div>

      {deepStatus === "done" && crawl && <DeepAnalysisSection crawl={crawl} />}

      {/* Q&A */}
      <ChatPanel report={rawReport} crawl={crawl as Record<string, unknown> | null} />
    </div>
  )
}
