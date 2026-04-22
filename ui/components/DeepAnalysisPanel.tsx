"use client"

/**
 * Polls /deep-analysis every 2s after audit completes.
 * Shows site map + cross-page journeys when Crawl4AI finishes.
 */
import { useEffect, useState } from "react"

interface PageSummary {
  url: string
  title: string
  cta_count: number
  nav_link_count: number
  journey_type: string | null
  top_ctas: string[]
}

interface CrossPageJourney {
  name: string
  type: string
  steps: string[]
}

interface DeepResult {
  status: "processing" | "ready" | "error"
  site_map?: string[]
  pages?: PageSummary[]
  cross_page_journeys?: CrossPageJourney[]
  pages_crawled?: number
  error?: string
}

interface Props {
  pageUrl: string
}

const _apiUrl: string =
  process.env.NEXT_PUBLIC_UJA_API_URL ?? "http://localhost:8000/api/v1/audit"
const DEEP_ANALYSIS_URL = _apiUrl.replace(/\/audit$/, "") + "/deep-analysis"

const JOURNEY_COLORS: Record<string, string> = {
  signup:   "bg-blue-100 text-blue-600 border-blue-200",
  pricing:  "bg-purple-100 text-purple-600 border-purple-200",
  contact:  "bg-teal-100 text-teal-600 border-teal-200",
  purchase: "bg-green-100 text-green-600 border-green-200",
}

export default function DeepAnalysisPanel({ pageUrl }: Props) {
  const [result, setResult] = useState<DeepResult | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    let stopped = false
    const timeout = setTimeout(() => {
      stopped = true
      setTimedOut(true)
    }, 60_000)

    const interval = setInterval(async () => {
      if (stopped) return
      try {
        const res = await fetch(
          `${DEEP_ANALYSIS_URL}?url=${encodeURIComponent(pageUrl)}`
        )
        if (!res.ok) return
        const data: DeepResult = await res.json()
        if (data.status === "ready" || data.status === "error") {
          setResult(data)
          stopped = true
          clearInterval(interval)
          clearTimeout(timeout)
        }
      } catch {
        // network blip — keep polling
      }
    }, 2000)

    return () => {
      stopped = true
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [pageUrl])

  return (
    <details className="mt-6 mx-5 border border-gray-200 bg-gray-100 rounded-none overflow-hidden group">
      {/* Header */}
      <summary className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between cursor-pointer list-none">
        <span className="text-xs font-semibold text-gray-900 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">
          Deep Site Analysis
          <span className="ml-2 text-xs group-open:-rotate-180 transition-transform inline-block">▼</span>
        </span>
        {!result && !timedOut && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
            Crawling…
          </span>
        )}
        {result?.status === "ready" && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600/80 animate-pulse-smooth" />
            {result.pages_crawled} pages crawled
          </span>
        )}
      </summary>

      {/* Processing state */}
      {!result && !timedOut && (
        <div className="px-4 py-4 text-xs text-gray-600 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Crawling site in background…
          </div>
          {/* Progress bar */}
          <div className="w-full h-[3px] bg-gray-100 overflow-hidden mt-1 mx-0.5">
            <div className="h-full bg-indigo-600 w-[50%] animate-[pulse_2s_infinite]"></div>
          </div>
        </div>
      )}

      {/* Timeout */}
      {timedOut && !result && (
        <p className="px-4 py-3 text-xs text-gray-600">
          Deep analysis timed out — site may be too large or slow to crawl.
        </p>
      )}

      {/* Error */}
      {result?.status === "error" && (
        <p className="px-4 py-3 text-xs text-red-600">{result.error ?? "Deep analysis failed."}</p>
      )}

      {/* Ready */}
      {result?.status === "ready" && (
        <div className="divide-y divide-gray-200">
          {/* Cross-page journeys */}
          {(result.cross_page_journeys?.length ?? 0) > 0 && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Cross-page flows
              </p>
              <div className="space-y-2">
                {result.cross_page_journeys!.map((j, i) => (
                  <div key={i} className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 border rounded-none ${
                        JOURNEY_COLORS[j.type] ?? "bg-gray-100 text-gray-500 border-gray-200"
                      }`}
                    >
                      {j.name}
                    </span>
                    {j.steps.map((step, si) => (
                      <span key={si} className="flex items-center gap-1">
                        {si > 0 && <span className="text-gray-300 text-xs">→</span>}
                        <span className="text-[11px] text-gray-600 font-mono truncate max-w-[100px]">
                          {step}
                        </span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Site map */}
          {(result.pages?.length ?? 0) > 0 && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Site map
              </p>
              <div className="space-y-1.5">
                {result.pages!.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-600 font-mono truncate flex-1">
                      {new URL(p.url).pathname || "/"}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.journey_type && (
                        <span
                          className={`text-[9px] font-semibold px-1 py-0.5 border rounded-none ${
                            JOURNEY_COLORS[p.journey_type] ?? "bg-gray-100 text-gray-500 border-gray-200"
                          }`}
                        >
                          {p.journey_type}
                        </span>
                      )}
                      {p.cta_count > 0 && (
                        <span className="text-[10px] text-gray-500">{p.cta_count} CTAs</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No cross-page journeys found */}
          {(result.cross_page_journeys?.length ?? 0) === 0 && (
            <p className="px-4 py-3 text-xs text-gray-600">
              No cross-page journey paths detected within crawled pages.
            </p>
          )}
        </div>
      )}
    </details>
  )
}
