/** Placeholder tiles — swap `logoSrc` for `/public/brands/*.svg` when assets are ready. */
export type BrandTile = {
  id: string
  name: string
  initials: string
  /** Tailwind-friendly bg class */
  bgClass: string
}

export const BRAND_TILES: BrandTile[] = [
  { id: "as-colour", name: "AS Colour", initials: "AS", bgClass: "bg-zinc-900" },
  { id: "gildan", name: "Gildan", initials: "G", bgClass: "bg-blue-700" },
  { id: "stanley", name: "Stanley/Stella", initials: "S/S", bgClass: "bg-emerald-800" },
  { id: "next-level", name: "Next Level", initials: "NL", bgClass: "bg-slate-700" },
  { id: "bella-canvas", name: "Bella+Canvas", initials: "B+", bgClass: "bg-rose-800" },
  { id: "champion", name: "Champion", initials: "C", bgClass: "bg-red-900" },
  { id: "nike", name: "Nike", initials: "N", bgClass: "bg-neutral-800" },
  { id: "adidas", name: "adidas", initials: "a", bgClass: "bg-slate-900" },
  { id: "patagonia", name: "Patagonia", initials: "P", bgClass: "bg-amber-900" },
  { id: "carhartt", name: "Carhartt", initials: "C", bgClass: "bg-orange-950" },
  { id: "the-north-face", name: "The North Face", initials: "TNF", bgClass: "bg-black" },
  { id: "richardson", name: "Richardson", initials: "R", bgClass: "bg-indigo-950" },
]
