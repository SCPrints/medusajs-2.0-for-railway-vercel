import type { GarmentKind } from "@modules/common/components/games/garment-glyphs"

/** Per-piece-type tile colour (I, O, T, S, Z, J, L). Brand palette: teal /
 * magenta / soft-light plus wordmark-gradient stops so the stack reads like
 * the swatch rail on the product grid. */
export const PIECE_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [61, 207, 194], // I — teal (brand-accent)
  [255, 46, 99], // O — magenta (brand-secondary)
  [238, 238, 238], // T — soft light (brand-background)
  [69, 164, 255], // S — blue
  [255, 193, 69], // Z — yellow
  [181, 86, 255], // J — violet
  [255, 107, 53], // L — orange
]

/** Which garment is printed on each piece type's tiles. */
export const PIECE_GARMENT: readonly GarmentKind[] = [
  "tee", // I
  "cap", // O
  "hoodie", // T
  "polo", // S
  "singlet", // Z
  "beanie", // J
  "tote", // L
]
