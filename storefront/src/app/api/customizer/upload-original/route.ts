import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, readJsonBounded } from "@lib/util/api-guard"

// Base64-encoded original artwork; 16 MB caps the relay/OOM surface while
// allowing high-res source files.
const MAX_BODY_BYTES = 16 * 1024 * 1024

function getBackendBaseUrl() {
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
  if (!backendUrl) {
    throw new Error("Missing NEXT_PUBLIC_MEDUSA_BACKEND_URL")
  }
  return backendUrl.replace(/\/+$/, "").replace(/\/store$/, "")
}

export async function POST(req: NextRequest) {
  // Throttle (generous — a design session uploads several files) + size-cap.
  const limited = enforceRateLimit(req, { name: "upload-original", limit: 40, windowMs: 60_000 })
  if (limited) return limited
  const parsed = await readJsonBounded(req, MAX_BODY_BYTES)
  if (!parsed.ok) return parsed.response

  try {
    const payload = parsed.data
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
    const response = await fetch(`${getBackendBaseUrl()}/store/customizer/upload-original`, {
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
        { message: typeof body?.message === "string" ? body.message : "Upload failed." },
        { status: response.status }
      )
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error("upload-original proxy failed", error)
    return NextResponse.json({ message: "Upload service unavailable." }, { status: 500 })
  }
}
