/**
 * Background service worker: receives extracted page, calls Python API, stores result.
 * All network calls happen here — never in content scripts.
 */

import { routeMessage } from "./messageRouter"

const API_URL = (import.meta as any).env?.VITE_UJA_API_URL ?? "http://localhost:8000/api/v1/audit"
const DEEP_AUDIT_URL = API_URL.replace(/\/audit$/, "") + "/deep-audit"

async function callAuditAPI(payload: unknown): Promise<unknown> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`API error ${response.status}`)
  return response.json()
}

async function captureScreenshot(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.windowId) return null
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" })
  } catch {
    return null
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  return routeMessage(
    message,
    {
      EXTRACTED: async (payload: unknown) => {
        await chrome.storage.local.set({ extracted_page: payload, status: "ready" })
      },
      TRIGGER: async () => {
        // Always re-extract from the live DOM at audit time so the graph/journeys/score
        // match the screenshot and are not stale from the initial page load.
        let extracted_page: unknown = null
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
          if (tab?.id) {
            extracted_page = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_NOW" })
          }
        } catch {
          // Content script unreachable (chrome:// pages, uninjected frames) — fall back to cache
        }

        if (!extracted_page) {
          const stored = await chrome.storage.local.get(["extracted_page"])
          extracted_page = stored.extracted_page
        }

        if (!extracted_page) {
          await chrome.storage.local.set({ status: "error", error: "No page data" })
          return
        }

        // Persist fresh snapshot so the chat and other consumers see the same data
        await chrome.storage.local.set({ extracted_page, status: "auditing" })
        try {
          const screenshot = await captureScreenshot()
          const report = await callAuditAPI({ page: extracted_page, screenshot })
          await chrome.storage.local.set({ report, status: "done" })
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Unknown error"
          await chrome.storage.local.set({ status: "error", error: msg })
        }
      },
      GET_REPORT: async (sr) => {
        const result = await chrome.storage.local.get(["report", "status", "error"])
        sr(result)
      },
      DEEP_AUDIT: async (url: string, maxPages: number) => {
        await chrome.storage.local.set({ deep_status: "running", crawl_report: null })
        try {
          const res = await fetch(DEEP_AUDIT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, max_pages: maxPages }),
          })
          if (!res.ok) throw new Error(`API error ${res.status}`)
          const crawl = await res.json()
          await chrome.storage.local.set({ crawl_report: crawl, deep_status: "done" })
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Deep audit failed"
          await chrome.storage.local.set({ deep_status: "error", deep_error: msg })
        }
      },
    },
    sendResponse
  )
})

