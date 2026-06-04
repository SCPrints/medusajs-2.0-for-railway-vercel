import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, readJsonBounded } from "@lib/util/api-guard"

const MAX_BODY_BYTES = 64 * 1024

function getBackendBaseUrl() {
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL

  if (!backendUrl) {
    throw new Error("Missing NEXT_PUBLIC_MEDUSA_BACKEND_URL")
  }

  return backendUrl.replace(/\/+$/, "").replace(/\/store$/, "")
}

async function postAbandonedCartFollowup(endpoint: string, payload: unknown) {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  })
}

export async function POST(req: NextRequest) {
  // Unauthenticated relay → backend abandoned-cart route. Throttle + size-cap
  // (fired client-side on cart changes, so the limit is a little higher).
  const limited = enforceRateLimit(req, { name: "abandoned-cart", limit: 30, windowMs: 60_000 })
  if (limited) return limited
  const parsed = await readJsonBounded(req, MAX_BODY_BYTES)
  if (!parsed.ok) return parsed.response

  try {
    const payload = parsed.data
    const backendBaseUrl = getBackendBaseUrl()

    let response = await postAbandonedCartFollowup(
      `${backendBaseUrl}/abandoned-cart`,
      payload
    )

    if (response.status === 404 || response.status === 405) {
      response = await postAbandonedCartFollowup(
        `${backendBaseUrl}/store/abandoned-cart`,
        payload
      )
    }

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            body?.message ??
            "Follow-up request could not be saved right now. Please try again shortly.",
        },
        { status: response.status }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: body?.message ?? "Cart follow-up details saved.",
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Abandoned cart proxy failed", error)
    return NextResponse.json(
      {
        success: false,
        message: "Follow-up service is unavailable. Please try again shortly.",
      },
      { status: 500 }
    )
  }
}
