import { createHash, timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"

/**
 * Constant-time string comparison for secrets/tokens. Hashing both sides to a
 * fixed-length digest first avoids leaking length and sidesteps
 * timingSafeEqual's equal-length requirement.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Lightweight abuse-control helpers for storefront route handlers
 * (`src/app/api/*`). These routes are public, unauthenticated proxies in
 * front of expensive/stateful backends (Anthropic, the Medusa store API), so
 * without guards they're a denial-of-wallet / spam / OOM surface.
 *
 * Two protections:
 *   1. `enforceRateLimit` — per-IP request throttle.
 *   2. `readJsonBounded`  — size-capped JSON body parsing.
 *
 * NOTE ON THE RATE LIMITER: this is an in-memory limiter, scoped to a single
 * serverless/Fluid-Compute instance. On Vercel, Fluid Compute reuses instances
 * and multiplexes concurrent requests, so it meaningfully throttles a naive
 * single-source flood — but it is NOT a distributed guarantee (a flood spread
 * across many cold instances can partially bypass it, and counts reset on cold
 * start). The authoritative control is a **Vercel Firewall rate-limit rule** on
 * these paths (config, not code). Treat this as in-code defense-in-depth that
 * works with zero infra today; add the Firewall rule for the hard ceiling.
 */

// ── In-memory rate limiter ───────────────────────────────────────────────
type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
let lastPrune = 0

function prune(now: number) {
  // Cheap periodic sweep so the Map can't grow unbounded across many IPs.
  if (now - lastPrune < 60_000 && buckets.size < 10_000) return
  lastPrune = now
  buckets.forEach((b, k) => {
    if (now >= b.resetAt) buckets.delete(k)
  })
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}

export type RateLimitResult = { ok: boolean; retryAfterMs: number }

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  prune(now)
  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterMs: 0 }
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterMs: b.resetAt - now }
  }
  b.count += 1
  return { ok: true, retryAfterMs: 0 }
}

/**
 * Returns a 429 response if the caller (by IP) is over the limit for `name`,
 * else null. Usage:
 *   const limited = enforceRateLimit(req, { name: "chat", limit: 20, windowMs: 60_000 })
 *   if (limited) return limited
 */
export function enforceRateLimit(
  req: Request,
  opts: { name: string; limit: number; windowMs: number }
): NextResponse | null {
  const ip = getClientIp(req)
  const { ok, retryAfterMs } = rateLimit(
    `${opts.name}:${ip}`,
    opts.limit,
    opts.windowMs
  )
  if (ok) return null
  const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return NextResponse.json(
    {
      error: "rate_limited",
      message: "Too many requests. Please slow down and try again shortly.",
    },
    { status: 429, headers: { "retry-after": String(retryAfter) } }
  )
}

// ── Bounded JSON body parsing ────────────────────────────────────────────
const byteLength = (text: string) => new TextEncoder().encode(text).length

export type BoundedJson =
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse }

/**
 * Reads + parses a JSON body, rejecting bodies larger than `maxBytes` BEFORE
 * doing any downstream work. Checks the declared Content-Length first (cheap,
 * pre-read), then re-checks the actual decoded byte length to defend against a
 * missing/lying header. Returns a ready-to-send NextResponse on failure.
 *
 * `bodySizeLimit` in next.config.js only applies to Server Actions, NOT to
 * these route handlers — so this is the only body cap they have in code.
 */
export async function readJsonBounded(
  req: Request,
  maxBytes: number
): Promise<BoundedJson> {
  const declared = req.headers.get("content-length")
  if (declared && Number(declared) > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: "payload_too_large" }, { status: 413 }),
    }
  }

  let text: string
  try {
    text = await req.text()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_payload" }, { status: 400 }),
    }
  }

  if (byteLength(text) > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: "payload_too_large" }, { status: 413 }),
    }
  }
  if (!text) {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_payload" }, { status: 400 }),
    }
  }

  try {
    return { ok: true, data: JSON.parse(text) }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_payload" }, { status: 400 }),
    }
  }
}
