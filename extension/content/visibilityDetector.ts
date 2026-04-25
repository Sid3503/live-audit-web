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
  return { x: rect.left + window.scrollX, y: rect.top + window.scrollY }
}

/** True if the element is currently inside the visible browser viewport. */
export function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  return (
    rect.top >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.left >= 0 &&
    rect.right <= window.innerWidth
  )
}

