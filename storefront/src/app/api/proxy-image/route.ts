import { NextRequest, NextResponse } from "next/server"

/**
 * Allowlist of hostnames we'll proxy. Keep tight to prevent SSRF — only
 * hosts we already use for product/garment imagery should pass through.
 *
 * Reads dynamic hosts (R2/Minio endpoint, Medusa backend) from env at
 * request time so this route works in dev, preview, and production
 * without a code change per environment.
 *
 * Used by the customizer's per-colour mockup compositor, which needs to
 * load supplier garment images into a `<canvas>` with `crossOrigin =
 * "anonymous"` before calling `toDataURL`. When the upstream host
 * doesn't return permissive CORS headers, the image fails to load (or
 * silently taints the canvas) and every cart line falls back to the
 * same base mockup. Proxying the bytes through here lets us serve the
 * same image with `Access-Control-Allow-Origin: *` so canvas tainting
 * never blocks the per-cell mockup.
 */
const STATIC_HOST_ALLOWLIST = [
  // Supplier CDNs
  "cdn.fashionbizapps.nz",
  "cdn11.bigcommerce.com",
  "www.dncworkwear.com.au",
  "dncworkwear.com.au",
  "aussiepacific-images.s3.ap-southeast-2.amazonaws.com",
  "media.as-colour.com",
  "ascolour.com.au",
  "www.ascolour.com.au",
  // Medusa demo / testing hosts (rare but referenced by next.config.js)
  "medusa-public-images.s3.eu-west-1.amazonaws.com",
  "medusa-server-testing.s3.amazonaws.com",
  "medusa-server-testing.s3.us-east-1.amazonaws.com",
]

function dynamicHostsFromEnv(): string[] {
  const out: string[] = []
  const envs = [
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
    process.env.NEXT_PUBLIC_MINIO_ENDPOINT,
    process.env.NEXT_PUBLIC_BASE_URL,
  ]
  for (const value of envs) {
    if (!value) continue
    try {
      const parsed = new URL(
        /^https?:\/\//i.test(value) ? value : `https://${value}`
      )
      if (parsed.hostname) out.push(parsed.hostname.toLowerCase())
    } catch {
      // ignore malformed env values
    }
  }
  return out
}

function isAllowedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (STATIC_HOST_ALLOWLIST.includes(lower)) return true
  if (dynamicHostsFromEnv().includes(lower)) return true
  // Wildcards for R2 dev URLs (random subdomain per bucket) and the
  // generic Cloudflare R2 storage hostname. R2 dev URLs look like
  // `https://pub-<hash>.r2.dev`.
  if (lower.endsWith(".r2.dev")) return true
  if (lower.endsWith(".r2.cloudflarestorage.com")) return true
  return false
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")
  if (!url) {
    return NextResponse.json(
      { message: "Missing required `url` query parameter." },
      { status: 400 }
    )
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json(
      { message: "Invalid `url` parameter." },
      { status: 400 }
    )
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { message: "Only http(s) URLs are proxied." },
      { status: 400 }
    )
  }
  if (!isAllowedHost(parsed.hostname)) {
    return NextResponse.json(
      { message: `Host "${parsed.hostname}" is not on the proxy allowlist.` },
      { status: 403 }
    )
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      // Don't forward cookies / auth; this is a public-image proxy.
      headers: { accept: "image/*" },
      // No-store on the upstream call so we don't accidentally serve
      // a stale supplier image. Cache on the EDGE / CDN at our layer
      // via the response headers below.
      cache: "no-store",
    })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { message: `Upstream ${parsed.hostname} returned ${upstream.status}.` },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 }
      )
    }
    const contentType = upstream.headers.get("content-type") ?? "image/*"
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { message: `Upstream returned non-image content (${contentType}).` },
        { status: 415 }
      )
    }
    const headers = new Headers()
    headers.set("content-type", contentType)
    const upstreamLength = upstream.headers.get("content-length")
    if (upstreamLength) headers.set("content-length", upstreamLength)
    headers.set("access-control-allow-origin", "*")
    headers.set("cache-control", "public, max-age=3600, s-maxage=86400")
    return new NextResponse(upstream.body, { status: 200, headers })
  } catch (error) {
    console.error("proxy-image upstream fetch failed", { url, error })
    return NextResponse.json(
      { message: "Failed to fetch upstream image." },
      { status: 502 }
    )
  }
}
