/**
 * Pure helpers for the Meta Conversions API (server-side).
 *
 * Server-only — imports `crypto`. Never import from client code; the
 * client shares the dedup event_id via `metaPurchaseEventId` in
 * @lib/analytics, which stays crypto-free.
 *
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api
 */
import { createHash } from "crypto"

/** Meta requires user identifiers trimmed, lowercased, then SHA-256 hex. */
export const hashEmail = (email: string): string =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex")

export type CapiPurchaseInput = {
  /** Shared with the browser pixel so Meta dedups the two events. */
  event_id: string
  /** Unix seconds. */
  event_time: number
  event_source_url?: string
  value: number
  currency: string
  content_ids?: string[]
  email?: string | null
  client_ip_address?: string
  client_user_agent?: string
  /** _fbp / _fbc first-party cookies — big lift to match quality when present. */
  fbp?: string
  fbc?: string
}

/**
 * Builds one Conversions API `Purchase` event. Only sets user_data /
 * custom_data keys that are actually present — Meta rejects empty-string
 * identifiers.
 */
export const buildCapiEvent = (input: CapiPurchaseInput) => {
  const user_data: Record<string, unknown> = {}
  if (input.email) user_data.em = [hashEmail(input.email)]
  if (input.client_ip_address) user_data.client_ip_address = input.client_ip_address
  if (input.client_user_agent) user_data.client_user_agent = input.client_user_agent
  if (input.fbp) user_data.fbp = input.fbp
  if (input.fbc) user_data.fbc = input.fbc

  const custom_data: Record<string, unknown> = {
    value: input.value,
    currency: input.currency,
  }
  if (input.content_ids?.length) {
    custom_data.content_ids = input.content_ids
    custom_data.content_type = "product"
  }

  return {
    event_name: "Purchase",
    event_time: input.event_time,
    event_id: input.event_id,
    action_source: "website",
    ...(input.event_source_url ? { event_source_url: input.event_source_url } : {}),
    user_data,
    custom_data,
  }
}
