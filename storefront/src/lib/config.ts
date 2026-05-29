import Medusa from "@medusajs/js-sdk"

/** Medusa HTTP origin (server + client). Also used for custom store routes (e.g. SCP cart pricing). */
export const MEDUSA_BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.trim() || "http://localhost:9000"

/**
 * Server-side fetch resilience for `next build` + runtime.
 *
 * `next build` statically prerenders many backend-dependent pages. The Medusa
 * SDK (and our raw `/store/*` fetches) use the global `fetch` (undici) with a
 * 10s connect timeout and NO retries — so a single transient ConnectTimeout,
 * when the build's concurrent prerender burst hits a momentarily-busy backend,
 * aborts the ENTIRE build. Observed 2026-05-29: three deploys each died on a
 * different unrelated page (group-order, account/addresses, 3d-print-design)
 * with `UND_ERR_CONNECT_TIMEOUT` to the Fly backend, even though the backend
 * was healthy for normal traffic.
 *
 * We wrap the global fetch to retry ONLY connection-establishment failures —
 * i.e. when `fetch` itself *throws*. A thrown fetch means the request never
 * reached the server, so retrying is safe even for non-idempotent methods.
 * HTTP error responses (4xx/5xx) RESOLVE the promise, so they bypass this
 * entirely and existing error handling is unchanged. Deliberate aborts
 * (AbortController) are never retried.
 *
 * Server-only (the browser keeps its native fetch) and installed once. It
 * lives here, not in `instrumentation.ts`, because this module is imported by
 * every data fetcher via `sdk`, so the wrapper is guaranteed to be in place
 * before any SDK call — including during build-time prerender, where
 * `instrumentation.register()` may not run.
 */
if (
  typeof window === "undefined" &&
  !(globalThis as { __scpFetchRetry?: boolean }).__scpFetchRetry
) {
  ;(globalThis as { __scpFetchRetry?: boolean }).__scpFetchRetry = true
  const nativeFetch = globalThis.fetch.bind(globalThis)
  const MAX_ATTEMPTS = 3
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await nativeFetch(input, init)
      } catch (error) {
        // Don't retry a deliberately-cancelled request.
        if ((error as Error)?.name === "AbortError" || init?.signal?.aborted) {
          throw error
        }
        // Only connection-level failures (DNS/connect/reset) land here —
        // fetch resolves (does not throw) for HTTP error statuses.
        lastError = error
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 300 * attempt))
        }
      }
    }
    throw lastError
  }
}

export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})
