import { NextRequest, NextResponse } from "next/server"

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
  try {
    const payload = await req.json()
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
