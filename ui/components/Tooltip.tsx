"use client"

import { ReactNode, useRef, useState } from "react"

interface Props {
  text: string
  children: ReactNode
  width?: number  // px — default 200
}

/**
 * JS-positioned tooltip: uses getBoundingClientRect + position:fixed so it
 * never clips inside a constrained popup container regardless of trigger position.
 * Automatically clamps to popup bounds on both sides.
 */
export default function Tooltip({ text, children, width = 200 }: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [style, setStyle] = useState<React.CSSProperties | null>(null)

  function show() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popupW = window.innerWidth

    // Open below trigger, clamp horizontally
    let left = rect.left
    if (left + width > popupW - 8) left = popupW - width - 8
    if (left < 8) left = 8

    setStyle({ top: rect.bottom + 6, left, width })
  }

  function hide() {
    setStyle(null)
  }

  return (
    <span
      ref={triggerRef}
      className="inline-flex items-center"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {style && (
        <span
          style={{ position: "fixed", ...style }}
          className="bg-gray-900 text-white text-[11px] leading-snug px-2.5 py-2 rounded-lg z-[9999] text-left shadow-xl whitespace-normal pointer-events-none animate-fade-in"
        >
          {text}
        </span>
      )}
    </span>
  )
}
