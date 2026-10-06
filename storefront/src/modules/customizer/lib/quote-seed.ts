import type { CustomizerMetadata, GarmentSide, ScreenConfig } from "./types"
import type { ScpPrintSizeId } from "./scp-dtf-print-pricing"

/**
 * Job-pricer → Studio handoff seed. The admin Job pricer encodes the group's
 * colour, size run and positions as base64url JSON in `?seed=`; when the quote
 * group has no saved design yet, the customiser turns it into a partial
 * CustomizerMetadata and runs it through the normal rehydration path, so the
 * Studio opens with the right sides / techniques / sizes / quantities
 * pre-selected and staff only place the artwork. Contract mirrored in
 * backend/src/admin/routes/quote-pricer/page.tsx (`buildStudioSeed`).
 */
export type JobPricerSeed = {
  v: 1
  variant?: string | null
  sizes?: Array<{ size: string; quantity: number }>
  sides: Array<{
    side: GarmentSide
    method: "print" | "screen" | "embroidery"
    sizeId?: ScpPrintSizeId
    colours?: number
    dark?: boolean
  }>
}

const SIDES = new Set<GarmentSide>(["front", "back", "left_sleeve", "right_sleeve", "printed_tag"])
const SIZES = new Set<ScpPrintSizeId>(["up_to_a6", "up_to_a4", "up_to_a3", "oversize"])

export function decodeJobPricerSeed(raw: string | null | undefined): JobPricerSeed | null {
  if (!raw) return null
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/")
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
    const seed = JSON.parse(json) as JobPricerSeed
    if (seed?.v !== 1 || !Array.isArray(seed.sides)) return null
    return seed
  } catch {
    return null
  }
}

/** Partial metadata the hydration effect accepts — every field it reads is guarded. */
export function seedToCustomizerMetadata(seed: JobPricerSeed, variantIds: string[]): CustomizerMetadata | null {
  const sides = seed.sides.filter((s) => SIDES.has(s.side))
  if (!sides.length) return null
  const sideDecorationMethods: CustomizerMetadata["sideDecorationMethods"] = {}
  const sideScreenConfigs: Partial<Record<GarmentSide, ScreenConfig>> = {}
  const prints: Array<{ side: GarmentSide; sizeId: ScpPrintSizeId }> = []
  for (const s of sides) {
    sideDecorationMethods[s.side] = s.method
    if (s.method === "screen") {
      sideScreenConfigs[s.side] = { side: s.side, colours: Math.min(6, Math.max(1, s.colours ?? 1)), darkGarment: s.dark === true, coloursAuto: false }
    }
    if (s.method === "print" && s.sizeId && SIZES.has(s.sizeId)) prints.push({ side: s.side, sizeId: s.sizeId })
  }
  const variantId = seed.variant && variantIds.includes(seed.variant) ? seed.variant : undefined
  const sizes = (seed.sizes ?? []).filter((x) => typeof x?.size === "string" && Number(x.quantity) > 0).map((x) => ({ size: x.size, quantity: Math.floor(Number(x.quantity)) }))
  return {
    version: 3,
    type: "fabric_customizer",
    ...(variantId ? { variantId } : {}),
    ...(sizes.length ? { sizes } : {}),
    sideDecorationMethods,
    ...(Object.keys(sideScreenConfigs).length ? { sideScreenConfigs } : {}),
    ...(prints.length ? { prints } : {}),
    activeSide: sides[0].side,
  } as unknown as CustomizerMetadata
}
