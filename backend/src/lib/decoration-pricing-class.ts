/**
 * Which decoration pricing a garment gets, from its fabric. Pure.
 *
 * - Technical fabrics (softshell, nylon, PVC, polyurethane, puffer): "quote_only".
 * - 80% or more polyester: "supacolour" (DTF struggles on poly; Sean, 24 Nov 2026,
 *   raised from the August 2026 65%).
 * - Everything else: null = standard DTF.
 *
 * The fabric often lives only in the description ("100% Polyester for
 * durability…" on JB's / Podium), so material, title, type AND description
 * are read. That gap left 180 poly garments unflagged until Nov 2026.
 */
export const SUPACOLOUR_POLY_THRESHOLD = 80

export type DecorationPricingClass = "supacolour" | "quote_only"

export function classifyDecorationPricing(p: {
  title?: string | null
  material?: string | null
  description?: string | null
  type?: string | null
}): { cls: DecorationPricingClass | null; polyPct: number | null; reason: string } {
  const named = `${p.title ?? ""} ${p.type ?? ""} ${p.material ?? ""}`
  if (/softshell|soft shell|nylon|pvc|polyurethane|puffer/i.test(named)) {
    return { cls: "quote_only", polyPct: null, reason: "technical fabric" }
  }
  const text = `${p.material ?? ""} ${p.description ?? ""}`
  let pct: number | null = null
  for (const m of text.matchAll(/(\d{2,3})\s*%\s*(?:recycled\s+)?poly/gi)) pct = Math.max(pct ?? 0, Number(m[1]))
  if (pct === null) return { cls: null, polyPct: null, reason: "no polyester % stated" }
  return pct >= SUPACOLOUR_POLY_THRESHOLD
    ? { cls: "supacolour", polyPct: pct, reason: `${pct}% polyester` }
    : { cls: null, polyPct: pct, reason: `${pct}% polyester, below ${SUPACOLOUR_POLY_THRESHOLD}%` }
}
