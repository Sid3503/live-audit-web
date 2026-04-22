"use client"

/**
 * Collapsible journey card: steps, key actions, click count, detection method, friction issues.
 */
import { useState } from "react"
import FrictionBadge from "./FrictionBadge"
import Tooltip from "./Tooltip"

interface JourneyStep {
  element_id: string
  label: string
  action: string
  is_key_action?: boolean
}
interface FrictionPoint {
  type: string
  description: string
  severity: string
}
interface Journey {
  type: string
  steps: JourneyStep[]
  click_count: number
  friction_points: FrictionPoint[]
  severity_score: number
  detection_method?: string
  confidence?: number
  entry_point?: string
  exit_point?: string
  key_actions?: string[]
}

interface Props {
  journey: Journey
}

const JOURNEY_COLORS: Record<string, string> = {
  signup:   "bg-blue-100 text-blue-600 border-blue-200",
  pricing:  "bg-purple-100 text-purple-600 border-purple-200",
  contact:  "bg-teal-100 text-teal-600 border-teal-200",
  purchase: "bg-green-100 text-green-600 border-green-200",
  explore:  "bg-gray-100 text-gray-600 border-gray-200",
}

const METHOD_STYLES: Record<string, string> = {
  bfs_graph:      "bg-gray-100 text-gray-600",
  text_match:     "bg-gray-100 text-gray-500 border border-gray-200",
  llm_classified: "bg-violet-50 text-violet-600 border border-violet-200",
}

const JOURNEY_LABELS: Record<string, string> = {
  signup:   "Sign up",
  pricing:  "Pricing",
  contact:  "Contact",
  purchase: "Purchase",
  explore:  "Explore",
}

const ACTION_LABELS: Record<string, string> = {
  click:    "Click",
  navigate: "Navigate",
  follow:   "Follow link",
  submit:   "Submit",
  fill:     "Fill in",
}

function clickLabel(count: number): string {
  if (count === 0) return "Visible on page"
  return count === 1 ? "1 click" : `${count} clicks`
}

export default function JourneyCard({ journey }: Props) {
  const [expanded, setExpanded] = useState(false)
  const visibleSteps = expanded ? journey.steps : journey.steps.slice(0, 4)
  const method = journey.detection_method ?? "text_match"
  const confidence = journey.confidence ?? 0.5

  return (
    <div className="bg-gray-100 rounded-none mx-5 mb-4 overflow-hidden border border-gray-200 hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-300 shadow-sm hover:shadow-md animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-none border ${
              JOURNEY_COLORS[journey.type] ?? JOURNEY_COLORS.explore
            }`}
          >
            {JOURNEY_LABELS[journey.type] ?? journey.type}
          </span>
          <Tooltip
            text={
              method === "bfs_graph"
                ? "Detected by tracing real button/link connections — like following actual clickable paths. High confidence."
                : method === "llm_classified"
                ? "Detected by AI — the auditor asked the LLM to classify this journey from page content."
                : "Detected by matching link text keywords (e.g. 'pricing', 'contact'). Lower confidence than graph tracing."
            }
           
            width={230}
          >
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-none cursor-default ${
                METHOD_STYLES[method] ?? METHOD_STYLES.text_match
              }`}
            >
              {method === "bfs_graph" ? "graph" : method === "llm_classified" ? "AI" : "text match"}
            </span>
          </Tooltip>
          <Tooltip
            text={`How confident the auditor is this is a real journey. ${Math.round(confidence * 100)}% — ${confidence >= 0.7 ? "strong signal" : confidence >= 0.5 ? "plausible but verify" : "low confidence — treat as a hint, not a finding"}`}
           
            width={230}
          >
            <span className="text-xs text-gray-500 font-mono cursor-default">
              {Math.round(confidence * 100)}%
            </span>
          </Tooltip>
        </div>
        <Tooltip
          text={
            journey.click_count === 0
              ? "Immediately visible — no clicking needed to reach this action."
              : `A user must click ${journey.click_count} time${journey.click_count > 1 ? "s" : ""} to reach this goal. Fewer = less friction.`
          }
          width={192}
         
        >
          <span className="text-xs font-medium text-gray-600 shrink-0 cursor-default">{clickLabel(journey.click_count)}</span>
        </Tooltip>
      </div>

      {/* Key actions summary */}
      {journey.key_actions && journey.key_actions.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Key actions</p>
          <div className="flex flex-wrap gap-1.5">
            {journey.key_actions.map((action, i) => (
              <span key={i} className="text-xs font-medium bg-blue-100 border border-blue-200 text-blue-600 px-2 py-1 rounded-none truncate max-w-[180px]">
                {action}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Steps */}
      <ol className="px-4 py-3 space-y-1">
        {visibleSteps.map((step, i) => (
          <li
            key={step.element_id}
            className={`flex items-center gap-2.5 text-sm ${
              step.is_key_action ? "text-gray-900 font-medium" : "text-gray-600"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-none flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm ${
                step.is_key_action
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 border border-gray-200"
              }`}
            >
              {i + 1}
            </span>
            <span className="text-gray-500 font-medium shrink-0 text-xs uppercase tracking-wide">
              {ACTION_LABELS[step.action] ?? step.action}
            </span>
            <span className="truncate">{step.label || "(unlabeled)"}</span>
          </li>
        ))}
      </ol>

      {journey.steps.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-xs font-medium text-gray-600 hover:text-gray-900 py-2 border-t border-gray-200 transition-colors bg-gray-100 hover:bg-gray-200 rounded-b-xl"
        >
          {expanded ? "Show less" : `Show ${journey.steps.length - 4} more`}
        </button>
      )}

      {/* Entry / exit */}
      {(journey.entry_point || journey.exit_point) && (
        <div className="px-5 pb-3 pt-2 flex items-center gap-2 text-xs font-medium border-t border-gray-200 bg-gray-100">
          {journey.entry_point && (
            <span
              className="truncate max-w-[45%] text-gray-600"
              title={`Journey starts at: ${journey.entry_point}`}
            >
              <span className="text-gray-500 uppercase tracking-widest text-[9px] mr-1">In:</span>
              {journey.entry_point}
            </span>
          )}
          {journey.entry_point && journey.exit_point && <span className="text-gray-300">→</span>}
          {journey.exit_point && (
            <span
              className="truncate max-w-[45%] text-gray-600"
              title={`Journey ends at: ${journey.exit_point} — ideally a form, CTA, or confirmation`}
            >
              <span className="text-gray-500 uppercase tracking-widest text-[9px] mr-1">Out:</span>
              {journey.exit_point}
            </span>
          )}
        </div>
      )}

      {/* Friction issues */}
      {journey.friction_points.length > 0 && (
        <div className="px-4 pb-4 pt-3 flex flex-col gap-2 border-t border-gray-200 bg-red-100">
          <p className="text-[10px] font-semibold text-red-600/80 uppercase tracking-wider mb-1">Issues</p>
          {journey.friction_points.map((fp, i) => (
            <FrictionBadge key={i} point={fp} />
          ))}
        </div>
      )}
    </div>
  )
}
