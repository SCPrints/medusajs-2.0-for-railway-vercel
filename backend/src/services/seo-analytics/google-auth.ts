import { google } from "googleapis"

import {
  GOOGLE_SERVICE_ACCOUNT_JSON,
  SEO_IMPERSONATION_USER,
} from "../../lib/constants"

// google-auth-library is a transitive dep of googleapis (not a direct dep
// in package.json), so importing types from it doesn't resolve in tsc.
// Pull the JWT type out of googleapis itself.
type GoogleJwt = InstanceType<typeof google.auth.JWT>

type ServiceAccountKey = {
  client_email: string
  private_key: string
  project_id?: string
}

let cachedKey: ServiceAccountKey | null = null

// One JWT auth client per (scopes, subject) for the life of the process. The
// JWT instance caches its OAuth access token internally and refreshes it ~hourly
// (gtoken dedupes concurrent refreshes), so reusing a single instance across
// every GA4/GSC report route collapses what used to be ~one token fetch *per
// route per tab load* — ≈6 simultaneous POSTs to Google's token endpoint, the
// concurrency that made the undici "Premature close" flake (see retry.ts) so
// visible — down to a single hourly refresh. Cleared on process restart, which
// is exactly when a rotated service-account secret redeploys anyway.
const jwtCache = new Map<string, GoogleJwt>()

/**
 * Parses GOOGLE_SERVICE_ACCOUNT_JSON once and caches the result. Throws a clear,
 * actionable error if the env var is missing or malformed so misconfiguration is
 * obvious in boot logs rather than buried in a 500.
 */
export function getServiceAccountKey(): ServiceAccountKey {
  if (cachedKey) return cachedKey

  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not set — paste the full service-account JSON key into env."
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON)
  } catch (err: any) {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ${err?.message ?? err}`
    )
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as any).client_email !== "string" ||
    typeof (parsed as any).private_key !== "string"
  ) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key."
    )
  }

  cachedKey = parsed as ServiceAccountKey
  return cachedKey
}

export function isSeoConfigured(): boolean {
  return Boolean(GOOGLE_SERVICE_ACCOUNT_JSON)
}

/**
 * Returns the Workspace user email to impersonate via Domain-Wide Delegation,
 * or undefined when DWD isn't configured. When defined, the GSC + GA4 clients
 * authenticate as this user instead of as the service account itself —
 * sidestepping the need to add the SA to GSC/GA4 user lists when Google's IAM
 * rejects external service account emails.
 */
export function getImpersonationSubject(): string | undefined {
  const trimmed = SEO_IMPERSONATION_USER?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

/**
 * Builds a Google JWT auth client for the given OAuth scopes. Automatically
 * sets `subject` when SEO_IMPERSONATION_USER is configured (DWD path), so
 * every consumer inherits impersonation without each one having to know
 * about it. Use this everywhere instead of `new google.auth.JWT(...)` —
 * inline JWT construction will silently miss the DWD wiring.
 */
export function buildGoogleJwt(scopes: string[]): GoogleJwt {
  const key = getServiceAccountKey()
  const subject = getImpersonationSubject()

  const cacheKey = `${[...scopes].sort().join(",")}|${subject ?? ""}`
  const cached = jwtCache.get(cacheKey)
  if (cached) return cached

  const jwt = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes,
    subject,
  })
  forceNativeFetchTransport(jwt)
  jwtCache.set(cacheKey, jwt)
  return jwt
}

/**
 * Points gaxios at Node's native `fetch` (undici) instead of its bundled
 * node-fetch transport.
 *
 * ROOT CAUSE of the "Invalid response body while trying to fetch
 * https://www.googleapis.com/oauth2/v4/token: Premature close" failure that
 * blanked the SEO + Acquisition report tabs: google.auth.JWT resolves to
 * google-auth-library@9 → gaxios@6 → node-fetch@3.3.2, and node-fetch throws a
 * spurious ERR_STREAM_PREMATURE_CLOSE on Node 22 (the Fly runtime) when the
 * token endpoint closes the connection. It is deterministic — not a transient
 * flake — so retries can't help. Verified on the live Fly machine: raw undici
 * `fetch` and `https` to the same URL succeed every time while gaxios-via-
 * node-fetch fails every time; swapping in native fetch makes the token fetch
 * AND the GSC/GA4 data calls (which route authorized requests through this same
 * transporter) succeed 3/3.
 */
function forceNativeFetchTransport(jwt: GoogleJwt): void {
  const transporter = (jwt as any).transporter
  if (!transporter) return
  transporter.defaults = transporter.defaults || {}
  transporter.defaults.fetchImplementation = (...args: any[]) =>
    (globalThis as any).fetch(...args)
}
