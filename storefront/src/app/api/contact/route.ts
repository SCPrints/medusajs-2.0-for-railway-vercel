import { NextRequest, NextResponse } from "next/server"
import { getOrCreateRequestId } from "@lib/request-context"
import { enforceRateLimit, readJsonBounded } from "@lib/util/api-guard"
import { isHoneypotTripped, leadRelayHeaders } from "@lib/util/lead-relay"

const MAX_BODY_BYTES = 256 * 1024

function getBackendBaseUrl() {
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL

  if (!backendUrl) {
    throw new Error("Missing NEXT_PUBLIC_MEDUSA_BACKEND_URL")
  }

  return backendUrl.replace(/\/+$/, "").replace(/\/store$/, "")
}

async function postContact(
  endpoint: string,
  payload: unknown,
  publishableKey?: string,
  requestId?: string,
  relayHeaders: Record<string, string> = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...relayHeaders,
  }

  if (publishableKey) {
    headers["x-publishable-api-key"] = publishableKey
  }

  if (requestId) {
    headers["x-request-id"] = requestId
  }

  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  })
}

export async function POST(req: NextRequest) {
  // Unauthenticated relay → backend contact route (emails staff). Throttle +
  // size-cap to prevent inbox-flood spam and oversized bodies.
  const limited = enforceRateLimit(req, { name: "contact", limit: 10, windowMs: 60_000 })
  if (limited) return limited
  const parsed = await readJsonBounded(req, MAX_BODY_BYTES)
  if (!parsed.ok) return parsed.response

  // Bots fill the hidden field: pretend it worked so they don't retry.
  if (isHoneypotTripped(parsed.data)) {
    return NextResponse.json({ success: true, message: "Message sent successfully." }, { status: 200 })
  }

  try {
    const payload = parsed.data
    const backendBaseUrl = getBackendBaseUrl()
    const relayHeaders = await leadRelayHeaders()
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
    const requestId = await getOrCreateRequestId()

    let response = await postContact(
      `${backendBaseUrl}/contact`,
      payload,
      publishableKey,
      requestId,
      relayHeaders
    )

    // Compatibility fallback for older backends exposing /store/contact.
    if (response.status === 404 || response.status === 405) {
      response = await postContact(
        `${backendBaseUrl}/store/contact`,
        payload,
        publishableKey,
        requestId,
        relayHeaders
      )
    }

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            body?.message ??
            "Backend rejected the contact request. Please try again shortly.",
        },
        { status: response.status }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: body?.message ?? "Message sent successfully.",
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Contact proxy failed", error)
    return NextResponse.json(
      {
        success: false,
        message: "Contact service is unavailable. Please try again shortly.",
      },
      { status: 500 }
    )
  }
}
