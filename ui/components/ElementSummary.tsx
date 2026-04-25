"use client"

import { useState } from "react"
import Tooltip from "./Tooltip"

interface Metadata {
  total_elements: number
  cta_count: number
  form_count: number
  nav_count: number
}

interface NavSnapshot {
  primary_ctas: string[]
  nav_links: string[]
  all_cta_labels?: string[]
  form_labels?: string[]
}

interface Props {
  metadata: Metadata
  navSnapshot?: NavSnapshot
}

const STAT_TIPS: Record<string, string> = {
  Total: "Every interactive element scanned — buttons, links, and form fields. A very high count (200+) can mean a cluttered page.",
  CTAs:  "Call-to-Action buttons asking users to do something (e.g. 'Get Started', 'Buy Now'). Click to see what was detected. More than ~10 visible at once can overwhelm visitors.",
  Forms: "Input forms found — sign-up, contact, checkout. Click to see detected form actions. A signup page with 0 forms is a red flag.",
  Nav:   "Navigation menu links that move users between pages. Click to see them. High nav counts can dilute focus on key CTAs.",
}

const EXPANDABLE = new Set(["CTAs", "Forms", "Nav"])

function DetailPanel({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  if (items.length === 0) {
    return (
      <p className="text-[11px] text-gray-400 italic px-1">{empty}</p>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={i}
          className="text-[10px] text-gray-700 bg-white border border-gray-200 rounded-none px-2 py-1 leading-tight"
        >
          {item}
        </span>
      ))}
    </div>
  )
}

export default function ElementSummary({ metadata, navSnapshot }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const stats = [
    { label: "Total", value: metadata.total_elements },
    { label: "CTAs",  value: metadata.cta_count },
    { label: "Forms", value: metadata.form_count },
    { label: "Nav",   value: metadata.nav_count },
  ]

  function toggle(label: string) {
    if (!EXPANDABLE.has(label)) return
    setExpanded(prev => (prev === label ? null : label))
  }

  const expandedItems: Record<string, string[]> = {
    CTAs:  navSnapshot?.all_cta_labels ?? navSnapshot?.primary_ctas ?? [],
    Forms: navSnapshot?.form_labels ?? [],
    Nav:   navSnapshot?.nav_links ?? [],
  }

  const emptyMessages: Record<string, string> = {
    CTAs:  "No CTA labels captured in this audit.",
    Forms: "No form-style actions detected (sign up, subscribe, contact, etc.).",
    Nav:   "No navigation links captured.",
  }

  return (
    <div className="px-5 pb-4 mt-2">
      <div className="grid grid-cols-4 gap-2">
        {stats.map(({ label, value }) => {
          const isActive = expanded === label
          const isClickable = EXPANDABLE.has(label)
          return (
            <Tooltip key={label} text={STAT_TIPS[label]} width={220}>
              <button
                onClick={() => toggle(label)}
                className={`flex flex-col items-center w-full border shadow-sm rounded-none py-3 transition-all ${
                  isActive
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-100 border-gray-200 text-gray-900 hover:bg-gray-200 hover:shadow hover:-translate-y-0.5"
                } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className={`text-xl font-bold ${isActive ? "text-white" : "text-gray-900"}`}>{value}</span>
                <span className={`text-[11px] uppercase tracking-wider font-semibold mt-0.5 ${isActive ? "text-indigo-100" : "text-gray-600"}`}>
                  {label}{isClickable ? (isActive ? " ▲" : " ▼") : ""}
                </span>
              </button>
            </Tooltip>
          )
        })}
      </div>

      {expanded && EXPANDABLE.has(expanded) && (
        <div className="mt-2 bg-gray-50 border border-gray-200 rounded-none px-3 py-2.5 animate-fade-in">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {expanded === "CTAs" ? "All detected CTAs" : expanded === "Forms" ? "Form actions detected" : "Navigation links"}
            <span className="ml-2 font-normal text-gray-400 normal-case tracking-normal">
              {expandedItems[expanded].length} found
            </span>
          </p>
          <DetailPanel
            label={expanded}
            items={expandedItems[expanded]}
            empty={emptyMessages[expanded]}
          />
        </div>
      )}
    </div>
  )
}
