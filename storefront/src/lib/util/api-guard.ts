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
// HARD ceiling on distinct keys so a high-cardinality flood (e.g. a spoofed,
// ever-changing X-Forwarded-For) can't grow the Map without bound. x-forwarded-
// for's leftmost value is client-injectable, so each request could otherwise
// mint a fresh bucket. When we hit the ceiling we evict the soonest-to-reset
// entries. (The authoritative limiter is the Vercel Firewall; this just keeps
// the in-memory map bounded.)
const MAX_BUCKETS = 50_000

function prune(now: number) {
  // Cheap periodic sweep so the Map can't grow unbounded across many IPs.
  if (now - lastPrune < 60_000 && buckets.size < 10_000) return
  lastPrune = now
  buckets.forEach((b, k) => {
    if (now >= b.resetAt) buckets.delete(k)
  })
}

function evictIfFull() {
  if (buckets.size < MAX_BUCKETS) return
  // Collect, sort by soonest reset, drop the oldest 25%. forEach (not for..of)
  // to avoid the project's downlevel-iteration constraint on Map.
  const entries: Array<[string, number]> = []
  buckets.forEach((b, k) => entries.push([k, b.resetAt]))
  entries.sort((a, b) => a[1] - b[1])
  const drop = Math.ceil(entries.length * 0.25)
  for (let i = 0; i < drop; i++) buckets.delete(entries[i][0])
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
    if (!b) evictIfFull()
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
const tooLarge = () =>
  NextResponse.json({ error: "payload_too_large" }, { status: 413 })
const invalid = () =>
  NextResponse.json({ error: "invalid_payload" }, { status: 400 })

export type BoundedJson =
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse }

/**
 * Streams the request body, aborting as soon as accumulated bytes exceed
 * `maxBytes`, then JSON-parses. The cap is enforced DURING the read (not after
 * buffering), so a missing/lying Content-Length can't make us buffer an
 * arbitrarily large body into memory before rejecting. Returns a ready-to-send
 * NextResponse on failure.
 *
 * `bodySizeLimit` in next.config.js only applies to Server Actions, NOT to
 * these route handlers — so this is the only body cap they have in code.
 */
export async function readJsonBounded(
  req: Request,
  maxBytes: number
): Promise<BoundedJson> {
  // Cheap pre-check: reject honest oversized bodies before reading anything.
  const declared = req.headers.get("content-length")
  if (declared) {
    const n = Number(declared)
    if (Number.isFinite(n) && n > maxBytes) return { ok: false, response: tooLarge() }
  }

  const body = req.body
  if (!body) {
    // No stream (e.g. some test harnesses) — fall back to text() with a cap.
    try {
      const text = await req.text()
      if (new TextEncoder().encode(text).length > maxBytes)
        return { ok: false, response: tooLarge() }
      if (!text) return { ok: false, response: invalid() }
      return { ok: true, data: JSON.parse(text) }
    } catch {
      return { ok: false, response: invalid() }
    }
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > maxBytes) {
          try {
            await reader.cancel()
          } catch {
            /* noop */
          }
          return { ok: false, response: tooLarge() }
        }
        chunks.push(value)
      }
    }
  } catch {
    return { ok: false, response: invalid() }
  }

  if (total === 0) return { ok: false, response: invalid() }

  const merged = new Uint8Array(total)
  let offset = 0
  for (let i = 0; i < chunks.length; i++) {
    merged.set(chunks[i], offset)
    offset += chunks[i].byteLength
  }

  try {
    return { ok: true, data: JSON.parse(new TextDecoder().decode(merged)) }
  } catch {
    return { ok: false, response: invalid() }
  }
}
