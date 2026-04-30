/**
 * Element parsing helpers: role/importance, ids, and selectors.
 */

export type ElementRole = "cta" | "nav" | "form" | "link" | "input" | "unknown"
export type ElementImportance = "primary" | "secondary" | "tertiary"

export interface Position {
  x: number
  y: number
}

export interface PageElement {
  id: string
  text: string
  tag: string
  role: ElementRole
  importance: ElementImportance
  href?: string
  path: string
  visible: boolean
  in_viewport: boolean
  position: Position
}

export interface PageMetadata {
  total_elements: number
  cta_count: number
  form_count: number
  nav_count: number
  extracted_at: string
}

export interface ExtractedPage {
  url: string
  title: string
  elements: PageElement[]
  metadata: PageMetadata
}

export const ROLE_SELECTOR_MAP: Record<ElementRole, string[]> = {
  // nav MUST come before cta — buttons inside nav/header are captured here first
  // so the seen-WeakSet dedup prevents them from being reclassified as CTAs
  nav: [
    "nav a",
    "nav button",
    "header nav a",           // only links inside an explicit <nav> within <header>
    "header nav button",
    "header [role='menuitem']",
    "[role='navigation'] a",
    "[role='navigation'] button",
    ".nav a",
    ".navbar a",
    ".navbar button",
    "[role='menubar'] a",
    "[role='menubar'] [role='menuitem']",
    "[role='menu'] a",
    "[role='menuitem']",
    "[role='tab']",
    "aside nav a",
  ],
  cta: [
    "button",
    "[role='button']",
    "input[type='submit']",
    "input[type='button']",
    "[data-cta]",
    ".cta",
    "button[type='submit']",
    "a.btn",
    "a.button",
    ".btn-primary",
    "summary",
    "[aria-haspopup='true']",
    // Radix UI primitives
    "[data-radix-collection-item]",
    // Headless UI
    "[data-headlessui-state]",
    // MUI / Ant Design
    "[class*='MuiButton']",
    "[class*='ant-btn']",
  ],
  form: [
    "form",
    "[role='form']",
    "[data-form]",
    "[data-testid*='form']",
    "[aria-label*='form']",
    // Headless/React form libraries that render a div wrapper
    "[data-radix-form]",
    "[data-component='form']",
  ],
  link: ["main a", "article a", "section a", "footer a"],
  input: ["input:not([type='hidden'])", "textarea", "select"],
  unknown: [],
}

export const CTA_TEXT_SIGNALS = new Set<string>([
  "get started",
  "sign up",
  "signup",
  "try free",
  "start free",
  "buy now",
  "purchase",
  "subscribe",
  "contact us",
  "book a demo",
  "request demo",
  "request a demo",
  "get demo",
  "start trial",
  "free trial",
  "get access",
  "get free",
  "start for free",
  "join free",
  "try for free",
  "for free",
])

// Auth actions — classified as cta role but tertiary importance so they never
// become journey roots or primary conversion signals.
export const AUTH_SIGNALS = new Set<string>([
  "log in",
  "login",
  "sign in",
  "signin",
  "log out",
  "logout",
  "sign out",
  "signout",
])

type RoleRule = {
  role: ElementRole
  when: (args: { el: Element; baseRole: ElementRole; text: string; tag: string; path: string }) => boolean
}

const NAV_CONTEXT_SELECTOR = "nav, header nav, [role='navigation'], [role='menubar'], [role='menu'], .navbar, .nav"

// Catches branded CTAs where words are inserted between signal tokens:
// "Get Notion free", "Start building today", "Request a product demo", etc.
const CTA_INTENT_RE =
  /\b(get|start|begin|join|create|try|claim|unlock|access|sign)\b.{0,30}\b(free|started|trial|access|going|account|today|now)\b|\b(request|book|schedule)\b.{0,20}\b(demo|call|tour)\b|\bsign[\s-]*up\b|\bget[\s-]*started\b/i

// Buttons matching these patterns are utility/UI controls — never conversion CTAs
const NON_CTA_BUTTON_RE =
  /^(cookie|privacy|terms|legal|manage cookies|accept|reject|decline|close|dismiss|cancel|back|menu|open .{0,30}(menu|dropdown|nav)|pause[:\s]|play[:\s]|stop\b|mute|volume|language|share|copy|filter|sort|previous|next|skip)/i

const ROLE_INFERENCE_RULES: RoleRule[] = [
  {
    // Nav context takes priority over button/CTA classification —
    // UNLESS the element text contains a conversion signal. Checks both exact
    // substring and regex to handle branded variants like "Get Notion free".
    role: "nav",
    when: ({ el, baseRole, path, text }) => {
      const lower = text.toLowerCase().trim()
      const hasCTASignal =
        [...CTA_TEXT_SIGNALS].some((s) => lower.includes(s)) || CTA_INTENT_RE.test(text)
      if (hasCTASignal) return false
      return baseRole === "nav" || path.includes("nav") || !!el.closest(NAV_CONTEXT_SELECTOR)
    },
  },
  {
    role: "cta",
    when: ({ tag, el, text }) => {
      const type = (el as HTMLInputElement).type?.toLowerCase?.() ?? ""
      const isButtonish = tag === "button" || (tag === "input" && ["submit", "button"].includes(type))
      const ariaRole = (el.getAttribute("role") || "").toLowerCase()
      const roleButtonish = ariaRole === "button"
      const lower = text.toLowerCase().trim()
      // Utility buttons (cookie banners, dropdowns, media controls) are never CTAs
      if ((isButtonish || roleButtonish) && NON_CTA_BUTTON_RE.test(text)) return false
      const byText =
        CTA_TEXT_SIGNALS.has(lower) ||
        AUTH_SIGNALS.has(lower) ||
        [...CTA_TEXT_SIGNALS].some((s) => lower.includes(s)) ||
        CTA_INTENT_RE.test(text)
      return isButtonish || roleButtonish || byText
    },
  },
  {
    role: "form",
    when: ({ baseRole, tag, el }) => baseRole === "form" || tag === "form" || (el.getAttribute("role") || "") === "form",
  },
  {
    role: "input",
    when: ({ baseRole, tag }) => baseRole === "input" || ["input", "textarea", "select"].includes(tag),
  },
  {
    role: "link",
    when: ({ baseRole, tag }) => baseRole === "link" || tag === "a",
  },
]

export function getCSSPath(el: Element, depth: number = 3): string {
  const parts: string[] = []
  let current: Element | null = el
  let d = 0
  while (current && current !== document.body && d < depth) {
    parts.unshift(current.tagName.toLowerCase())
    current = current.parentElement
    d++
  }
  return parts.join(" > ")
}

export function elementText(el: Element): string {
  const ariaLabel = el.getAttribute("aria-label")?.trim()
  if (ariaLabel) return ariaLabel.slice(0, 80)

  const title = el.getAttribute("title")?.trim()
  if (title && title.length < 60) return title.slice(0, 80)

  const alt = (el as HTMLImageElement).alt?.trim()
  if (alt && alt.length < 60) return alt.slice(0, 80)

  const raw = (el as HTMLElement).innerText?.trim() || (el as HTMLElement).textContent?.trim() || ""
  const firstLine = raw.split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) || raw
  return firstLine.slice(0, 80)
}

export function generateId(text: string, tag: string, index: number): string {
  const slug = text
    .slice(0, 18)
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toLowerCase()
  return `${tag}-${slug || "el"}-${index}`
}

export function detectImportance(text: string): ElementImportance {
  const normalized = text.toLowerCase().trim()
  if (AUTH_SIGNALS.has(normalized)) return "tertiary"
  for (const signal of AUTH_SIGNALS) {
    if (normalized.includes(signal)) return "tertiary"
  }
  if (CTA_TEXT_SIGNALS.has(normalized)) return "primary"
  for (const signal of CTA_TEXT_SIGNALS) {
    if (normalized.includes(signal)) return "primary"
  }
  // Regex catches branded variants: "Get Notion free", "Start building today", etc.
  if (CTA_INTENT_RE.test(text)) return "primary"
  return "secondary"
}

export function inferRole(args: {
  el: Element
  baseRole: ElementRole
  text: string
  tag: string
  path: string
}): ElementRole {
  const hit = ROLE_INFERENCE_RULES.find((r) => r.when(args))
  return hit?.role ?? args.baseRole
}

