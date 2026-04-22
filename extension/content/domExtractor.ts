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
import { getViewportPosition, isVisible } from "./visibilityDetector"

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

      elements.push({
        id: generateId(text, tag, indexRef.value++),
        text,
        tag,
        role: finalRole,
        importance: detectImportance(text),
        href: (el as HTMLAnchorElement).href || undefined,
        path,
        visible: isVisible(el),
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

// Initial extraction
const page = extractPage()
chrome.runtime.sendMessage({ type: "EXTRACTED", payload: page })

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
