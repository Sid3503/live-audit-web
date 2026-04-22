"use client"

/**
 * Animated SVG score ring — 0 to score fill on mount.
 */
import { useEffect, useRef, useState } from "react"
import Tooltip from "./Tooltip"

interface Props {
  score: number
  label: string
}

const LABEL_COLORS: Record<string, string> = {
  Excellent: "bg-green-100 text-green-600 border border-green-200",
  Good: "bg-blue-100 text-blue-600 border border-blue-200",
  "Needs Work": "bg-yellow-100 text-yellow-600 border border-yellow-200",
  Poor: "bg-red-100 text-red-600 border border-red-200",
}

export default function ScoreRing({ score, label }: Props) {
  const circleRef = useRef<SVGCircleElement>(null)
  const [displayedScore, setDisplayedScore] = useState(0)
  const r = 40
  const circ = 2 * Math.PI * r

  useEffect(() => {
    let start = 0
    const end = Math.floor(score)
    const timer = setInterval(() => {
      start += Math.ceil(end / 30)
      if (start >= end) {
        start = end
        clearInterval(timer)
      }
      setDisplayedScore(start)
    }, 20)

    if (circleRef.current) {
      const offset = circ - (score / 100) * circ
      circleRef.current.style.strokeDashoffset = String(offset)
    }

    return () => clearInterval(timer)
  }, [score, circ])

  return (
    <div className="flex flex-col items-center gap-3 py-6 animate-scale-in">
      <Tooltip
        text="UX score out of 100. 90–100 = Excellent · 75–89 = Good · 50–74 = Needs Work · Below 50 = Poor. The AI can adjust this score up if it overrules false-positive rule violations."
       
        width={240}
      >
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          ref={circleRef}
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#6366f1"
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={circ}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
        <text x="50" y="55" textAnchor="middle" fontSize="20" fontWeight="600" fill="#1f2937">
          {displayedScore}
        </text>
      </svg>
      </Tooltip>
      <span className={`px-3 py-1 text-[11px] uppercase tracking-wider font-semibold rounded-full ${LABEL_COLORS[label] ?? "bg-gray-100 text-gray-600"}`}>
        {label}
      </span>
    </div>
  )
}
