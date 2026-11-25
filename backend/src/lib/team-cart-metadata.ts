/**
 * Team-order notes live on cart.metadata, but removing lines never clears
 * them, and Medusa copies cart.metadata onto the order. So a cart whose team
 * lines were removed would still tell staff to post packs to people's homes or
 * pack by a people list. Pure — admin-safe.
 */
type Line = { metadata?: Record<string, unknown> | null }

const TEAM_KEYS = ["roster", "packing", "personalisation_requested", "names_numbers"] as const

/** The metadata without notes for lines that are gone, or null when nothing changes. */
export function dropStaleTeamCartMetadata(
  metadata: Record<string, unknown> | null | undefined,
  items: Line[] | null | undefined
): Record<string, unknown> | null {
  if (!metadata) return null
  const lines = items ?? []
  const next = { ...metadata }
  let changed = false
  if ("home_delivery" in next && !lines.some((l) => l?.metadata?.home_delivery_postage === true)) {
    delete next.home_delivery
    changed = true
  }
  if (!lines.some((l) => typeof l?.metadata?.organisation_id === "string")) {
    for (const k of TEAM_KEYS) {
      if (k in next) {
        delete next[k]
        changed = true
      }
    }
  }
  return changed ? next : null
}
