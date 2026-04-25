"use client"

/**
 * Animated loading state shown during pipeline execution.
 */
import { useEffect, useState } from "react"

const STAGES = [
  "Scanning live DOM snapshot...",
  "Building navigation graph...",
  "Detecting user journeys...",
  "Scoring friction points...",
  "Running AI audit...",
]

export default function StatusLoader() {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1))
    }, 1800)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full flex flex-col gap-6 p-6 animate-fade-in-up">
      {/* Progress bar */}
      <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-indigo-500 transition-all duration-[2000ms] ease-out"
          style={{ width: `${Math.min(100, (stage + 1) * 20)}%` }}
        />
      </div>

      {/* Header skeleton */}
      <div className="flex flex-col gap-2 pb-6 border-b border-gray-200">
        <div className="h-3 w-40 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-[pulse_1.5s_infinite] bg-[length:400%_100%] rounded-sm"></div>
        <div className="h-5 w-64 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-[pulse_1.5s_infinite] bg-[length:400%_100%] rounded-sm"></div>
      </div>

      {/* Ring placeholder */}
      <div className="flex justify-center py-4">
        <div className="w-20 h-20 rounded-full border-8 border-gray-200"></div>
      </div>

      {/* Text rows skeleton */}
      <div className="space-y-3 mt-2">
        <div className="h-3 w-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-[pulse_1.5s_infinite] bg-[length:400%_100%] rounded-sm"></div>
        <div className="h-3 w-[90%] bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-[pulse_1.5s_infinite] bg-[length:400%_100%] rounded-sm"></div>
        <div className="h-3 w-[70%] bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-[pulse_1.5s_infinite] bg-[length:400%_100%] rounded-sm"></div>
      </div>

      {/* Dynamic stage text */}
      <div className="mt-6 flex flex-col items-center">
        <span className="text-gray-900 font-medium text-sm tracking-wide bg-gray-100 py-2 px-6 rounded-full border border-gray-200 shadow-sm animate-pulse-smooth text-center">
          {STAGES[stage] ?? "Finalizing..."}
        </span>
      </div>
    </div>
  )
}
