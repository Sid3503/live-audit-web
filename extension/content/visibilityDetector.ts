/**
 * Visibility detection helpers for DOM extraction.
 */

export function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  const style = window.getComputedStyle(el)
  const hidden =
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  return rect.width > 0 && rect.height > 0 && !hidden
}

export function getViewportPosition(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return { x: rect.left, y: rect.top }
}

