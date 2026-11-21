/**
 * "Order one sample first": which cart lines can be turned into a single
 * garment, and the line metadata that marks it. A sample is just ONE unit at
 * the normal one-off price (never discounted, never credited). Mirror of backend/src/lib/sample-line.ts (keep in step).
 */
export const SCREEN_SAMPLE_MIN = 25
export const HAT_EMBROIDERY_MIN = 10
const HAT_RE = /\b(caps?|hats?|beanies?|visors?|headwear|snapbacks?|trucker)\b/i

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)

/** Why a one-garment sample is not offered, or null when it is. */
export function sampleBlockReason(
  metadata: Record<string, any> | null | undefined,
  title: string | null | undefined
): string | null {
  const design = metadata?.customizerDesign
  if (!isObj(design)) return "No saved design on this line."
  const methods = isObj(design.sideDecorationMethods) ? design.sideDecorationMethods : {}
  const drawn = (Array.isArray(design.artifacts) ? design.artifacts : [])
    .map((a: any) => a?.side)
    .filter((s: unknown): s is string => typeof s === "string")
  const used = new Set<unknown>((drawn.length ? drawn : Object.keys(methods)).map((s: string) => methods[s]))
  if (used.has("screen")) return `Screen printing starts at ${SCREEN_SAMPLE_MIN} garments.`
  if (used.has("embroidery") && HAT_RE.test(title ?? ""))
    return `Embroidered caps start at ${HAT_EMBROIDERY_MIN}.`
  return null
}

/** A sample line is one garment; a changed quantity means it is no longer one. */
export const isSampleLine = (item: { quantity?: number | null; metadata?: any }): boolean =>
  item.metadata?.sample === true && item.quantity === 1
