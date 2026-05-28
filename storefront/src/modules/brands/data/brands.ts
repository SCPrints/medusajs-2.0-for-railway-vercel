/**
 * Presentation styles for brand tiles on the storefront. The canonical list of brands lives in
 * the backend Brand module — fetch it via `getBrands()` in `@lib/data/brands`. This file is
 * presentation only: the brand `bgClass`, `initials`, and `logoSrc` keyed by brand handle.
 *
 * New brands without an entry here get a generic fallback. Edit this map (handle → style)
 * when adding presentation for a new brand; or, better, store the logo URL on the Brand row
 * itself (`logo_url`) and the storefront will use that instead.
 */

const LOGO_BASE = "/images/brands/logos"

export type BrandPresentation = {
  initials: string
  bgClass: string
  logoSrc?: string
  /**
   * Tailwind sizing classes applied to the <img> on the brand tile. Override
   * per-brand when a logo's intrinsic aspect ratio makes it dominate or shrink
   * relative to siblings. Wide SVG wordmarks (Syzmik, Biz Collection) need a
   * tighter max-width; tight square PNGs (AS Colour, DNC, Ramo) need extra
   * height to read at the same visual weight.
   */
  logoClass?: string
}

// Default sizing for brand logos. Tuned so most wordmarks read at a similar
// visual mass — wide wordmarks are capped at half the card; square marks fill
// the height. Brand-specific overrides live on the BrandPresentation row.
export const DEFAULT_LOGO_CLASS =
  "max-h-full max-w-[50%] object-contain object-left"

const BRAND_PRESENTATION_BY_HANDLE: Record<string, BrandPresentation> = {
  "as-colour": {
    initials: "AS",
    bgClass: "bg-zinc-900",
    logoSrc: `${LOGO_BASE}/as-colour.png`,
    logoClass: "h-full max-w-[40%] object-contain object-left",
  },
  "aussie-pacific": {
    initials: "AP",
    bgClass: "bg-stone-700",
    logoSrc: `${LOGO_BASE}/aussie-pacific.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
  },
  syzmik: {
    initials: "SY",
    bgClass: "bg-slate-800",
    logoSrc: `${LOGO_BASE}/syzmik-workwear.svg`,
    logoClass: "max-h-full max-w-[42%] object-contain object-left",
  },
  "biz-collection": {
    initials: "B+",
    bgClass: "bg-rose-800",
    logoSrc: `${LOGO_BASE}/biz-collection.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
  },
  "biz-care": {
    initials: "BC",
    bgClass: "bg-teal-700",
    logoSrc: `${LOGO_BASE}/biz-care.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
  },
  "biz-corporates": {
    initials: "BC",
    bgClass: "bg-blue-800",
    logoSrc: `${LOGO_BASE}/biz-corporates.svg`,
    logoClass: "max-h-full max-w-[60%] object-contain object-left",
  },
  fashionbiz: { initials: "FZ", bgClass: "bg-rose-900" },
  "dnc-workwear": {
    initials: "DNC",
    bgClass: "bg-slate-800",
    logoSrc: `${LOGO_BASE}/dnc.png`,
    logoClass: "h-full max-w-[45%] object-contain object-left",
  },
  ramo: {
    initials: "RA",
    bgClass: "bg-red-700",
    logoSrc: `${LOGO_BASE}/ramo.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
  },
  gildan: {
    initials: "GI",
    bgClass: "bg-zinc-800",
    logoSrc: `${LOGO_BASE}/gildan.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
  },
  "american-apparel": {
    initials: "AA",
    bgClass: "bg-zinc-900",
    logoSrc: `${LOGO_BASE}/american-apparel.svg`,
    logoClass: "max-h-full max-w-[40%] object-contain object-left",
  },
  "comfort-colors": {
    initials: "CC",
    bgClass: "bg-stone-700",
    logoSrc: `${LOGO_BASE}/comfort-colors.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
  },
}

const FALLBACK_PRESENTATION: BrandPresentation = {
  initials: "B",
  bgClass: "bg-stone-500",
}

export function getBrandPresentation(handle: string): BrandPresentation {
  return BRAND_PRESENTATION_BY_HANDLE[handle.toLowerCase()] ?? FALLBACK_PRESENTATION
}

export function brandInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3)
}
