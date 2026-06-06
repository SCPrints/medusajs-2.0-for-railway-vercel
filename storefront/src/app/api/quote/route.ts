import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, readJsonBounded } from "@lib/util/api-guard"

/**
 * Storefront proxy → backend POST /store/quotes. Forwards the
 * (potentially large) request body so the BYO form can attach mood-
 * board image uploads without the storefront becoming a CORS
 * negotiator.
 */
// The BYO form allows up to 20 MB of mood-board images (raw), which base64-
// inflate to ~27 MB of POST body. Cap at 28 MB so a permitted submission never
// 413s here, while still bounding the open-relay / OOM surface. (Keep this in
// step with MAX_TOTAL_BYTES in byo-inquiry-form.tsx.)
const MAX_BODY_BYTES = 28 * 1024 * 1024

function getBackendBaseUrl() {
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
  if (!backendUrl) {
    throw new Error("Missing NEXT_PUBLIC_MEDUSA_BACKEND_URL")
  }
  return backendUrl.replace(/\/+$/, "")
}

export async function POST(req: NextRequest) {
  // Throttle + size-cap: this is an unauthenticated relay to a backend write
  // route (quote creation also emails staff) — without limits it's a spam /
  // inbox-flood / OOM vector.
  const limited = enforceRateLimit(req, { name: "quote", limit: 10, windowMs: 60_000 })
  if (limited) return limited
  const parsed = await readJsonBounded(req, MAX_BODY_BYTES)
  if (!parsed.ok) return parsed.response

  try {
    const payload = parsed.data
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (publishableKey) {
      headers["x-publishable-api-key"] = publishableKey
    }

    const res = await fetch(`${getBackendBaseUrl()}/store/quotes`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    })

    const body = await res.json().catch(() => null)
    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            body?.message ?? body?.error ?? "Quote request rejected by backend.",
        },
        { status: res.status }
      )
    }
    return NextResponse.json(body, { status: 200 })
  } catch (err) {
    console.error("Quote proxy failed", err)
    return NextResponse.json(
      {
        success: false,
        message: "Quote service is unavailable. Please try again shortly.",
      },
      { status: 500 }
    )
  }
}
