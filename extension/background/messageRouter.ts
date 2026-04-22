/**
 * Message router: validates message shapes and dispatches handlers.
 */

export type ExtractedMessage = { type: "EXTRACTED"; payload: unknown }
export type TriggerMessage = { type: "TRIGGER" }
export type GetReportMessage = { type: "GET_REPORT" }
export type DeepAuditMessage = { type: "DEEP_AUDIT"; url: string; maxPages?: number }

export type MessageType = ExtractedMessage | TriggerMessage | GetReportMessage | DeepAuditMessage

type HandlerResult = void | Promise<void>

export type HandlerMap = {
  EXTRACTED: (payload: unknown) => HandlerResult
  TRIGGER: () => HandlerResult
  GET_REPORT: (sendResponse: (response: unknown) => void) => HandlerResult
  DEEP_AUDIT: (url: string, maxPages: number) => HandlerResult
}

export function routeMessage(
  message: unknown,
  handlers: HandlerMap,
  sendResponse: (response: unknown) => void
): boolean {
  const m = message as Partial<MessageType> | null
  const type = typeof m?.type === "string" ? m.type : ""

  const dispatch: Record<string, () => HandlerResult> = {
    EXTRACTED: () => handlers.EXTRACTED((m as ExtractedMessage).payload),
    TRIGGER: () => handlers.TRIGGER(),
    GET_REPORT: () => handlers.GET_REPORT(sendResponse),
    DEEP_AUDIT: () => {
      const msg = m as DeepAuditMessage
      return handlers.DEEP_AUDIT(msg.url, msg.maxPages ?? 10)
    },
  }

  const fn = dispatch[type]
  if (!fn) {
    sendResponse({ ok: false, error: "Unknown message type" })
    return false
  }

  const result = fn()
  if (result instanceof Promise) {
    result
      .then(() => sendResponse({ ok: true }))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Unknown error"
        sendResponse({ ok: false, error: msg })
      })
    return true
  }

  sendResponse({ ok: true })
  return true
}

