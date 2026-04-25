"use client"

/**
 * Popup root: manages audit lifecycle state and renders appropriate view.
 * chrome.* APIs are guarded behind typeof checks so Next dev server doesn't crash.
 */
import { useEffect, useState } from "react"
import AuditReport from "@/components/AuditReport"
import StatusLoader from "@/components/StatusLoader"
import AboutPage from "@/components/AboutPage"

type AppState = "idle" | "auditing" | "done" | "error" | "about"

interface StorageResult {
  report?: Record<string, unknown>
  status?: string
  error?: string
}

function isChromeAvailable(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage
}

export default function PopupPage() {
  const [state, setState] = useState<AppState>("idle")
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    if (!isChromeAvailable()) return
    chrome.storage.local.get(["report", "status", "error"], (result: StorageResult) => {
      if (result.status === "done" && result.report) {
        setReport(result.report)
        setState("done")
      } else if (result.status === "error") {
        setError(result.error ?? "Unknown error")
        setState("error")
      } else if (result.status === "auditing") {
        setState("auditing")
        pollForResult()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pollForResult(): void {
    if (!isChromeAvailable()) return
    const interval = setInterval(() => {
      chrome.storage.local.get(["report", "status", "error"], (result: StorageResult) => {
        if (result.status === "done" && result.report) {
          setReport(result.report)
          setState("done")
          clearInterval(interval)
        } else if (result.status === "error") {
          setError(result.error ?? "Unknown error")
          setState("error")
          clearInterval(interval)
        }
      })
    }, 800)
  }

  function handleAudit(): void {
    setState("auditing")
    if (isChromeAvailable()) {
      chrome.runtime.sendMessage({ type: "TRIGGER" })
    }
    pollForResult()
  }

  function handleRetry(): void {
    if (isChromeAvailable()) {
      chrome.storage.local.remove(["report", "status", "error"])
    }
    setState("idle")
    setReport(null)
    setError("")
  }

  return (
    <div className="w-[400px] min-h-[400px] max-h-[580px] overflow-y-auto overflow-x-hidden bg-white text-gray-900 font-sans shadow-2xl relative rounded-none border border-gray-200 flex flex-col scroll-smooth">
      {state === "idle" && (
        <div className="flex flex-col min-h-[400px] animate-fade-in-up">

          {/* ── Hero header ── */}
          <div className="bg-indigo-600 px-6 pt-8 pb-6 flex flex-col items-start">
            {/* Icon + wordmark */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
              </div>
              <span className="text-white/90 text-xs font-semibold uppercase tracking-widest">User Journey Auditor</span>
            </div>

            {/* Headline */}
            <h1 className="text-white text-2xl font-bold leading-tight tracking-tight mb-2">
              Find what's breaking<br />your conversions.
            </h1>
            <p className="text-indigo-200 text-sm leading-relaxed">
              Scan this page for dead ends, missing forms, buried CTAs, and friction that drives users away.
            </p>
            <p className="text-indigo-300 text-[11px] mt-1.5 leading-relaxed">
              Full-page audit — analyzes all elements regardless of scroll position.
            </p>

            {/* Stat chips */}
            <div className="flex gap-2 mt-5 flex-wrap">
              {["Journey detection", "Friction scoring", "AI validation"].map(label => (
                <span key={label} className="text-[11px] font-medium text-indigo-100 bg-white/10 border border-white/15 px-2.5 py-1 rounded-full">
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Pipeline strip ── */}
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              {[
                { icon: "⬡", label: "Scan DOM" },
                { icon: "◈", label: "Build graph" },
                { icon: "◎", label: "Score friction" },
                { icon: "✦", label: "AI review" },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center gap-0">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-indigo-500 text-base leading-none">{step.icon}</span>
                    <span className="text-[10px] font-medium text-gray-500 whitespace-nowrap">{step.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="w-8 h-px bg-indigo-200 mx-1.5 mb-4 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── What it detects ── */}
          <div className="px-6 py-5 flex-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Detects on this page</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: "→", label: "User journeys",    sub: "Signup · Pricing · Contact" },
                { icon: "⚡", label: "Friction points",  sub: "Dead ends · Missing forms" },
                { icon: "◉", label: "CTA structure",     sub: "Overload · Buried buttons" },
                { icon: "↓", label: "Funnel pressure",   sub: "Cross-page CTA density" },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="flex gap-2.5 bg-white border border-gray-200 rounded-lg px-3 py-2.5 shadow-sm">
                  <span className="text-indigo-500 text-sm shrink-0 mt-0.5">{icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-800 leading-tight">{label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── CTA ── */}
          <div className="px-6 pb-7 pt-2 flex flex-col gap-3">
            <button
              id="start-audit-btn"
              onClick={handleAudit}
              className="group w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
            >
              Full Page Audit
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
            <button
              id="about-btn"
              onClick={() => setState("about")}
              className="text-xs font-medium text-gray-400 hover:text-indigo-600 transition-colors text-center"
            >
              How does this work?
            </button>
          </div>

        </div>
      )}
      {state === "auditing" && (
        <div className="animate-fade-in min-h-[400px] flex items-center justify-center">
          <StatusLoader />
        </div>
      )}
      {state === "done" && report && (
        <div className="animate-fade-in-up">
          <AuditReport report={report as any} rawReport={report} />
        </div>
      )}
      {state === "about" && (
        <AboutPage onBack={() => setState("idle")} />
      )}
      {state === "error" && (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 p-8 animate-scale-in">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center border border-red-200">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-red-600 text-sm text-center">{error}</p>
          <button
            id="retry-btn"
            onClick={handleRetry}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] border border-gray-200 shadow-sm hover:shadow"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}
