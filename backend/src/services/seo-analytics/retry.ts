/**
 * Idempotent retry for the GSC/GA4 source fetchers.
 *
 * Why this exists: under Node's native `fetch` (undici, Node 22) the gaxios/
 * google-auth transport keeps connections to Google's OAuth token endpoint in a
 * keep-alive pool. Google closes idle sockets server-side after a few seconds;
 * when undici reuses one in that window the request fails mid-response with
 * "Premature close" (gaxios wraps it as "Invalid response body while trying to
 * fetch https://www.googleapis.com/oauth2/v4/token: Premature close"). It is a
 * transport flake, not an auth/config error — the endpoint itself answers fine,
 * and undici evicts the dead socket on failure, so the very next attempt opens a
 * fresh connection and succeeds.
 *
 * The daily cron makes a single attempt with no retry, so one flake poisons the
 * cached summary for ~24h until the next run. The GSC/GA4 reads are read-only and
 * fully idempotent, so retrying them on transient transport errors is safe.
 */

const TRANSIENT_MESSAGE_FRAGMENTS = [
  "premature close",
  "other side closed",
  "socket hang up",
  "fetch failed",
  "terminated", // undici "terminated" stream error
  "invalid response body", // gaxios v7 wrapper around the underlying socket error
  "econnreset",
  "etimedout",
  "eai_again",
  "enotfound",
  "network",
]

const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ECONNREFUSED",
  "ERR_STREAM_PREMATURE_CLOSE",
])

/**
 * Classifies an error as a transient network/transport failure worth retrying.
 * Deliberately does NOT match auth-config errors (invalid_grant, 401/403,
 * unauthorized_client) — those should fail fast and surface to the operator
 * rather than being masked behind a retry.
 */
export function isTransientNetworkError(err: any): boolean {
  const code = String(err?.code ?? "").toUpperCase()
  if (code.startsWith("UND_ERR")) return true
  if (TRANSIENT_CODES.has(code)) return true

  const status = Number(err?.status ?? err?.response?.status)
  if (status === 429 || (status >= 500 && status <= 599)) return true

  const msg = String(err?.message ?? err).toLowerCase()
  return TRANSIENT_MESSAGE_FRAGMENTS.some((frag) => msg.includes(frag))
}

export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 300

  let lastErr: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const isLast = attempt === attempts - 1
      if (isLast || !isTransientNetworkError(err)) throw err
      // Exponential backoff: 300ms, 600ms, … — small, since the dead socket is
      // already evicted and the next attempt usually succeeds immediately.
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * Math.pow(2, attempt))
      )
    }
  }
  throw lastErr
}
