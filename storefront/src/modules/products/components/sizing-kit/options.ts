import { HttpTypes } from "@medusajs/types"

import { isColorOptionTitle } from "@modules/products/lib/variant-options"

export type SizingKitOptions = Array<{ colour: string; sizes: Array<{ size: string; variant_id: string }> }>

/**
 * Colour → sizes for the sizing-kit picker, from the product's variant
 * options (falls back to "Colour / Size" variant titles). Empty when the
 * garment has fewer than two sizes — nothing to try on.
 */
export function sizingKitOptions(product: HttpTypes.StoreProduct): SizingKitOptions {
  const colourOptId = product.options?.find((o) => isColorOptionTitle(o.title))?.id
  const byColour = new Map<string, Array<{ size: string; variant_id: string }>>()
  for (const v of product.variants ?? []) {
    const opts = v.options ?? []
    let colour = colourOptId ? opts.find((o) => o.option_id === colourOptId)?.value : undefined
    let size = opts.find((o) => o.option_id !== colourOptId)?.value
    if (!colour || !size) {
      const [c, s] = String(v.title ?? "").split(" / ")
      colour = colour || (s ? c : "Standard")
      size = size || s || c
    }
    if (!v.id || !size) continue
    const list = byColour.get(colour) ?? []
    list.push({ size, variant_id: v.id })
    byColour.set(colour, list)
  }
  const out = [...byColour.entries()].map(([colour, sizes]) => ({ colour, sizes }))
  return out.some((c) => c.sizes.length >= 2) ? out.filter((c) => c.sizes.length >= 2) : []
}
