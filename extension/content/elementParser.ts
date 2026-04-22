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
  nav: [
    "nav a",
    "header a",
    "[role='navigation'] a",
    ".nav a",
    ".navbar a",
    "[role='menubar'] a",
    "[role='menu'] a",
    "[role='menuitem']",
    "[role='tab']",
    "aside nav a",
  ],
  form: ["form", "[role='form']"],
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
  "log in",
  "sign in",
  "login",
  "get free",
  "start for free",
  "join free",
])

type RoleRule = {
  role: ElementRole
  when: (args: { el: Element; baseRole: ElementRole; text: string; tag: string; path: string }) => boolean
}

const ROLE_INFERENCE_RULES: RoleRule[] = [
  {
    role: "cta",
    when: ({ tag, el, text }) => {
      const type = (el as HTMLInputElement).type?.toLowerCase?.() ?? ""
      const isButtonish = ["button"].includes(tag) || (tag === "input" && ["submit", "button"].includes(type))
      const ariaRole = (el.getAttribute("role") || "").toLowerCase()
      const roleButtonish = ariaRole === "button"
      const byText = CTA_TEXT_SIGNALS.has(text.toLowerCase().trim())
      return isButtonish || roleButtonish || byText
    },
  },
  {
    role: "nav",
    when: ({ baseRole, path }) => baseRole === "nav" || path.includes("nav"),
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
  if (CTA_TEXT_SIGNALS.has(normalized)) return "primary"
  for (const signal of CTA_TEXT_SIGNALS) {
    if (normalized.includes(signal)) return "primary"
  }
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

