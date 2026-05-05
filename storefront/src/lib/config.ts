import Medusa from "@medusajs/js-sdk"

/** Medusa HTTP origin (server + client). Also used for custom store routes (e.g. SCP cart pricing). */
export const MEDUSA_BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.trim() || "http://localhost:9000"

export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})
