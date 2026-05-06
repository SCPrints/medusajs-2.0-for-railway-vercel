import { NextRequest, NextResponse } from "next/server"
import { CHATBOT_SYSTEM_PROMPT } from "@lib/chatbot/system-prompt"

export const runtime = "nodejs"

type ChatMessage = { role: "user" | "assistant"; content: string }

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const MODEL = "claude-haiku-4-5-20251001"
const MAX_HISTORY = 20
const MAX_USER_CHARS = 4000

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "unavailable", message: "Chat is currently unavailable. Please email info@scprints.com.au." },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  const messages = sanitiseMessages((body as any)?.messages)
  if (messages.length === 0) {
    return NextResponse.json({ error: "no_messages" }, { status: 400 })
  }

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: [
          {
            type: "text",
            text: CHATBOT_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      console.error("Chatbot upstream error", response.status, detail.slice(0, 500))
      return NextResponse.json(
        { error: "upstream_error", message: "Chat is unavailable right now. Please try again shortly." },
        { status: 502 }
      )
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const reply =
      data.content?.find((part) => part.type === "text")?.text?.trim() ??
      "Sorry, I couldn't generate a reply. Please email info@scprints.com.au."

    return NextResponse.json({ reply })
  } catch (error) {
    console.error("Chatbot route error", error)
    return NextResponse.json(
      { error: "unexpected_error", message: "Chat is unavailable right now." },
      { status: 500 }
    )
  }
}

const sanitiseMessages = (raw: unknown): ChatMessage[] => {
  if (!Array.isArray(raw)) return []
  const cleaned: ChatMessage[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const role = (entry as any).role
    const content = (entry as any).content
    if (role !== "user" && role !== "assistant") continue
    if (typeof content !== "string" || content.trim().length === 0) continue
    cleaned.push({ role, content: content.slice(0, MAX_USER_CHARS) })
  }
  // Anthropic requires alternating roles starting with user; trim from the front if needed.
  while (cleaned.length > 0 && cleaned[0].role !== "user") cleaned.shift()
  return cleaned.slice(-MAX_HISTORY)
}
