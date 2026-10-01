/**
 * Editorial data for the Shaka Wear guide. Facts that can change (colours,
 * sizes, photos, size charts, GSM) are read live from the products; only the
 * things a product record can't say — how each cut wears and how the fit
 * finder classifies it — live here. Keyed by product handle.
 */

export type ShakaCut = "standard" | "oversized" | "drop" | "cropped"
export type ShakaFinish = "classic" | "garment-dye"
export type ShakaSleeve = "short" | "long"

export type ShakaStyle = {
  handle: string
  code: string
  /** Short display name (the product title minus the brand and weight). */
  name: string
  cut: ShakaCut
  finish: ShakaFinish
  sleeve: ShakaSleeve
  fitLabel: string
  take: string
}

export const SHAKA_STYLES: ShakaStyle[] = [
  {
    handle: "shaka-wear-max-heavyweight-tee",
    code: "10M-001",
    name: "Max Heavyweight Tee",
    cut: "standard",
    finish: "classic",
    sleeve: "short",
    fitLabel: "Standard fit",
    take: "The original. Boxy through the body, standard length. If you only try one, start here.",
  },
  {
    handle: "shaka-wear-max-heavyweight-oversized-tee",
    code: "10M-005",
    name: "Oversized Tee",
    cut: "oversized",
    finish: "classic",
    sleeve: "short",
    fitLabel: "Oversized",
    take: "Wider body, wide sleeves, shorter length. The streetwear cut, with room for a big print.",
  },
  {
    handle: "shaka-wear-max-heavyweight-garment-dye-tee",
    code: "10M-002",
    name: "Garment Dye Tee",
    cut: "oversized",
    finish: "garment-dye",
    sleeve: "short",
    fitLabel: "Slightly oversized",
    take: "Washed, lived-in colour straight out of the box. Runs a little roomy in the chest and length.",
  },
  {
    handle: "shaka-wear-garment-dye-drop-shoulder-tee",
    code: "10M-003",
    name: "Garment Dye Drop Shoulder",
    cut: "drop",
    finish: "garment-dye",
    sleeve: "short",
    fitLabel: "Drop shoulder",
    take: "The shoulder seam sits down the arm. Wide, short and washed, with a ribbed collar.",
  },
  {
    handle: "shaka-wear-max-heavyweight-cropped-tee",
    code: "10M-006",
    name: "Cropped Tee",
    cut: "cropped",
    finish: "classic",
    sleeve: "short",
    fitLabel: "Cropped",
    take: "The Max Heavyweight cut to the waist. Relaxed and boxy, same fabric, same collar.",
  },
  {
    handle: "shaka-wear-max-heavyweight-long-sleeve-tee",
    code: "10M-104",
    name: "Long Sleeve Tee",
    cut: "standard",
    finish: "classic",
    sleeve: "long",
    fitLabel: "Standard fit",
    take: "The original with full sleeves. Same weight, so it works as a layer or on its own.",
  },
]

export const CUT_LABEL: Record<ShakaCut, string> = {
  standard: "Standard",
  oversized: "Oversized",
  drop: "Drop shoulder",
  cropped: "Cropped",
}
export const FINISH_LABEL: Record<ShakaFinish, string> = {
  classic: "Classic",
  "garment-dye": "Garment dye",
}
export const SLEEVE_LABEL: Record<ShakaSleeve, string> = {
  short: "Short sleeve",
  long: "Long sleeve",
}
