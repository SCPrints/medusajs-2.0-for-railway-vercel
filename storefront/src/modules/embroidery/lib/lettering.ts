import type { ArchMode, LetteringConfig } from "./types"

/** Approximate stitch density baseline per character at 25mm letter height. */
const FONT_BASE_STITCHES: Record<string, number> = {
  block: 110,
  serif: 135,
  script: 165,
  bold: 145,
  condensed: 100,
}

const ARCH_OVERHEAD: Record<ArchMode, number> = {
  straight: 1,
  arch_up: 1.09,
  arch_down: 1.09,
}

const REFERENCE_HEIGHT_MM = 25

export const FONTS = Object.keys(FONT_BASE_STITCHES) as Array<keyof typeof FONT_BASE_STITCHES>

/**
 * Stitch count grows roughly with letter area, not height alone — exponent ~1.4
 * gives a closer fit than linear scaling and matches commercial digitizer rules.
 */
export const calculateLetteringStitches = ({
  text,
  font,
  heightMm,
  archMode,
}: LetteringConfig): number => {
  const trimmed = (text ?? "").replace(/\s+/g, "").length
  if (trimmed === 0 || heightMm <= 0) return 0

  const baseKey = font in FONT_BASE_STITCHES ? font : "block"
  const base = FONT_BASE_STITCHES[baseKey]
  const sizeMultiplier = Math.pow(heightMm / REFERENCE_HEIGHT_MM, 1.4)
  const archMultiplier = ARCH_OVERHEAD[archMode] ?? 1

  return Math.round(trimmed * base * sizeMultiplier * archMultiplier)
}
