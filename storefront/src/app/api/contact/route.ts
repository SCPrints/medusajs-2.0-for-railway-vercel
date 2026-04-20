import { NextRequest, NextResponse } from "next/server"

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
  publishableKey?: string
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (publishableKey) {
    headers["x-publishable-api-key"] = publishableKey
  }

  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  })
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const backendBaseUrl = getBackendBaseUrl()
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

    let response = await postContact(
      `${backendBaseUrl}/contact`,
      payload,
      publishableKey
    )

    // #region agent log
    fetch("http://127.0.0.1:7514/ingest/d011aee9-9c02-46d7-8ea3-0d9f69f8eed0", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "b984c7",
      },
      body: JSON.stringify({
        sessionId: "b984c7",
        location: "contact/route.ts:POST",
        message: "contact proxy primary",
        data: {
          status: response.status,
          triedPath: "contact",
        },
        timestamp: Date.now(),
        hypothesisId: "H5",
      }),
    }).catch(() => {})
    // #endregion

    // Compatibility fallback for older backends exposing /store/contact.
    if (response.status === 404 || response.status === 405) {
      response = await postContact(
        `${backendBaseUrl}/store/contact`,
        payload,
        publishableKey
      )
      // #region agent log
      fetch(
        "http://127.0.0.1:7514/ingest/d011aee9-9c02-46d7-8ea3-0d9f69f8eed0",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "b984c7",
          },
          body: JSON.stringify({
            sessionId: "b984c7",
            location: "contact/route.ts:POST",
            message: "contact proxy fallback",
            data: {
              status: response.status,
              triedPath: "store/contact",
            },
            timestamp: Date.now(),
            hypothesisId: "H5",
          }),
        }
      ).catch(() => {})
      // #endregion
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
