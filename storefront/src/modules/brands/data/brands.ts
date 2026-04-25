const LOGO_BASE = "/images/brands/logos"

/** Canonical `?brand=` for the Ramo storefront (maps to Stanley/Stella supplier metadata in filters) */
export const RAMO_BRAND_QUERY = "Ramo"

/**
 * @deprecated Kept for bookmarks / old links. Prefer {@link RAMO_BRAND_QUERY}.
 * Product filtering for both values is handled in the storefront product list.
 */
export const STANLEY_STELLA_BRAND_FILTER = "Stanley/Stella"

export function isRamoStoreBrand(brand?: string | null): boolean {
  const b = brand?.trim()
  if (!b) {
    return false
  }
  return b === RAMO_BRAND_QUERY || b === STANLEY_STELLA_BRAND_FILTER
}

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
    logoSrc: `${LOGO_BASE}/syzmik-workwear.svg`,
  },
  {
    id: "biz-collection",
    name: "Biz Collection",
    initials: "B+",
    bgClass: "bg-rose-800",
    logoSrc: `${LOGO_BASE}/biz-collection.svg`,
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
    logoSrc: `${LOGO_BASE}/grace.svg`,
  },
  {
    id: "ramo",
    name: "Ramo",
    initials: "R",
    bgClass: "bg-emerald-800",
    logoSrc: `${LOGO_BASE}/ramo.svg`,
    storeQuery: RAMO_BRAND_QUERY,
  },
  { id: "aussie-pacific", name: "Aussie Pacific", initials: "AP", bgClass: "bg-sky-900" },
  { id: "winning-spirit", name: "Winning Spirit", initials: "WS", bgClass: "bg-indigo-900" },
]
