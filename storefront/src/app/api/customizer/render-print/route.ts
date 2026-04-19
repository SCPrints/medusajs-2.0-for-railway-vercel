import { NextRequest, NextResponse } from "next/server"

function getBackendBaseUrl() {
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
  if (!backendUrl) {
    throw new Error("Missing NEXT_PUBLIC_MEDUSA_BACKEND_URL")
  }
  return backendUrl.replace(/\/+$/, "").replace(/\/store$/, "")
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
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
