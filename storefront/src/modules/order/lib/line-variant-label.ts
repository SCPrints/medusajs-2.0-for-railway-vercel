/**
 * The colour / size to show under an order line ("BLACK / M"), or "" when
 * there's nothing useful to add: no variant, a placeholder variant on a
 * service line ("Default variant", "Standard"), or a title that already says
 * it (quote lines are titled "Chad Polo — COAL / 2XL").
 * Hand-mirror of backend/src/lib/line-variant-label.ts (the invoices use that one).
 */
export function lineVariantLabel(title: unknown, variantTitle: unknown): string {
  const variant = typeof variantTitle === "string" ? variantTitle.trim() : ""
  if (!variant || /^(default( variant)?|standard)$/i.test(variant)) return ""
  const inTitle = String(title ?? "").toLowerCase().includes(variant.toLowerCase())
  return inTitle ? "" : variant
}
