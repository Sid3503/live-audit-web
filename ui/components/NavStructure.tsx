"use client"

/**
 * Surfaces the extracted navigation structure — satisfies the "intermediate results" requirement.
 * Shows primary CTAs and nav links detected on the page before journey analysis.
 */
import { useState } from "react"
import Tooltip from "./Tooltip"

interface NavSnapshot {
  primary_ctas: string[]
  nav_links: string[]
}

interface Props {
  snapshot: NavSnapshot
}

export default function NavStructure({ snapshot }: Props) {
  const [expanded, setExpanded] = useState(false)

  const hasCtas = snapshot.primary_ctas.length > 0
  const hasNav = snapshot.nav_links.length > 0
  if (!hasCtas && !hasNav) return null

  return (
    <div className="mx-5 mb-4 mt-2">
      <button
        id="nav-structure-toggle"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-[11px] font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-600 transition-colors py-2 bg-gray-100 border border-gray-200 rounded-xl px-4"
      >
        <span>Page Structure</span>
        <span className="text-gray-600">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-2 bg-gray-100 border border-gray-200 rounded-none overflow-hidden shadow-sm animate-fade-in-up">
          {hasCtas && (
            <div className="px-5 py-4 border-b border-gray-200">
              <Tooltip text="The most prominent action buttons on this page — elements the auditor classified as high-priority CTAs. These are what the page is 'pushing' users towards." width={230}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 cursor-default">Primary CTAs</p>
              </Tooltip>
              <div className="flex flex-wrap gap-2">
                {snapshot.primary_ctas.map((cta, i) => (
                  <span
                    key={i}
                    className="text-xs font-medium bg-indigo-100 text-indigo-600 px-3 py-1 rounded-none border border-indigo-200"
                  >
                    {cta}
                  </span>
                ))}
              </div>
            </div>
          )}
          {hasNav && (
            <div className="px-5 py-4">
              <Tooltip text="Menu and nav links found on the page. If nav links greatly outnumber CTAs, users might be pulled away to browse instead of converting." width={230}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 cursor-default">Navigation Links</p>
              </Tooltip>
              <div className="flex flex-wrap gap-2">
                {snapshot.nav_links.map((link, i) => (
                  <span
                    key={i}
                    className="text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-none border border-gray-200"
                  >
                    {link}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
