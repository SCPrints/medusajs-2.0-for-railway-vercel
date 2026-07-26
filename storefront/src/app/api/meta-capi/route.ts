import { NextRequest, NextResponse } from "next/server"

import { buildCapiEvent } from "@lib/meta-capi"

/**
 * Meta Conversions API relay — server-side Purchase event.
 *
 * The browser pixel fires Purchase client-side; this fires the same event
 * (shared event_id → Meta dedups) server-side so the conversion survives
 * ad-blockers and iOS tracking limits. Called fire-and-forget from
 * PurchaseTracker on the order-confirmed page.
 *
 * No-ops (200) when FB_CAPI_ACCESS_TOKEN / pixel id aren't set, so the
 * store runs fine before the ad account is wired.
 *
 * ponytail: Purchase only. AddToCart / InitiateCheckout server-side can be
 * added the same way if upper-funnel match quality ever matters — the
 * client pixel already covers them.
 */
export async function POST(req: NextRequest) {
  const pixelId = process.env.FB_PIXEL_ID ?? process.env.NEXT_PUBLIC_FB_PIXEL_ID
  const token = process.env.FB_CAPI_ACCESS_TOKEN
  if (!pixelId || !token) {
    return NextResponse.json({ skipped: "capi_not_configured" }, { status: 200 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 })
  }
  if (!body?.event_id || typeof body.value !== "number") {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined
  const ua = req.headers.get("user-agent") || undefined

  const event = buildCapiEvent({
    event_id: String(body.event_id),
    event_time: Math.floor(Date.now() / 1000),
    event_source_url:
      typeof body.event_source_url === "string" ? body.event_source_url : undefined,
    value: body.value,
    currency: String(body.currency ?? "AUD"),
    content_ids: Array.isArray(body.content_ids)
      ? body.content_ids.map(String)
      : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
    client_ip_address: ip,
    client_user_agent: ua,
    fbp: req.cookies.get("_fbp")?.value,
    fbc: req.cookies.get("_fbc")?.value,
  })

  const version = process.env.FB_GRAPH_VERSION ?? "v21.0"

  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${pixelId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [event],
          ...(process.env.FB_CAPI_TEST_EVENT_CODE
            ? { test_event_code: process.env.FB_CAPI_TEST_EVENT_CODE }
            : {}),
          access_token: token,
        }),
      }
    )
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      return NextResponse.json(
        { error: "graph_error", detail: detail.slice(0, 500) },
        { status: 502 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: "network", detail: String(e?.message ?? e).slice(0, 200) },
      { status: 502 }
    )
  }
}
