import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, readJsonBounded } from "@lib/util/api-guard"

/**
 * AI spot-colour estimation for screen printing — sibling of
 * /api/embroidery/estimate-stitches (same key, same guard rails). The
 * deterministic client-side estimator handles clean artwork for free; this
 * route is the fallback for messy/ambiguous artwork (gradients, photos,
 * heavy texture) where pixel clustering can't decide.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const MAX_BODY_BYTES = 8 * 1024 * 1024
const MODEL = "claude-haiku-4-5-20251001"
const MAX_IMAGE_BYTES = 6 * 1024 * 1024

const SYSTEM_PROMPT = `You are a screen-printing pre-press specialist. You receive
artwork a customer wants screen printed on a garment and return how many SPOT
COLOURS (separate screens/inks) it needs, and whether it's suitable for screen
printing at all.

Rules of the trade you apply:
- Each distinct solid ink colour = one screen. Black outlines count as a colour.
- Shades created by halftoning one ink do NOT count as extra colours, but if
  the artwork depends on smooth gradients or photographic detail, spot-colour
  screen printing is NOT suitable — recommend digital (DTF) instead.
- Maximum 6 colours (including a white underbase if the garment is dark —
  but do NOT include underbase in your count; report design colours only).
- Anti-aliasing halos, JPEG noise, and soft shadows are artifacts, not inks.
- Small accents under ~2% of the design area still need their own screen if
  they're a distinct colour — count them.

OUTPUT: STRICT JSON only, no prose, no markdown:
{
  "spotColours": <integer 1-8>,
  "screenPrintable": <boolean>,
  "notes": "<one short sentence: what the colours are, or why it isn't screen-printable>"
}
Keep notes under 200 characters.`

type EstimateBody = {
  imageBase64?: unknown
  mediaType?: unknown
}

const stripDataUrl = (raw: string): { mediaType: string | null; base64: string } => {
  if (raw.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(raw)
    if (match) return { mediaType: match[1], base64: match[2] }
  }
  return { mediaType: null, base64: raw }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "unavailable",
        message: "Colour analysis is unavailable right now — pick the count manually.",
      },
      { status: 503 }
    )
  }

  const limited = enforceRateLimit(req, { name: "screen-colour-estimate", limit: 20, windowMs: 60_000 })
  if (limited) return limited
  const parsed = await readJsonBounded(req, MAX_BODY_BYTES)
  if (!parsed.ok) return parsed.response
  const body = parsed.data as EstimateBody

  if (typeof body.imageBase64 !== "string" || !body.imageBase64.length) {
    return NextResponse.json(
      { error: "missing_image", message: "Image data is required." },
      { status: 400 }
    )
  }

  const { mediaType: parsedType, base64 } = stripDataUrl(body.imageBase64)
  const mediaType =
    typeof body.mediaType === "string" && body.mediaType.length
      ? body.mediaType
      : parsedType ?? "image/png"

  if (base64.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "image_too_large", message: "Image is too large for colour analysis. Resize under 5 MB." },
      { status: 413 }
    )
  }

  const VISION_OK_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
  if (!VISION_OK_TYPES.has(mediaType)) {
    return NextResponse.json(
      {
        error: "unsupported_format",
        message: `${mediaType} isn't supported for AI colour analysis. Re-upload as PNG or JPG.`,
      },
      { status: 415 }
    )
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
        max_tokens: 300,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              {
                type: "text",
                text: "How many spot colours does screen printing this artwork need? Return JSON only.",
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      console.error("Screen colour estimator upstream error", response.status, detail.slice(0, 500))
      return NextResponse.json(
        {
          error: "upstream_error",
          status: response.status,
          message: `Colour analysis failed (upstream ${response.status}) — pick the count manually.`,
        },
        { status: 502 }
      )
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const text = data.content?.find((part) => part.type === "text")?.text?.trim() ?? ""

    let parsedOut: { spotColours?: number; screenPrintable?: boolean; notes?: string } | null = null
    try {
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
      parsedOut = JSON.parse(cleaned)
    } catch {
      console.error("Screen colour estimator could not parse model output:", text.slice(0, 300))
      return NextResponse.json(
        { error: "parse_error", message: "Couldn't read the AI response — pick the count manually." },
        { status: 502 }
      )
    }

    const spotColours = Math.max(1, Math.min(8, Math.round(Number(parsedOut?.spotColours ?? 1))))
    const screenPrintable = parsedOut?.screenPrintable !== false && spotColours <= 6
    const notes = typeof parsedOut?.notes === "string" ? parsedOut.notes.slice(0, 200) : ""

    return NextResponse.json({ spotColours, screenPrintable, notes })
  } catch (error) {
    console.error("Screen colour estimator route error", error)
    return NextResponse.json(
      { error: "unexpected_error", message: "Colour analysis is unavailable right now." },
      { status: 500 }
    )
  }
}
