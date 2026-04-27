/**
 * Content script: extracts interactive DOM elements and posts to background.
 * Traverses shadow DOM for web components, and re-extracts on SPA navigation.
 * Pure extraction — no network calls, no side effects beyond chrome.runtime.sendMessage.
 */

import {
  ExtractedPage,
  PageElement,
  ElementRole,
  ROLE_SELECTOR_MAP,
  detectImportance,
  elementText,
  generateId,
  getCSSPath,
  inferRole,
} from "./elementParser"
import { getViewportPosition, isInViewport, isVisible } from "./visibilityDetector"
import { startVisualization, stopVisualization, jumpToStep } from "./journeyVisualizer"

function collectFromRoot(
  root: Document | ShadowRoot,
  seen: WeakSet<Element>,
  elements: PageElement[],
  indexRef: { value: number },
): void {
  for (const [role, selectors] of Object.entries(ROLE_SELECTOR_MAP) as [ElementRole, string[]][]) {
    if (selectors.length === 0) continue
    let matches: NodeListOf<Element>
    try {
      matches = root.querySelectorAll(selectors.join(", "))
    } catch {
      continue
    }
    matches.forEach((el) => {
      if (seen.has(el)) return
      seen.add(el)

      const text = elementText(el)
      const path = getCSSPath(el)
      const position = getViewportPosition(el)
      const tag = el.tagName.toLowerCase()
      const finalRole = inferRole({ el, baseRole: role, text, tag, path })

      const id = generateId(text, tag, indexRef.value++)
      ;(el as HTMLElement).dataset.ujaId = id

      elements.push({
        id,
        text,
        tag,
        role: finalRole,
        importance: detectImportance(text),
        href: (el as HTMLAnchorElement).href || undefined,
        path,
        visible: isVisible(el),
        in_viewport: isInViewport(el),
        position,
      })

      // Recurse into shadow root for web components (Lit, Stencil, custom elements)
      if (el.shadowRoot) {
        collectFromRoot(el.shadowRoot, seen, elements, indexRef)
      }
    })
  }
}

function collectElements(): PageElement[] {
  const seen = new WeakSet<Element>()
  const elements: PageElement[] = []
  const indexRef = { value: 0 }
  collectFromRoot(document, seen, elements, indexRef)
  return elements
}

function extractPage(): ExtractedPage {
  const all = collectElements()
  const visible = all.filter((e) => e.visible)

  return {
    url: location.href,
    title: document.title,
    elements: visible,
    metadata: {
      total_elements: visible.length,
      cta_count: visible.filter((e) => e.role === "cta").length,
      form_count: visible.filter((e) => e.role === "form").length,
      nav_count: visible.filter((e) => e.role === "nav").length,
      extracted_at: new Date().toISOString(),
    },
  }
}

/**
 * Scroll through the full page so Intersection Observer-gated elements are
 * rendered into the DOM before we extract. Runs once at initial load only.
 * EXTRACT_NOW skips this — by then lazy content is already in the DOM.
 */
async function revealLazyContent(): Promise<void> {
  const saved = window.scrollY
  const totalH = document.documentElement.scrollHeight
  const vpH = window.innerHeight
  if (totalH <= vpH) return          // single-screen page — nothing to reveal

  const steps = Math.ceil(totalH / vpH)
  for (let i = 1; i <= steps; i++) {
    window.scrollTo(0, i * vpH)
    await new Promise<void>((r) => setTimeout(r, 120))
  }
  window.scrollTo(0, saved)          // restore original position
  await new Promise<void>((r) => setTimeout(r, 250))  // let DOM settle
}

// Initial extraction — scroll-reveal first so lazy sections are in the DOM
;(async () => {
  await revealLazyContent()
  const page = extractPage()
  chrome.runtime.sendMessage({ type: "EXTRACTED", payload: page })
})()

// SPA re-extraction: debounced, triggers on back/forward navigation and significant DOM changes
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function scheduleReExtract(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const updated = extractPage()
    chrome.runtime.sendMessage({ type: "EXTRACTED", payload: updated })
    debounceTimer = null
  }, 1000)
}

// History API navigation (React Router, Next.js, Vue Router)
window.addEventListener("popstate", scheduleReExtract)

// Title changes are a reliable SPA route change signal
const titleEl = document.querySelector("head > title")
if (titleEl) {
  new MutationObserver(scheduleReExtract).observe(titleEl, {
    childList: true,
    characterData: true,
    subtree: true,
  })
}

// Large content replacements (e.g. full page content swap without URL change)
new MutationObserver((mutations) => {
  const nodesAdded = mutations.reduce((n, m) => n + m.addedNodes.length, 0)
  if (nodesAdded > 15) scheduleReExtract()
}).observe(document.body, { childList: true, subtree: false })

// On-demand re-extraction: service worker sends EXTRACT_NOW at audit trigger time
// so the audit always operates on a fresh DOM snapshot, not a stale cached one.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXTRACT_NOW") {
    sendResponse(extractPage())
    return
  }

  if (message.type === "VISUALIZE") {
    startVisualization(message.journey)
    sendResponse({ ok: true })
    return
  }

  if (message.type === "STOP_VISUALIZATION") {
    stopVisualization()
    sendResponse({ ok: true })
    return
  }

  if (message.type === "VISUALIZE_STEP") {
    jumpToStep(message.journey, message.step)
    sendResponse({ ok: true })
  }
})
