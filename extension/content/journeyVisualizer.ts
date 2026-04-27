/**
 * Journey visualization overlay.
 * Injects a step-through UI onto the live page showing each journey element highlighted.
 * Completely self-contained — no external CSS, no framework dependencies.
 * Cleans up fully on exit.
 */

interface VisualizationStep {
  element_id: string
  label:      string
  action:     string
}

interface VisualizationJourney {
  type:        string
  steps:       VisualizationStep[]
  click_count: number
  confidence:  number
}

const JOURNEY_COLORS: Record<string, string> = {
  signup:   "#3b82f6",
  pricing:  "#8b5cf6",
  contact:  "#10b981",
  purchase: "#f59e0b",
  explore:  "#6b7280",
}

const OVERLAY_Z = 2147483640

let _cleanup: (() => void) | null = null


// --- Element resolution ---

function resolveElement(elementId: string): Element | null {
  // Strategy 1: data attribute stamped during extraction
  const byAttr = document.querySelector(`[data-uja-id="${elementId}"]`)
  if (byAttr) return byAttr

  // Strategy 2: parse ID → tag + text fragment + index
  const parts    = elementId.split("-")
  const tag      = parts[0]
  const indexStr = parts[parts.length - 1]
  const index    = parseInt(indexStr, 10)
  const textPart = parts.slice(1, -1).join(" ").slice(0, 15)

  const candidates = Array.from(document.querySelectorAll(tag)) as HTMLElement[]
  const textMatches = candidates.filter(el =>
    el.innerText?.toLowerCase().replace(/\s+/g, "-").includes(textPart)
  )
  if (!isNaN(index) && textMatches[index]) return textMatches[index]
  if (textMatches[0]) return textMatches[0]

  // Strategy 3: index-only fallback
  return (Array.from(document.querySelectorAll(tag))[index] as Element) ?? null
}


// --- Highlight management ---

interface HighlightHandle {
  remove: () => void
}

function highlightElement(
  el:         Element,
  stepIndex:  number,
  totalSteps: number,
  color:      string,
): HighlightHandle {
  const rect    = el.getBoundingClientRect()
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  const outline = document.createElement("div")
  outline.setAttribute("data-uja-overlay", "true")
  Object.assign(outline.style, {
    position:      "absolute",
    top:           `${rect.top + scrollY - 4}px`,
    left:          `${rect.left + scrollX - 4}px`,
    width:         `${rect.width + 8}px`,
    height:        `${rect.height + 8}px`,
    border:        `2.5px solid ${color}`,
    borderRadius:  "6px",
    boxShadow:     `0 0 0 3px ${color}22`,
    pointerEvents: "none",
    zIndex:        String(OVERLAY_Z),
    transition:    "all 0.2s ease",
    boxSizing:     "border-box",
  })

  const badge = document.createElement("div")
  badge.setAttribute("data-uja-overlay", "true")
  badge.textContent = `${stepIndex + 1} / ${totalSteps}`
  Object.assign(badge.style, {
    position:      "absolute",
    top:           `${rect.top + scrollY - 26}px`,
    left:          `${rect.left + scrollX}px`,
    background:    color,
    color:         "#ffffff",
    fontSize:      "11px",
    fontFamily:    "system-ui, sans-serif",
    fontWeight:    "600",
    padding:       "2px 8px",
    borderRadius:  "4px",
    pointerEvents: "none",
    zIndex:        String(OVERLAY_Z + 1),
    whiteSpace:    "nowrap",
    letterSpacing: "0.02em",
  })

  document.body.appendChild(outline)
  document.body.appendChild(badge)

  return { remove: () => { outline.remove(); badge.remove() } }
}


// --- SVG arrow between two elements ---

function drawArrow(fromEl: Element, toEl: Element, color: string): SVGSVGElement | null {
  const fromRect = fromEl.getBoundingClientRect()
  const toRect   = toEl.getBoundingClientRect()
  const scrollX  = window.scrollX
  const scrollY  = window.scrollY
  const viewH    = window.innerHeight

  // Only draw if both are currently visible in the viewport
  if (fromRect.bottom < 0 || fromRect.top > viewH) return null
  if (toRect.bottom < 0   || toRect.top > viewH)   return null

  const x1 = fromRect.left + scrollX + fromRect.width / 2
  const y1 = fromRect.bottom + scrollY
  const x2 = toRect.left + scrollX + toRect.width / 2
  const y2 = toRect.top + scrollY

  const svgNS  = "http://www.w3.org/2000/svg"
  const svg    = document.createElementNS(svgNS, "svg") as SVGSVGElement
  svg.setAttribute("data-uja-overlay", "true")

  const minX   = Math.min(x1, x2) - 20
  const minY   = Math.min(y1, y2) - 20
  const width  = Math.abs(x2 - x1) + 40
  const height = Math.abs(y2 - y1) + 40

  Object.assign(svg.style, {
    position:      "absolute",
    top:           `${minY}px`,
    left:          `${minX}px`,
    width:         `${width}px`,
    height:        `${height}px`,
    pointerEvents: "none",
    zIndex:        String(OVERLAY_Z - 1),
    overflow:      "visible",
  })

  const markerId = `uja-arrow-${Date.now()}`
  const defs     = document.createElementNS(svgNS, "defs")
  const marker   = document.createElementNS(svgNS, "marker")
  marker.setAttribute("id",           markerId)
  marker.setAttribute("viewBox",      "0 0 10 10")
  marker.setAttribute("refX",         "8")
  marker.setAttribute("refY",         "5")
  marker.setAttribute("markerWidth",  "6")
  marker.setAttribute("markerHeight", "6")
  marker.setAttribute("orient",       "auto-start-reverse")

  const arrowPath = document.createElementNS(svgNS, "path")
  arrowPath.setAttribute("d",             "M2 1L8 5L2 9")
  arrowPath.setAttribute("fill",          "none")
  arrowPath.setAttribute("stroke",        color)
  arrowPath.setAttribute("stroke-width",  "1.5")
  arrowPath.setAttribute("stroke-linecap","round")
  marker.appendChild(arrowPath)
  defs.appendChild(marker)
  svg.appendChild(defs)

  const midY   = (y1 + y2) / 2
  const pathEl = document.createElementNS(svgNS, "path")
  const d      = `M ${x1 - minX} ${y1 - minY} C ${x1 - minX} ${midY - minY}, ${x2 - minX} ${midY - minY}, ${x2 - minX} ${y2 - minY}`
  pathEl.setAttribute("d",               d)
  pathEl.setAttribute("fill",            "none")
  pathEl.setAttribute("stroke",          color)
  pathEl.setAttribute("stroke-width",    "2")
  pathEl.setAttribute("stroke-dasharray","6 3")
  pathEl.setAttribute("marker-end",      `url(#${markerId})`)
  svg.appendChild(pathEl)

  document.body.appendChild(svg)
  return svg
}


// --- Control bar ---

function styleBtn(btn: HTMLButtonElement, disabled: boolean, color = "#4b5563"): void {
  Object.assign(btn.style, {
    background:   disabled ? "#1a1a2e" : `${color}22`,
    border:       `1px solid ${disabled ? "#1a1a2e" : color + "44"}`,
    color:        disabled ? "#374151" : color,
    fontSize:     "13px",
    fontFamily:   "monospace",
    padding:      "5px 12px",
    borderRadius: "6px",
    cursor:       disabled ? "not-allowed" : "pointer",
    transition:   "all 0.15s",
  })
  btn.disabled = disabled
}

function createControlBar(
  journey:     VisualizationJourney,
  stepIndex:   number,
  totalSteps:  number,
  onPrev:      () => void,
  onNext:      () => void,
  onExit:      () => void,
): HTMLElement {
  const color = JOURNEY_COLORS[journey.type] ?? JOURNEY_COLORS.explore
  const step  = journey.steps[stepIndex]

  const bar = document.createElement("div")
  bar.id    = "uja-control-bar"
  bar.setAttribute("data-uja-overlay", "true")
  Object.assign(bar.style, {
    position:   "fixed",
    bottom:     "24px",
    left:       "50%",
    transform:  "translateX(-50%)",
    background: "#0f0f1a",
    border:     `1px solid ${color}44`,
    borderRadius: "12px",
    padding:    "10px 16px",
    display:    "flex",
    alignItems: "center",
    gap:        "12px",
    zIndex:     String(OVERLAY_Z + 10),
    boxShadow:  "0 8px 32px rgba(0,0,0,0.4)",
    fontFamily: "system-ui, sans-serif",
    userSelect: "none",
    minWidth:   "320px",
  })

  const typeBadge = document.createElement("span")
  typeBadge.textContent = journey.type
  Object.assign(typeBadge.style, {
    fontSize:      "10px",
    fontFamily:    "monospace",
    background:    `${color}22`,
    color:         color,
    padding:       "2px 8px",
    borderRadius:  "4px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  })

  const stepLabel = document.createElement("span")
  stepLabel.textContent = step ? step.label.slice(0, 30) : "—"
  Object.assign(stepLabel.style, {
    flex:         "1",
    fontSize:     "13px",
    color:        "#e2e8f0",
    overflow:     "hidden",
    whiteSpace:   "nowrap",
    textOverflow: "ellipsis",
  })

  const counter = document.createElement("span")
  counter.textContent = `${stepIndex + 1} / ${totalSteps}`
  Object.assign(counter.style, {
    fontSize:   "11px",
    fontFamily: "monospace",
    color:      "#4b5563",
  })

  const prevBtn = document.createElement("button")
  prevBtn.textContent = "←"
  styleBtn(prevBtn, stepIndex === 0)
  prevBtn.onclick = onPrev

  const nextBtn = document.createElement("button")
  const isLast  = stepIndex === totalSteps - 1
  nextBtn.textContent = isLast ? "✓ Done" : "→"
  styleBtn(nextBtn, false, color)
  nextBtn.onclick = isLast ? onExit : onNext

  const exitBtn = document.createElement("button")
  exitBtn.textContent = "✕"
  Object.assign(exitBtn.style, {
    background:   "transparent",
    border:       "none",
    color:        "#4b5563",
    fontSize:     "14px",
    cursor:       "pointer",
    padding:      "4px 6px",
    borderRadius: "4px",
    lineHeight:   "1",
  })
  exitBtn.onclick = onExit

  bar.append(typeBadge, stepLabel, counter, prevBtn, nextBtn, exitBtn)
  return bar
}


// --- Utilities ---

function scrollToElement(el: Element): Promise<void> {
  return new Promise(resolve => {
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setTimeout(resolve, 400)
  })
}

function clearAllOverlays(): void {
  document.querySelectorAll("[data-uja-overlay]").forEach(el => el.remove())
}


// --- Main controller ---

async function _startAt(journey: VisualizationJourney, initialStep: number): Promise<void> {
  const color      = JOURNEY_COLORS[journey.type] ?? JOURNEY_COLORS.explore
  const steps      = journey.steps
  const totalSteps = steps.length

  if (totalSteps === 0) return

  let currentStep      = Math.min(Math.max(0, initialStep), totalSteps - 1)
  let currentHighlight: HighlightHandle | null = null
  let currentArrow:     SVGSVGElement   | null = null
  let controlBar:       HTMLElement     | null = null

  async function renderStep(index: number): Promise<void> {
    currentHighlight?.remove()
    currentArrow?.remove()

    const step = steps[index]
    if (!step) return

    const el = resolveElement(step.element_id)
    if (!el) {
      console.warn(`[UJA Visualizer] Could not resolve element: ${step.element_id}`)
      return
    }

    await scrollToElement(el)
    currentHighlight = highlightElement(el, index, totalSteps, color)

    if (index > 0) {
      const prevEl = resolveElement(steps[index - 1].element_id)
      if (prevEl) currentArrow = drawArrow(prevEl, el, color)
    }

    controlBar?.remove()
    controlBar = createControlBar(
      journey,
      index,
      totalSteps,
      () => { if (currentStep > 0) { currentStep--; renderStep(currentStep) } },
      () => { if (currentStep < totalSteps - 1) { currentStep++; renderStep(currentStep) } },
      stopVisualization,
    )
    document.body.appendChild(controlBar)
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") { stopVisualization(); return }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      if (currentStep < totalSteps - 1) { currentStep++; renderStep(currentStep) }
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      if (currentStep > 0) { currentStep--; renderStep(currentStep) }
    }
  }
  document.addEventListener("keydown", onKeyDown)

  _cleanup = () => {
    currentHighlight?.remove()
    currentArrow?.remove()
    controlBar?.remove()
    clearAllOverlays()
    document.removeEventListener("keydown", onKeyDown)
    _cleanup = null
  }

  await renderStep(currentStep)
}

export async function startVisualization(journey: VisualizationJourney): Promise<void> {
  stopVisualization()
  await _startAt(journey, 0)
}

export async function jumpToStep(journey: VisualizationJourney, stepIndex: number): Promise<void> {
  stopVisualization()
  await new Promise<void>(r => setTimeout(r, 50))
  await _startAt(journey, stepIndex)
}

export function stopVisualization(): void {
  _cleanup?.()
  clearAllOverlays()
}
