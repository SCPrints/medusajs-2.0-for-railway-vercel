import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, readJsonBounded } from "@lib/util/api-guard"

// Relays to the backend's expensive Sharp print render; payload carries full
// customizerDesign metadata (same 6 MB choice as pos-bridge).
const MAX_BODY_BYTES = 6 * 1024 * 1024

function getBackendBaseUrl() {
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
  if (!backendUrl) {
    throw new Error("Missing NEXT_PUBLIC_MEDUSA_BACKEND_URL")
  }
  return backendUrl.replace(/\/+$/, "").replace(/\/store$/, "")
}

export async function POST(req: NextRequest) {
  // Throttle + cap: unauthenticated relay to a CPU-heavy server-side render.
  const limited = enforceRateLimit(req, { name: "render-print", limit: 60, windowMs: 60_000 })
  if (limited) return limited
  const parsed = await readJsonBounded(req, MAX_BODY_BYTES)
  if (!parsed.ok) return parsed.response

  try {
    const payload = parsed.data
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
    const response = await fetch(`${getBackendBaseUrl()}/store/customizer/render-print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(publishableKey ? { "x-publishable-api-key": publishableKey } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      return NextResponse.json(
        {
          message: body?.message ?? "Render print request failed.",
        },
        { status: response.status }
      )
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error("Render print proxy failed", error)
    return NextResponse.json({ message: "Render print service unavailable." }, { status: 500 })
  }
}
