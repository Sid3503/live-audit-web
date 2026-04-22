"use client"

import Tooltip from "./Tooltip"

interface Metadata {
  total_elements: number
  cta_count: number
  form_count: number
  nav_count: number
}

interface Props {
  metadata: Metadata
}

const STAT_TIPS: Record<string, string> = {
  Total: "Every interactive element scanned — buttons, links, and form fields. A very high count (200+) can mean a cluttered page.",
  CTAs:  "Call-to-Action buttons — elements asking the user to do something (e.g. 'Get Started', 'Buy Now'). More than ~10 visible CTAs at once can overwhelm visitors.",
  Forms: "Input forms found — sign-up, contact, checkout. A signup page with 0 forms is a red flag.",
  Nav:   "Navigation menu links — items that move users between pages. High nav counts can dilute focus on key CTAs.",
}

export default function ElementSummary({ metadata }: Props) {
  const stats = [
    { label: "Total", value: metadata.total_elements },
    { label: "CTAs",  value: metadata.cta_count },
    { label: "Forms", value: metadata.form_count },
    { label: "Nav",   value: metadata.nav_count },
  ]
  return (
    <div className="grid grid-cols-4 gap-2 px-5 pb-4 mt-2">
      {stats.map(({ label, value }) => (
        <Tooltip key={label} text={STAT_TIPS[label]} width={220}>
          <div className="flex flex-col items-center w-full bg-gray-100 border border-gray-200 shadow-sm rounded-none py-3 transform transition-all hover:bg-gray-200 hover:shadow hover:-translate-y-0.5 cursor-default">
            <span className="text-xl font-bold text-gray-900">{value}</span>
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-600 mt-0.5">{label}</span>
          </div>
        </Tooltip>
      ))}
    </div>
  )
}
