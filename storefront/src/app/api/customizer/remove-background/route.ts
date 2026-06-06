import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, readJsonBounded } from "@lib/util/api-guard"

// Spends real remove.bg API credits per call; base64 dataUrl can be large.
const MAX_BODY_BYTES = 16 * 1024 * 1024

export async function POST(req: NextRequest) {
  // Throttle + cap: paid-3rd-party-API-per-call (denial-of-wallet) + large
  // base64 relay (OOM) — same class as /api/chat and upload-original.
  const limited = enforceRateLimit(req, { name: "remove-bg", limit: 30, windowMs: 60_000 })
  if (limited) return limited
  const parsed = await readJsonBounded(req, MAX_BODY_BYTES)
  if (!parsed.ok) return parsed.response

  try {
    const body = parsed.data as { dataUrl?: string }
    const dataUrl = body?.dataUrl

    if (!dataUrl || typeof dataUrl !== "string") {
      return NextResponse.json({ message: "Missing image data." }, { status: 400 })
    }

    const removeBgApiKey = process.env.REMOVE_BG_API_KEY

    // Fallback behavior keeps the workflow functional if no provider key is configured.
    if (!removeBgApiKey) {
      return NextResponse.json(
        { message: "Background removal is not configured for this environment." },
        { status: 503 }
      )
    }

    const [, base64] = dataUrl.split(",", 2)
    if (!base64) {
      return NextResponse.json({ message: "Invalid image data URL." }, { status: 400 })
    }

    const formData = new FormData()
    formData.append("size", "auto")
    formData.append("image_file_b64", base64)

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": removeBgApiKey,
      },
      body: formData,
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { message: `remove.bg failed: ${errorText || response.statusText}` },
        { status: response.status }
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const nextDataUrl = `data:image/png;base64,${Buffer.from(arrayBuffer).toString("base64")}`
    return NextResponse.json({ dataUrl: nextDataUrl })
  } catch (error) {
    console.error("Background removal proxy failed", error)
    return NextResponse.json({ message: "Background removal service unavailable." }, { status: 500 })
  }
}
