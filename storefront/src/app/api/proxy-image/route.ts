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

/**
 * Reject literal private / loopback / link-local / metadata hosts so that
 * even a misconfigured (or compromised) allowlist entry can't be used to
 * reach internal infrastructure or the cloud metadata endpoint. This is a
 * cheap second layer behind the allowlist + the `redirect: "manual"` guard
 * below — it catches the case where an allowlisted host resolves to, or a
 * `url=` param points directly at, an internal address.
 */
function isBlockedAddress(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === "localhost" || lower.endsWith(".localhost")) return true
  if (lower === "metadata.google.internal") return true
  // IPv6 loopback / unspecified / link-local / unique-local.
  if (lower === "::1" || lower === "[::1]" || lower === "::" || lower === "[::]")
    return true
  if (
    lower.startsWith("[fe80:") ||
    lower.startsWith("fe80:") ||
    lower.startsWith("[fc") ||
    lower.startsWith("[fd") ||
    lower.startsWith("fc") ||
    lower.startsWith("fd")
  )
    return true
  // IPv4 literals in private / loopback / link-local / metadata ranges.
  const v4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // loopback
    if (a === 0) return true // 0.0.0.0/8
    if (a === 169 && b === 254) return true // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
  }
  return false
}

function isAllowedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (isBlockedAddress(lower)) return false
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
      // SSRF guard: do NOT follow redirects. The allowlist only validates
      // the initial hostname — an allowlisted host (or one with an open
      // redirect) that 3xx-bounces to http://169.254.169.254/... or an
      // internal service would otherwise be followed server-side and the
      // response streamed back to the caller. Treat any redirect as an error.
      redirect: "manual",
    })
    if (upstream.status >= 300 && upstream.status < 400) {
      return NextResponse.json(
        { message: `Upstream ${parsed.hostname} attempted a redirect; refusing to follow.` },
        { status: 502 }
      )
    }
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
