const LOGO_BASE = "/images/brands/logos"

export type BrandTile = {
  id: string
  name: string
  initials: string
  /** Tailwind-friendly bg class when no logo or image failed to load */
  bgClass: string
  /** Optional logo for the brands hero ring */
  logoSrc?: string
  /** Store filter value for `?brand=`; defaults to `name` if omitted */
  storeQuery?: string
}

export const BRAND_TILES: BrandTile[] = [
  {
    id: "as-colour",
    name: "AS Colour",
    initials: "AS",
    bgClass: "bg-zinc-900",
    logoSrc: `${LOGO_BASE}/as-colour.png`,
  },
  {
    id: "gildan",
    name: "Gildan",
    initials: "G",
    bgClass: "bg-blue-700",
    logoSrc: `${LOGO_BASE}/gildan.png`,
  },
  {
    id: "syzmik",
    name: "Syzmik",
    initials: "SY",
    bgClass: "bg-slate-800",
  },
  {
    id: "biz-collection",
    name: "Biz Collection",
    initials: "B+",
    bgClass: "bg-rose-800",
    logoSrc: `${LOGO_BASE}/biz-collection.png`,
  },
  {
    id: "american-apparel",
    name: "American Apparel",
    initials: "AA",
    bgClass: "bg-neutral-800",
    logoSrc: `${LOGO_BASE}/american-apparel.png`,
  },
  {
    id: "anvil",
    name: "Anvil",
    initials: "A",
    bgClass: "bg-slate-700",
    logoSrc: `${LOGO_BASE}/anvil.png`,
  },
  {
    id: "dnc",
    name: "DNC Workwear",
    initials: "DNC",
    bgClass: "bg-zinc-600",
    logoSrc: `${LOGO_BASE}/dnc.png`,
  },
  {
    id: "grace",
    name: "Grace Collection",
    initials: "GC",
    bgClass: "bg-stone-500",
    logoSrc: `${LOGO_BASE}/grace.png`,
  },
  { id: "stanley", name: "Stanley/Stella", initials: "S/S", bgClass: "bg-emerald-800" },
  { id: "next-level", name: "Next Level", initials: "NL", bgClass: "bg-slate-700" },
  { id: "champion", name: "Champion", initials: "C", bgClass: "bg-red-900" },
  { id: "patagonia", name: "Patagonia", initials: "P", bgClass: "bg-amber-900" },
]
