import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, readJsonBounded } from "@lib/util/api-guard"

// Same payload family as /api/quote-bridge/items — one or more design lines
// each carrying a sanitised customizerDesign. 6 MB caps it comfortably.
const MAX_BODY_BYTES = 6 * 1024 * 1024

/**
 * POST /api/quote-bridge/poa
 *   body: { email, contact_name?, note?, group_id, product_title?,
 *           poa_sides: [{ side, stitch_count }], lines: [...] }
 *
 * Relays a customer's over-12k-stitch embroidery design from the Studio to the
 * backend POA auto-quote route (/store/quotes/poa-request). Unlike the staff
 * design-items relay there is no qsig — this CREATES a quote (public
 * lead-capture, same trust level as the BYO / contact quote form), so the
 * guard is a tighter rate limit + bounded numerics.
 */
function getBackendBaseUrl(): string {
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
  if (!backendUrl) {
    throw new Error("Missing NEXT_PUBLIC_MEDUSA_BACKEND_URL")
  }
  return backendUrl.replace(/\/+$/, "").replace(/\/store$/, "")
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    name: "quote-bridge-poa",
    limit: 10,
    windowMs: 60_000,
  })
  if (limited) return limited
  const parsed = await readJsonBounded(req, MAX_BODY_BYTES)
  if (!parsed.ok) return parsed.response
  const payload = parsed.data as any

  if (!payload?.email || typeof payload.email !== "string") {
    return NextResponse.json({ error: "email required" }, { status: 400 })
  }
  if (!payload?.group_id || typeof payload.group_id !== "string") {
    return NextResponse.json({ error: "group_id required" }, { status: 400 })
  }
  const lines = payload?.lines
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
    return NextResponse.json({ error: "invalid_lines" }, { status: 400 })
  }
  for (const line of lines) {
    const quantity = line?.quantity
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) {
      return NextResponse.json({ error: "invalid_quantity" }, { status: 400 })
    }
  }

  let backendBaseUrl: string
  try {
    backendBaseUrl = getBackendBaseUrl()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "backend not configured" },
      { status: 503 }
    )
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  if (publishableKey) headers["x-publishable-api-key"] = publishableKey

  try {
    const res = await fetch(`${backendBaseUrl}/store/quotes/poa-request`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    })

    const text = await res.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = { error: "bad_backend_response", raw: text }
    }

    return NextResponse.json(body, { status: res.status })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "bridge_failed" },
      { status: 502 }
    )
  }
}
