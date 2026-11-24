/**
 * Sizing kit: one blank garment in each size a customer wants to try, paid at
 * the normal price as a deposit. Back within SIZING_KIT_RETURN_DAYS in good
 * order → staff refund the garments (postage isn't refunded). Lines carry
 * `metadata.sizing_kit = true` (server-set only). Pure — admin-safe.
 */
export const SIZING_KIT_RETURN_DAYS = 14
export const SIZING_KIT_MAX_SIZES = 12

export const isSizingKitLine = (meta: unknown): boolean =>
  !!meta && typeof meta === "object" && (meta as Record<string, unknown>).sizing_kit === true

/** The day the kit must be back for a refund. */
export function sizingKitReturnBy(placedAt: Date | string): Date {
  const d = new Date(placedAt)
  d.setDate(d.getDate() + SIZING_KIT_RETURN_DAYS)
  return d
}

/** Variants a kit may hold: 1..MAX, no repeats, all from one product. Returns an error or null. */
export function sizingKitProblem(variants: Array<{ id: string; product_id: string | null }>, wanted: string[]): string | null {
  const unique = [...new Set(wanted)]
  if (unique.length === 0) return "Choose at least one size."
  if (unique.length > SIZING_KIT_MAX_SIZES) return `A sizing kit holds up to ${SIZING_KIT_MAX_SIZES} sizes.`
  if (variants.length !== unique.length) return "One of those sizes isn't available."
  if (new Set(variants.map((v) => v.product_id)).size !== 1) return "A sizing kit is for one garment at a time."
  return null
}

/**
 * The colour's front photo for a kit line's thumbnail (the cart shows the
 * product's main photo otherwise — a blue tee for a Black kit). Supplier
 * photos carry the colour in the file name: "5001_STAPLE_TEE_BLACK__…" (front),
 * "…_BLACK_BACK__…", "jbs-wear/1HT_NAVY_front.jpg". null = no match.
 */
export function colourFrontImage(urls: string[], colour: string | null | undefined): string | null {
  const token = String(colour ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")
  if (!token) return null
  const named = urls.map((url) => ({ url, name: (url.split("?")[0].split("/").pop() ?? "").toUpperCase() }))
  const hit = (re: RegExp) => named.find((n) => re.test(n.name) && !/BACK/.test(n.name))?.url ?? null
  const t = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return hit(new RegExp(`_${t}__`)) ?? hit(new RegExp(`_${t}_FRONT`)) ?? hit(new RegExp(`_${t}(_|\\.)`))
}
