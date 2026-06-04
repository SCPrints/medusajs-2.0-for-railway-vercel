import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, readJsonBounded } from "@lib/util/api-guard"

const MAX_BODY_BYTES = 16 * 1024

function getBackendBaseUrl() {
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL

  if (!backendUrl) {
    throw new Error("Missing NEXT_PUBLIC_MEDUSA_BACKEND_URL")
  }

  return backendUrl.replace(/\/+$/, "").replace(/\/store$/, "")
}

async function postNewsletterSubscription(endpoint: string, payload: unknown) {
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
  // Unauthenticated relay → backend newsletter route. Throttle + size-cap to
  // prevent signup spam / row injection.
  const limited = enforceRateLimit(req, { name: "newsletter", limit: 10, windowMs: 60_000 })
  if (limited) return limited
  const parsed = await readJsonBounded(req, MAX_BODY_BYTES)
  if (!parsed.ok) return parsed.response

  try {
    const payload = parsed.data
    const backendBaseUrl = getBackendBaseUrl()

    let response = await postNewsletterSubscription(
      `${backendBaseUrl}/newsletter`,
      payload
    )

    if (response.status === 404 || response.status === 405) {
      response = await postNewsletterSubscription(
        `${backendBaseUrl}/store/newsletter`,
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
            "Subscription could not be completed. Please try again shortly.",
        },
        { status: response.status }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: body?.message ?? "Thanks for subscribing!",
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Newsletter proxy failed", error)
    return NextResponse.json(
      {
        success: false,
        message: "Newsletter service is unavailable. Please try again shortly.",
      },
      { status: 500 }
    )
  }
}
