/**
 * Pure helpers for putting a finished job's designs into an organisation's
 * range (admin job window → "Add to organisation range") and for the
 * organisation's pricing tier. No framework imports: admin-safe.
 */
import { classifyReorderLines, type OrderLineLike } from "./reorder-lines"
import { TIERS, getTierByName, getTierBySlug, type Tier } from "./customer-tiers"

export type RangeGroup = {
  /** customizerDesign.group_id, else the line id: one design per group. */
  group_key: string
  line: OrderLineLike
  /** "AS Colour Staple Tee — Black": garment + colour, no size. */
  title: string
}

/** One entry per Studio design on the order (all its sizes share one design). */
export function rangeGroupsFromOrder(items: OrderLineLike[]): RangeGroup[] {
  const { design } = classifyReorderLines(items)
  const byKey = new Map<string, RangeGroup>()
  for (const line of design) {
    const key = String(line.metadata?.customizerDesign?.group_id || line.id)
    if (byKey.has(key)) continue
    const garment = line.product_title || line.title || "Design"
    // Variant titles read "Colour / Size"; keep the colour only.
    const colour = String(line.variant_title ?? "").split(" / ")[0]?.trim()
    byKey.set(key, { group_key: key, line, title: colour ? `${garment} — ${colour}` : garment })
  }
  return Array.from(byKey.values())
}

/** The design's front mockup, else any mockup, else null. */
export function designThumbnail(design: Record<string, any> | null | undefined): string | null {
  const artifacts = Array.isArray(design?.artifacts) ? (design!.artifacts as any[]) : []
  const mockups = artifacts.filter((a) => typeof a?.mockupUrl === "string" && a.mockupUrl)
  return (mockups.find((a) => a.side === "front") ?? mockups[0])?.mockupUrl ?? null
}

/**
 * The tier an organisation's `default_pricing_tier` names. Accepts the slug
 * ("silver"), the group name ("Tier: Silver") or the plain label ("Silver"),
 * any case. Anything else → null (no tier applied).
 */
export function orgTier(value: string | null | undefined): Tier | null {
  const v = String(value ?? "").trim()
  if (!v) return null
  const lower = v.toLowerCase()
  return (
    getTierBySlug(lower.replace(/\s+/g, "_")) ??
    getTierByName(v) ??
    TIERS.find((t) => t.name.toLowerCase() === lower || t.name.toLowerCase() === `tier: ${lower}`) ??
    null
  )
}
