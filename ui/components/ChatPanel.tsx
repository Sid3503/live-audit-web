"use client"

/**
 * Q&A panel — lets users ask UX questions about the audit result.
 * Calls the backend /chat endpoint directly with the stored report as context.
 */
import { useState, useRef, useEffect } from "react"

interface Message {
  role: "user" | "assistant"
  text: string
}

interface Props {
  report: Record<string, unknown>
  crawl?: Record<string, unknown> | null
}

const CHAT_URL =
  process.env.NEXT_PUBLIC_UJA_CHAT_URL ?? "http://localhost:8000/api/v1/chat"

const DEFAULT_QUESTIONS = [
  "How easy is it to sign up?",
  "What's the shortest path to pricing?",
  "Where might users drop off?",
]

export default function ChatPanel({ report, crawl }: Props) {
  const [messages, setMessages] = useState<Message[]>([])

  const suggestedQuestions =
    Array.isArray(report.suggested_questions) && report.suggested_questions.length > 0
      ? (report.suggested_questions as string[])
      : DEFAULT_QUESTIONS

  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function send(question: string): Promise<void> {
    const q = question.trim()
    if (!q || loading) return

    setInput("")
    setError("")
    setMessages((prev) => [...prev, { role: "user", text: q }])
    setLoading(true)

    try {
      const history = messages.map((m) => ({ role: m.role, text: m.text }))
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, report, history, crawl_data: crawl ?? null }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()
      setMessages((prev) => [...prev, { role: "assistant", text: data.answer }])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Request failed"
      setError(msg)
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") send(input)
  }

  return (
    <div className="px-5 mt-2 border-t border-gray-200 pt-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ask a question</p>
        {crawl && (
          <span className="text-[10px] font-medium text-indigo-500 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
            + site context
          </span>
        )}
      </div>

      {messages.length === 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="text-left text-sm text-gray-600 bg-gray-100 border border-gray-200 shadow-sm hover:border-gray-300 hover:text-gray-900 hover:translate-x-1 rounded-xl px-4 py-2.5 transition-all text-xs"
            >
              <span className="opacity-60 mr-2 text-indigo-600">✨</span> {q}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="space-y-3 mb-4 max-h-[220px] overflow-y-auto px-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`text-[13px] rounded-none px-4 py-2.5 shadow-sm ${
                m.role === "user"
                  ? "bg-indigo-600 border border-indigo-500 text-white ml-8 rounded-none"
                  : "bg-gray-100 border border-gray-200 text-gray-600 mr-8 rounded-none"
              }`}
            >
              {m.text}
            </div>
          ))}
          {loading && (
            <div className="bg-gray-100 border border-gray-200 text-gray-500 text-xs rounded-none px-4 py-2.5 mr-12 animate-pulse-smooth shadow-sm w-fit">
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}

      <div className="flex gap-2 relative">
        <input
          id="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this page's UX…"
          disabled={loading}
          className="flex-1 bg-gray-100 border border-gray-200 shadow-inner rounded-xl pl-4 pr-12 py-3 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 transition-all"
        />
        <button
          id="chat-send-btn"
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-all shadow-sm flex items-center justify-center transform active:scale-[0.95]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
