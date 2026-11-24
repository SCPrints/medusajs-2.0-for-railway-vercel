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
