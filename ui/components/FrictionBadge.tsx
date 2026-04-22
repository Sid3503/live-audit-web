"use client"

import Tooltip from "./Tooltip"

interface FrictionPoint {
  type: string
  description: string
  severity: string
}

interface Props {
  point: FrictionPoint
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-600 border-red-200",
  high:     "bg-orange-100 text-orange-600 border-orange-200",
  medium:   "bg-yellow-100 text-yellow-600 border-yellow-200",
  low:      "bg-gray-100 text-gray-600 border-gray-200",
}

const SEVERITY_TIPS: Record<string, string> = {
  critical: "Blocks the user entirely — they cannot complete this journey without hitting this issue. Fix immediately.",
  high:     "Significantly hurts conversion. Most users will drop off or get confused here.",
  medium:   "Causes friction but users can still push through. Worth fixing before launch.",
  low:      "Minor annoyance — noticeable but unlikely to cause drop-off. Low priority.",
}

export default function FrictionBadge({ point }: Props) {
  return (
    <div
      className={`flex items-start gap-2.5 text-sm border rounded-none px-3 py-2 shadow-sm ${
        SEVERITY_STYLES[point.severity] ?? SEVERITY_STYLES.low
      }`}
    >
      <Tooltip text={SEVERITY_TIPS[point.severity] ?? "Friction point detected on this journey."} width={220}>
        <span className="font-semibold text-[10px] uppercase tracking-wider shrink-0 mt-0.5 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-none cursor-default">
          {point.severity}
        </span>
      </Tooltip>
      <span className="text-current font-medium leading-snug">{point.description}</span>
    </div>
  )
}
