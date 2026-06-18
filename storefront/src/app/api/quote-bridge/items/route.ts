import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, readJsonBounded } from "@lib/util/api-guard"

// Each design line carries the full (sanitised) customizerDesign metadata, and
// a multi-size design posts several lines in one request — 6 MB caps it while
// staying well above a realistic payload.
const MAX_BODY_BYTES = 6 * 1024 * 1024

/**
 * POST /api/quote-bridge/items
 *   body: {
 *     quote_id: string,
 *     qsig: string,
 *     group_id: string,
 *     lines: Array<{
 *       line_id?: string,
 *       kind: "standard" | "customizer",
 *       variant_id: string | null,
 *       product_id: string,
 *       product_title: string,
 *       variant_title?: string | null,
 *       quantity: number,
 *       unit_price_cents?: number | null,
 *       metadata?: Record<string, unknown>,
 *     }>,
 *   }
 *
 * Relays a finished design from the storefront customiser (quote mode) to the
 * backend quote. Called by the customiser's add-to-cart path when it detects
 * `?quote_id=&qsig=` in the URL. Mirrors /api/pos-bridge/items.
 *
 * Unlike POS, the capability is the `qsig` HMAC (verified by the backend), not
 * the id — a quote id is long-lived. We forward it verbatim; the backend
 * /store/quotes/:id/design-items route is the authority on the signature.
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
    name: "quote-bridge",
    limit: 60,
    windowMs: 60_000,
  })
  if (limited) return limited
  const parsed = await readJsonBounded(req, MAX_BODY_BYTES)
  if (!parsed.ok) return parsed.response
  const payload = parsed.data as any

  const quoteId: string | undefined = payload?.quote_id
  if (!quoteId || typeof quoteId !== "string") {
    return NextResponse.json({ error: "quote_id required" }, { status: 400 })
  }
  if (!payload?.qsig || typeof payload.qsig !== "string") {
    return NextResponse.json({ error: "qsig required" }, { status: 400 })
  }
  if (!payload?.group_id || typeof payload.group_id !== "string") {
    return NextResponse.json({ error: "group_id required" }, { status: 400 })
  }
  const lines = payload?.lines
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
    return NextResponse.json({ error: "invalid_lines" }, { status: 400 })
  }
  // Bound the numeric fields an attacker holding a leaked signed URL could
  // otherwise set freely (price/quantity injection into a quote).
  for (const line of lines) {
    const quantity = line?.quantity
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) {
      return NextResponse.json({ error: "invalid_quantity" }, { status: 400 })
    }
    const unitPrice = line?.unit_price_cents
    if (
      unitPrice != null &&
      (!Number.isInteger(unitPrice) || unitPrice < 0 || unitPrice > 100_000_000)
    ) {
      return NextResponse.json({ error: "invalid_unit_price" }, { status: 400 })
    }
  }

  // Strip quote_id — the backend reads it from the URL.
  const { quote_id: _drop, ...forwardBody } = payload

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
    const res = await fetch(
      `${backendBaseUrl}/store/quotes/${encodeURIComponent(
        quoteId
      )}/design-items`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(forwardBody),
        cache: "no-store",
      }
    )

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
