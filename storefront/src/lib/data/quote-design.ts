"use server"

import { sdk } from "@lib/config"
import type { CustomizerMetadata } from "@modules/customizer/lib/types"

/**
 * Fetch the saved CustomizerMetadata for a quote design group so the Studio can
 * REHYDRATE it on "Edit design in Studio" (colour + artwork per side). Verified
 * by the same `qsig` the design-link minted. Returns null when the group has no
 * saved design yet (a fresh "Design in Studio" with no group).
 */
export async function getQuoteGroupDesign(
  quoteId: string,
  qsig: string,
  group: string
): Promise<CustomizerMetadata | null> {
  try {
    const res = (await sdk.client.fetch(
      `/store/quotes/${quoteId}/design-items`,
      { query: { qsig, group } }
    )) as { customizerDesign?: CustomizerMetadata | null }
    return res?.customizerDesign ?? null
  } catch {
    return null
  }
}
