/**
 * Editorial data for the AS Colour guide. Weights, fits, colour counts,
 * photos and product types are read live from the products; this file only
 * decides WHICH styles are featured and how the tee finder classifies them.
 */

export const asColourHandle = (code: string) => `as-colour-${code}-${code}`.toLowerCase()

/** Short-sleeve tees offered in the finder. Order is not significant. */
export const TEE_CODES = [
  "5051", "5001", "5001g", "5065", "5050", "5052", "5026", "5069", "5085", "5030", "5082", "5080",
  "4051", "4001", "4006", "4062", "4026", "4082", "4080",
]

/** The mens/unisex weight ladder, lightest to heaviest (re-sorted by live GSM). */
export const TEE_LADDER_CODES = ["5051", "5001", "5050", "5026", "5082", "5080"]

/** Fleece ranges: one hood + one crew per weight. */
export const FLEECE_RANGES: { name: string; hood: string; crew: string; note: string }[] = [
  { name: "Supply", hood: "5101", crew: "5100", note: "The everyday mid weight." },
  { name: "Relax", hood: "5161", crew: "5160", note: "A relaxed cut." },
  { name: "Stencil", hood: "5102", crew: "5103", note: "A step heavier, regular fit." },
  { name: "Heavy", hood: "5146", crew: "5145", note: "Oversized and substantial." },
  { name: "Made", hood: "5151", crew: "5150", note: "All-cotton French terry, the heaviest." },
]

/** One representative style per garment type for "The range." tiles. */
export const RANGE_TILES: { label: string; code: string; blurb: string }[] = [
  { label: "T-shirts", code: "5001", blurb: "Staple, Classic, Block, Heavy and their oversized, faded and organic versions." },
  { label: "Hoodies", code: "5102", blurb: "Pullover and zip hoods from mid weight to very heavy." },
  { label: "Crews", code: "5160", blurb: "The same fleece ranges without the hood, plus half zips." },
  { label: "Headwear", code: "1154", blurb: "Caps, truckers, cord caps and bucket hats." },
  { label: "Tanks", code: "5025", blurb: "Singlets and tanks, mens and womens." },
  { label: "Polos", code: "5402", blurb: "Cotton and pique polos, and an active work polo." },
  { label: "Shirts", code: "5401", blurb: "Oxford, drill, cord and flannel shirts." },
  { label: "Jackets", code: "5527", blurb: "Canvas, chore and work jackets." },
  { label: "Bags", code: "1001", blurb: "Canvas totes in a wide colour range." },
]

export const FEATURED_CODES = Array.from(
  new Set([
    ...TEE_CODES,
    ...TEE_LADDER_CODES,
    ...FLEECE_RANGES.flatMap((r) => [r.hood, r.crew]),
    ...RANGE_TILES.map((t) => t.code),
  ])
)

/** The style whose colours fill the colour wall. */
export const COLOUR_WALL_CODE = "5001"

export type Weight = "light" | "mid" | "heavy"
export type Fit = "regular" | "relaxed" | "oversized" | "cropped"
export type Cut = "mens" | "womens"

export const WEIGHT_LABEL: Record<Weight, string> = {
  light: "Light",
  mid: "Mid weight",
  heavy: "Heavy",
}
export const FIT_LABEL: Record<Fit, string> = {
  regular: "Regular",
  relaxed: "Relaxed",
  oversized: "Oversized or boxy",
  cropped: "Cropped",
}
export const CUT_LABEL: Record<Cut, string> = {
  mens: "Mens and unisex",
  womens: "Womens",
}

/** AS Colour's own bands: 160 is "light weight", 180–200 "mid weight", 220+ "heavy weight". */
export function weightBand(gsm: number | null): Weight | null {
  if (!gsm) return null
  if (gsm < 170) return "light"
  if (gsm < 220) return "mid"
  return "heavy"
}

/**
 * The cut named in the title wins over the fit tip (a "Wo's Crop Tee" is
 * tipped "Relaxed fit" but people look for it as cropped). No tip and no cue
 * in the name falls back to regular.
 */
export function fitClass(title: string, fitTip: string | null): Fit {
  const t = title.toLowerCase()
  if (/\bcrop\b/.test(t)) return "cropped"
  if (/\boversized\b|\bbox\b/.test(t)) return "oversized"
  const tip = (fitTip ?? "").toLowerCase()
  if (tip.includes("oversized")) return "oversized"
  if (tip.includes("relaxed")) return "relaxed"
  return "regular"
}

export const cutOf = (title: string): Cut => (/^wo'?s\b/i.test(title) ? "womens" : "mens")

/** How to read an AS Colour style name. */
export const NAME_DECODER: { term: string; meaning: string }[] = [
  { term: "Wo's", meaning: "Cut for women. The same name without it is the mens or unisex version." },
  { term: "L/S", meaning: "Long sleeve." },
  { term: "Minus [-5cm]", meaning: "The same tee, five centimetres shorter in the body." },
  { term: "Plus [+5cm]", meaning: "The same tee, five centimetres longer in the body." },
  { term: "Oversized", meaning: "A wider, roomier version of the range it is named after." },
  { term: "Crop", meaning: "Cut short, to sit at the waist." },
  { term: "Faded", meaning: "Finished for a worn-in, faded colour." },
  { term: "Stone Wash", meaning: "Stone washed for a vintage look." },
  { term: "Organic", meaning: "Made from organic cotton." },
  { term: "Zip", meaning: "A hood or crew with a zip. Half Zip stops at the chest." },
]
