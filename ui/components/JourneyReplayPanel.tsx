"use client"

/**
 * Journey replay panel — lives inside the popup, synced to the page overlay.
 */
import { useEffect } from "react"

interface JourneyStep {
  element_id:     string
  label:          string
  action:         string
  is_key_action?: boolean
}

interface FrictionPoint {
  type:        string
  description: string
  severity:    string
}

interface Journey {
  type:              string
  steps:             JourneyStep[]
  click_count:       number
  confidence?:       number
  detection_method?: string
  entry_point?:      string
  exit_point?:       string
  friction_points:   FrictionPoint[]
  severity_score:    number
}

interface Props {
  journey:     Journey
  currentStep: number
  onNext:      () => void
  onPrev:      () => void
  onExit:      () => void
  onJumpTo:    (index: number) => void
}

const JOURNEY_COLORS: Record<string, { bg: string; text: string; border: string; solid: string }> = {
  signup:   { bg: "bg-blue-900",    text: "text-blue-300",    border: "border-blue-700",    solid: "#3b82f6" },
  pricing:  { bg: "bg-purple-900",  text: "text-purple-300",  border: "border-purple-700",  solid: "#8b5cf6" },
  contact:  { bg: "bg-emerald-900", text: "text-emerald-300", border: "border-emerald-700", solid: "#10b981" },
  purchase: { bg: "bg-amber-900",   text: "text-amber-300",   border: "border-amber-700",   solid: "#f59e0b" },
  explore:  { bg: "bg-zinc-800",    text: "text-zinc-400",    border: "border-zinc-700",    solid: "#6b7280" },
}

const ACTION_ICONS: Record<string, string> = {
  click:    "↗",
  navigate: "→",
  follow:   "⤴",
  submit:   "✓",
  fill:     "✎",
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-900 text-red-300",
  high:     "bg-orange-900 text-orange-300",
  medium:   "bg-yellow-900 text-yellow-300",
  low:      "bg-zinc-700 text-zinc-400",
}

export default function JourneyReplayPanel({
  journey,
  currentStep,
  onNext,
  onPrev,
  onExit,
  onJumpTo,
}: Props) {
  const colors     = JOURNEY_COLORS[journey.type] ?? JOURNEY_COLORS.explore
  const totalSteps = journey.steps.length
  const step       = journey.steps[currentStep]
  const progress   = totalSteps > 1 ? (currentStep / (totalSteps - 1)) * 100 : 100
  const isLast     = currentStep === totalSteps - 1
  const isFirst    = currentStep === 0

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" && !isLast)  onNext()
      if (e.key === "ArrowLeft"  && !isFirst) onPrev()
      if (e.key === "Escape")                 onExit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [currentStep, isFirst, isLast, onNext, onPrev, onExit])

  return (
    <div className={`rounded-none mx-0 overflow-hidden border-t ${colors.border} bg-zinc-900`}>

      {/* Panel header */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${colors.border}`}
        style={{ background: `${colors.solid}18` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: `${colors.solid}22`, color: colors.solid }}
          >
            {journey.type}
          </span>
          <span className="text-xs text-zinc-500 font-mono">
            {journey.click_count} click{journey.click_count !== 1 ? "s" : ""}
          </span>
          {journey.detection_method && (
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
              journey.detection_method === "bfs_graph"
                ? "text-emerald-400 bg-emerald-900"
                : "text-zinc-500 bg-zinc-800"
            }`}>
              {journey.detection_method === "bfs_graph" ? "graph" : "text match"}
            </span>
          )}
        </div>
        <button
          onClick={onExit}
          className="text-zinc-600 hover:text-zinc-400 text-sm font-mono transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-zinc-800">
        <div
          className="h-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%`, background: colors.solid }}
        />
      </div>

      {/* Step flow diagram — horizontal scrollable pills */}
      <div className="px-4 pt-3 pb-1 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {journey.steps.map((s, i) => (
            <div key={s.element_id} className="flex items-center gap-1">
              <button
                onClick={() => onJumpTo(i)}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono
                  transition-all duration-200 border whitespace-nowrap
                  ${i === currentStep
                    ? `border text-xs font-mono`
                    : i < currentStep
                    ? "bg-zinc-800 text-zinc-500 border-zinc-700"
                    : "bg-zinc-900 text-zinc-700 border-zinc-800"
                  }
                `}
                style={i === currentStep ? {
                  background: `${colors.solid}22`,
                  color: colors.solid,
                  borderColor: `${colors.solid}66`,
                } : {}}
              >
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs shrink-0"
                  style={i === currentStep ? { color: colors.solid } : {}}
                >
                  {i < currentStep ? "✓" : i + 1}
                </span>
                <span className="max-w-[80px] truncate">{s.label || "(element)"}</span>
              </button>
              {i < journey.steps.length - 1 && (
                <span className={`text-xs font-mono shrink-0 ${
                  i < currentStep ? "text-zinc-600" : "text-zinc-800"
                }`}>
                  {ACTION_ICONS[journey.steps[i + 1]?.action ?? "click"] ?? "→"}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Current step detail */}
      {step && (
        <div className="mx-4 my-3 bg-zinc-800 rounded-lg p-3 border border-zinc-700">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="text-xs text-zinc-500 font-mono mb-1">
                step {currentStep + 1} of {totalSteps}
              </p>
              <p className="text-sm font-medium text-zinc-100 leading-tight">
                {step.label || "(unlabeled element)"}
              </p>
            </div>
            <span className={`text-xs font-mono px-2 py-1 rounded shrink-0 ${
              step.action === "click"    ? "bg-blue-900 text-blue-400" :
              step.action === "navigate" ? "bg-purple-900 text-purple-400" :
              "bg-zinc-700 text-zinc-400"
            }`}>
              {step.action}
            </span>
          </div>
          <p className="text-xs font-mono text-zinc-700 truncate">id: {step.element_id}</p>
          {(currentStep === 0 || isLast) && (
            <div className="mt-2 text-xs font-mono px-2 py-1 rounded"
              style={isLast && currentStep !== 0
                ? { background: `${colors.solid}18`, color: colors.solid }
                : { background: "#27272a", color: "#71717a" }
              }
            >
              {currentStep === 0 ? "⤷ entry point" : "⤶ exit point"}
            </div>
          )}
        </div>
      )}

      {/* Friction points */}
      {journey.friction_points.length > 0 && (
        <div className="px-4 pb-2">
          <p className="text-xs font-mono text-zinc-600 uppercase tracking-wide mb-1.5">friction</p>
          <div className="flex flex-col gap-1">
            {journey.friction_points.map((fp, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded ${
                  SEVERITY_STYLES[fp.severity] ?? SEVERITY_STYLES.low
                }`}
              >
                <span className="font-mono uppercase shrink-0">{fp.severity}</span>
                <span className="opacity-80">{fp.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2 px-4 pb-3 pt-2">
        <button
          onClick={onPrev}
          disabled={isFirst}
          className={`flex-1 py-2 text-xs font-mono rounded-lg border transition-colors ${
            isFirst
              ? "bg-zinc-900 border-zinc-800 text-zinc-700 cursor-not-allowed"
              : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          ← prev
        </button>
        <button
          onClick={isLast ? onExit : onNext}
          className="flex-1 py-2 text-xs font-mono rounded-lg border transition-colors"
          style={isLast
            ? { background: `${colors.solid}22`, borderColor: `${colors.solid}66`, color: colors.solid }
            : { background: "#27272a", borderColor: "#3f3f46", color: "#a1a1aa" }
          }
        >
          {isLast ? "✓ done" : "next →"}
        </button>
      </div>

      {/* Overlay sync indicator */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 text-xs text-zinc-700">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
            style={{ background: colors.solid }}
          />
          <span className="font-mono">overlay active on page</span>
        </div>
      </div>

    </div>
  )
}
