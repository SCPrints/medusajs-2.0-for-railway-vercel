/** Placeholder tiles — swap `logoSrc` for `/public/brands/*.svg` when assets are ready. */
export type BrandTile = {
  id: string
  name: string
  initials: string
  /** Tailwind-friendly bg class */
  bgClass: string
  /** Final position angle (radians), clockwise from right */
  angle: number
  /** Multiplier on base radius (0–1.2) */
  radiusScale: number
}

export const BRAND_TILES: BrandTile[] = [
  { id: "as-colour", name: "AS Colour", initials: "AS", bgClass: "bg-zinc-900", angle: 0, radiusScale: 1 },
  { id: "gildan", name: "Gildan", initials: "G", bgClass: "bg-blue-700", angle: 0.55, radiusScale: 0.92 },
  { id: "stanley", name: "Stanley/Stella", initials: "S/S", bgClass: "bg-emerald-800", angle: 1.1, radiusScale: 1 },
  { id: "next-level", name: "Next Level", initials: "NL", bgClass: "bg-slate-700", angle: 1.65, radiusScale: 0.88 },
  { id: "bella-canvas", name: "Bella+Canvas", initials: "B+", bgClass: "bg-rose-800", angle: 2.2, radiusScale: 1 },
  { id: "champion", name: "Champion", initials: "C", bgClass: "bg-red-900", angle: 2.75, radiusScale: 0.95 },
  { id: "nike", name: "Nike", initials: "N", bgClass: "bg-neutral-800", angle: 3.3, radiusScale: 1 },
  { id: "adidas", name: "adidas", initials: "a", bgClass: "bg-slate-900", angle: 3.85, radiusScale: 0.9 },
  { id: "patagonia", name: "Patagonia", initials: "P", bgClass: "bg-amber-900", angle: 4.4, radiusScale: 0.93 },
  { id: "carhartt", name: "Carhartt", initials: "C", bgClass: "bg-orange-950", angle: 5.0, radiusScale: 1 },
  { id: "the-north-face", name: "The North Face", initials: "TNF", bgClass: "bg-black", angle: 5.55, radiusScale: 0.85 },
  { id: "richardson", name: "Richardson", initials: "R", bgClass: "bg-indigo-950", angle: 6.1, radiusScale: 0.96 },
]
