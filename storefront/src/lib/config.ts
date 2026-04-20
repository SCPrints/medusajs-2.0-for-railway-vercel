import Medusa from "@medusajs/js-sdk"

// Defaults to standard port for Medusa server
let MEDUSA_BACKEND_URL = "http://localhost:9000"

if (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) {
  MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
}

export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

// #region agent log
let __agentMedusaConfigLogged = false
if (typeof fetch !== "undefined" && !__agentMedusaConfigLogged) {
  __agentMedusaConfigLogged = true
  try {
    const u = new URL(MEDUSA_BACKEND_URL)
    fetch("http://127.0.0.1:7514/ingest/d011aee9-9c02-46d7-8ea3-0d9f69f8eed0", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "b984c7",
      },
      body: JSON.stringify({
        sessionId: "b984c7",
        location: "config.ts:sdk",
        message: "storefront sdk env",
        data: {
          host: u.host,
          protocol: u.protocol,
          hasPublishableKey: Boolean(
            process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
          ),
        },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {})
  } catch {
    fetch("http://127.0.0.1:7514/ingest/d011aee9-9c02-46d7-8ea3-0d9f69f8eed0", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "b984c7",
      },
      body: JSON.stringify({
        sessionId: "b984c7",
        location: "config.ts:sdk",
        message: "storefront sdk env invalid baseUrl",
        data: {
          baseUrlLen: MEDUSA_BACKEND_URL?.length ?? 0,
          hasPublishableKey: Boolean(
            process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
          ),
        },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {})
  }
}
// #endregion
