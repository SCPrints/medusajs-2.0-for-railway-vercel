/**
 * Pre-computed listing-card payload — storefront mirror of
 * `backend/src/lib/listing-summary.ts`.
 *
 * Hand-mirrored: if the backend type changes, change this file too. Both apps
 * share `version: 1` as the contract. If the contract changes, bump version
 * and gate readers below so a partially-deployed mismatch falls back to the
 * existing variant-iteration path instead of rendering wrong cards.
 */

import type { HttpTypes } from "@medusajs/types"

export type ListingSummaryColor = {
  value: string
  image_url: string
}

export type ListingSummary = {
  version: 1
  colors: ListingSummaryColor[]
  cheapest_amount: number
  hundred_plus_amount: number | null
  currency_code: string
  computed_at: string
}

/**
 * Returns the `listing_summary` blob on a product if present and the version
 * matches what this storefront knows how to render. Anything else returns null
 * — caller should fall back to the variant-iteration path.
 */
export function readListingSummary(
  product: HttpTypes.StoreProduct | undefined
): ListingSummary | null {
  if (!product) return null
  const metadata = (product.metadata ?? {}) as Record<string, unknown>
  const raw = metadata.listing_summary
  if (!raw || typeof raw !== "object") return null
  const s = raw as Partial<ListingSummary>
  if (s.version !== 1) return null
  if (!Array.isArray(s.colors)) return null
  if (typeof s.cheapest_amount !== "number") return null
  if (typeof s.currency_code !== "string" || s.currency_code.length === 0) {
    return null
  }
  // hundred_plus_amount is allowed to be number or null; reject other shapes.
  if (
    s.hundred_plus_amount !== null &&
    typeof s.hundred_plus_amount !== "number"
  ) {
    return null
  }
  // Lightly validate colour entries — empty arrays are allowed (the card has a
  // "Color options on product page" fallback for colourless products).
  for (const c of s.colors) {
    if (
      !c ||
      typeof c.value !== "string" ||
      typeof c.image_url !== "string"
    ) {
      return null
    }
  }
  return s as ListingSummary
}
