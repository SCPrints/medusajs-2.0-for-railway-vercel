import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import net from "node:net"
import tls from "node:tls"
import { Client as PgClient } from "pg"

import {
  ASCOLOUR_BASE_URL,
  ASCOLOUR_SUBSCRIPTION_KEY,
  DATABASE_URL,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  MEILISEARCH_HOST,
  MEILISEARCH_ADMIN_KEY,
  MINIO_ENDPOINT,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_IS_SANDBOX,
  POSTHOG_HOST,
  POSTHOG_PERSONAL_API_KEY,
  POSTHOG_PROJECT_ID,
  REDIS_URL,
  RESEND_API_KEY,
  SHIPSTATION_API_KEY,
  STRIPE_API_KEY,
  AUSPOST_API_KEY,
  AUSPOST_TEST_MODE,
} from "../../../../lib/constants"

/**
 * GET /admin/reports/system-health
 *
 * Light-touch reachability check for every external service the
 * platform depends on. Designed to be called every 60s by the header
 * "system health pill" — keep it cheap. Each check has a 4s budget.
 *
 * Each service returns one of:
 *   - "ok"        reachable + auth accepted
 *   - "degraded"  reachable but returned an unexpected response
 *   - "down"      unreachable / explicit auth failure
 *   - "unset"     env vars missing — service isn't expected to work
 */

type Status = "ok" | "degraded" | "down" | "unset"

type Check = {
  service: string
  status: Status
  latency_ms: number | null
  detail?: string | null
}

const TIMEOUT_MS = 4000

const ping = async (
  service: string,
  options: {
    configured: boolean
    url?: string
    headers?: Record<string, string>
    expectedOkStatuses?: number[]
  }
): Promise<Check> => {
  if (!options.configured) {
    return { service, status: "unset", latency_ms: null, detail: "env var missing" }
  }
  if (!options.url) {
    return {
      service,
      status: "unset",
      latency_ms: null,
      detail: "no health URL",
    }
  }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  const start = Date.now()
  try {
    const r = await fetch(options.url, {
      method: "GET",
      headers: options.headers,
      signal: ac.signal,
    })
    const latency = Date.now() - start
    const expected = options.expectedOkStatuses ?? [200, 201, 204, 401, 403]
    if (expected.includes(r.status)) {
      // 401/403 mean auth wasn't accepted — but the service answered, so
      // it's reachable. Return ok unless we explicitly authenticated.
      if (r.status === 401 || r.status === 403) {
        return {
          service,
          status: options.headers ? "degraded" : "ok",
          latency_ms: latency,
          detail: `HTTP ${r.status}`,
        }
      }
      return { service, status: "ok", latency_ms: latency, detail: null }
    }
    return {
      service,
      status: "degraded",
      latency_ms: latency,
      detail: `HTTP ${r.status}`,
    }
  } catch (err: any) {
    return {
      service,
      status: "down",
      latency_ms: Date.now() - start,
      detail: err?.name === "AbortError" ? "timeout" : err?.message ?? String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

const checkPostgres = async (): Promise<Check> => {
  if (!DATABASE_URL) {
    return { service: "Postgres", status: "unset", latency_ms: null, detail: "DATABASE_URL missing" }
  }
  const start = Date.now()
  const client = new PgClient({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: TIMEOUT_MS,
    statement_timeout: TIMEOUT_MS,
  })
  try {
    await client.connect()
    await client.query("SELECT 1")
    return { service: "Postgres", status: "ok", latency_ms: Date.now() - start, detail: null }
  } catch (err: any) {
    return {
      service: "Postgres",
      status: "down",
      latency_ms: Date.now() - start,
      detail: err?.message ?? String(err),
    }
  } finally {
    client.end().catch(() => {})
  }
}

const checkRedis = async (): Promise<Check> => {
  if (!REDIS_URL) {
    return { service: "Redis", status: "unset", latency_ms: null, detail: "REDIS_URL missing" }
  }
  let host: string
  let port: number
  let useTls: boolean
  try {
    const u = new URL(REDIS_URL)
    host = u.hostname
    port = u.port ? Number(u.port) : 6379
    // `rediss://` (TLS) — Upstash and other managed Redis services require this.
    useTls = u.protocol === "rediss:"
  } catch (err: any) {
    return {
      service: "Redis",
      status: "down",
      latency_ms: null,
      detail: `invalid REDIS_URL: ${err?.message ?? err}`,
    }
  }
  const start = Date.now()
  return new Promise<Check>((resolve) => {
    const socket: net.Socket = useTls
      ? tls.connect({ host, port, servername: host })
      : new net.Socket()
    let settled = false
    const finish = (c: Check) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(c)
    }
    const sendPing = () => {
      // Send PING; expect "+PONG\r\n" back. With AUTH required, server will
      // reply "-NOAUTH" which we treat as reachable.
      socket.write("*1\r\n$4\r\nPING\r\n")
    }
    socket.setTimeout(TIMEOUT_MS)
    if (useTls) {
      // TLS socket — handshake completes on `secureConnect`, not `connect`.
      ;(socket as tls.TLSSocket).once("secureConnect", sendPing)
    } else {
      socket.once("connect", sendPing)
    }
    socket.once("data", (buf) => {
      const reply = buf.toString("utf8")
      const latency = Date.now() - start
      if (reply.startsWith("+PONG")) {
        finish({ service: "Redis", status: "ok", latency_ms: latency, detail: null })
      } else if (reply.startsWith("-NOAUTH") || reply.startsWith("-WRONGPASS")) {
        // Reachable but auth required for PING — fine, treat as ok.
        finish({ service: "Redis", status: "ok", latency_ms: latency, detail: "auth required" })
      } else {
        finish({
          service: "Redis",
          status: "degraded",
          latency_ms: latency,
          detail: reply.slice(0, 40).trim() || "unexpected reply",
        })
      }
    })
    socket.once("timeout", () => {
      finish({
        service: "Redis",
        status: "down",
        latency_ms: Date.now() - start,
        detail: "timeout",
      })
    })
    socket.once("error", (err) => {
      finish({
        service: "Redis",
        status: "down",
        latency_ms: Date.now() - start,
        detail: err.message,
      })
    })
    if (!useTls) {
      socket.connect(port, host)
    }
  })
}

// Meilisearch DRIFT check (distinct from the `/health` liveness ping below).
// 2026-06-18 incident: the plugin's full-resync deleted ~1,200 real products
// from the index after a truncated source query, draining it from 1,352 to ~105
// docs. The listing path trusts Meili's result, so every category grid
// undercounted with NO error and the liveness ping stayed green. This compares
// indexed doc count to the published catalog and alarms on a meaningful gap so
// the next gutting is caught in minutes, not by a customer.
const checkMeilisearchIndex = async (req: MedusaRequest): Promise<Check> => {
  if (!MEILISEARCH_HOST || !MEILISEARCH_ADMIN_KEY) {
    return {
      service: "Meilisearch index",
      status: "unset",
      latency_ms: null,
      detail: "MEILISEARCH_HOST / MEILISEARCH_ADMIN_KEY missing",
    }
  }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  const start = Date.now()
  try {
    const indexName = process.env.MEILISEARCH_PRODUCT_INDEX || "products"
    const statsRes = await fetch(
      `${MEILISEARCH_HOST.replace(/\/$/, "")}/indexes/${indexName}/stats`,
      {
        headers: { Authorization: `Bearer ${MEILISEARCH_ADMIN_KEY}` },
        signal: ac.signal,
      }
    )
    if (!statsRes.ok) {
      return {
        service: "Meilisearch index",
        status: "degraded",
        latency_ms: Date.now() - start,
        detail: `stats HTTP ${statsRes.status}`,
      }
    }
    const stats = (await statsRes.json()) as { numberOfDocuments?: number }
    const indexed = Number(stats.numberOfDocuments ?? 0)

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { metadata } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { status: "published" },
      pagination: { take: 1, skip: 0 },
    })
    const published = Number((metadata as { count?: number } | undefined)?.count ?? 0)
    const latency = Date.now() - start
    const detail = `${indexed} indexed / ${published} published`

    // No catalog yet (fresh DB) — nothing to compare against.
    if (published === 0) {
      return { service: "Meilisearch index", status: "ok", latency_ms: latency, detail }
    }
    const ratio = indexed / published
    if (ratio < 0.5) {
      return {
        service: "Meilisearch index",
        status: "down",
        latency_ms: latency,
        detail: `${detail} — index gutted, run reindex-meilisearch`,
      }
    }
    if (ratio < 0.9) {
      return {
        service: "Meilisearch index",
        status: "degraded",
        latency_ms: latency,
        detail: `${detail} — drift, reindex may be needed`,
      }
    }
    return { service: "Meilisearch index", status: "ok", latency_ms: latency, detail }
  } catch (err: any) {
    return {
      service: "Meilisearch index",
      status: "down",
      latency_ms: Date.now() - start,
      detail: err?.name === "AbortError" ? "timeout" : err?.message ?? String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // S3-compatible storage health URL: just hit the bucket root. Real MinIO
  // serves `/minio/health/live` but Cloudflare R2 (and other S3 hosts)
  // doesn't implement that path — it returns 400. We treat any HTTP
  // response as reachable because the alternative (the SDK probe) requires
  // signed-request plumbing we don't need just for a liveness check.
  let minioUrl: string | null = null
  if (MINIO_ENDPOINT) {
    const stripped = MINIO_ENDPOINT.replace(/^https?:\/\//, "").replace(/\/$/, "")
    minioUrl = `https://${stripped}/`
  }

  const paypalHost = PAYPAL_IS_SANDBOX
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com"

  const posthogHost = (POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "")

  const checks = await Promise.all([
    checkPostgres(),
    checkRedis(),
    ping("Stripe", {
      configured: Boolean(STRIPE_API_KEY),
      url: "https://api.stripe.com/v1/charges?limit=1",
      headers: STRIPE_API_KEY
        ? { Authorization: `Bearer ${STRIPE_API_KEY}` }
        : undefined,
    }),
    ping("PayPal", {
      configured: Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET),
      // Unauthenticated GET on the OAuth endpoint returns 401 — proves
      // reachability without burning an access token.
      url: `${paypalHost}/v1/oauth2/token`,
      expectedOkStatuses: [200, 401, 405],
    }),
    ping("Resend", {
      configured: Boolean(RESEND_API_KEY),
      url: "https://api.resend.com/domains",
      headers: RESEND_API_KEY
        ? { Authorization: `Bearer ${RESEND_API_KEY}` }
        : undefined,
    }),
    ping("ShipStation", {
      configured: Boolean(SHIPSTATION_API_KEY),
      // /v2/carriers is the smallest auth-gated payload that's documented
      // and stable. /v2/environment/account doesn't exist in the v2 API and
      // returns 404.
      url: "https://api.shipstation.com/v2/carriers",
      headers: SHIPSTATION_API_KEY
        ? { "API-Key": SHIPSTATION_API_KEY }
        : undefined,
    }),
    ping("Australia Post", {
      // Unauthenticated probe of the v1 API root — proves DNS + TCP + TLS
      // without sending creds. 401/403/404 all confirm reachability (the
      // endpoint exists and is rejecting the anonymous call).
      configured: Boolean(AUSPOST_API_KEY),
      url: AUSPOST_TEST_MODE
        ? "https://digitalapi.auspost.com.au/test/shipping/v1/"
        : "https://digitalapi.auspost.com.au/shipping/v1/",
      expectedOkStatuses: [200, 400, 401, 403, 404],
    }),
    ping("Object storage", {
      configured: Boolean(MINIO_ENDPOINT),
      url: minioUrl ?? undefined,
      // R2 returns 400 on the unauth root; MinIO returns 403; both prove
      // reachability. Accept the broad range so we don't false-alarm.
      expectedOkStatuses: [200, 204, 400, 403],
    }),
    ping("AS Colour", {
      configured: Boolean(ASCOLOUR_SUBSCRIPTION_KEY),
      url: ASCOLOUR_BASE_URL
        ? `${ASCOLOUR_BASE_URL.replace(/\/$/, "")}/catalog/products?pageSize=1`
        : undefined,
      headers: ASCOLOUR_SUBSCRIPTION_KEY
        ? { "Subscription-Key": ASCOLOUR_SUBSCRIPTION_KEY }
        : undefined,
    }),
    ping("Meilisearch", {
      configured: Boolean(MEILISEARCH_HOST),
      url: MEILISEARCH_HOST
        ? `${MEILISEARCH_HOST.replace(/\/$/, "")}/health`
        : undefined,
    }),
    checkMeilisearchIndex(req),
    ping("PostHog", {
      configured: Boolean(POSTHOG_PERSONAL_API_KEY && POSTHOG_PROJECT_ID),
      url: `${posthogHost}/api/projects/${POSTHOG_PROJECT_ID}/`,
      headers: POSTHOG_PERSONAL_API_KEY
        ? { Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}` }
        : undefined,
    }),
    ping("Google APIs", {
      configured: Boolean(GOOGLE_SERVICE_ACCOUNT_JSON),
      url: "https://oauth2.googleapis.com/",
      expectedOkStatuses: [200, 400, 404],
    }),
  ])

  const overall: Status = checks.some((c) => c.status === "down")
    ? "down"
    : checks.some((c) => c.status === "degraded")
      ? "degraded"
      : "ok"

  return res.json({
    overall,
    checked_at: new Date().toISOString(),
    services: checks,
  })
}
