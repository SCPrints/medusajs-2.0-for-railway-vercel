"use server"

import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"
import { cache } from "react"

import { getAuthHeaders } from "./cookies"

export type ConsentState = {
  marketing_consent_email: boolean | null
  marketing_consent_sms: boolean | null
  marketing_consent_retargeting: boolean | null
  marketing_consent_updated_at: string | null
  marketing_consent_source: string | null
}

const CONSENT_TAG = "customer-consent"

// Per-customer data — deliberately uncached. (A previous version passed
// `next: { tags }` inside `headers`, which the Medusa SDK coerces to a junk
// HTTP header; it never did anything. CONSENT_TAG is still used for
// router-cache revalidation after mutations below.)

export const getConsent = cache(async function (): Promise<ConsentState | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return null
  }
  try {
    const res = (await sdk.client.fetch("/store/customers/me/consent", {
      headers: { ...headers },
    })) as ConsentState
    return res
  } catch {
    return null
  }
})

export async function updateConsent(input: {
  marketing_consent_email?: boolean
  marketing_consent_sms?: boolean
  marketing_consent_retargeting?: boolean
}): Promise<{ ok: true; consent: ConsentState } | { ok: false; error: string }> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { ok: false, error: "Sign in to update preferences." }
  }
  try {
    const res = (await sdk.client.fetch("/store/customers/me/consent", {
      method: "POST",
      headers,
      body: input,
    })) as ConsentState
    revalidateTag(CONSENT_TAG, "max")
    return { ok: true, consent: res }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update preferences.",
    }
  }
}
