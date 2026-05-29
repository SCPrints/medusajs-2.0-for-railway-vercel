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
const BRAND_BASE = "/images/brands"

export type BrandGalleryImage = {
  src: string
  alt: string
}

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
  /**
   * Full-width banner shown as the hero background on the `/brands/<handle>`
   * landing page. When absent the hero falls back to a branded gradient built
   * from `bgClass`. These are the same wide banners used by the home-page
   * scrolling picture bar.
   */
  bannerSrc?: string
  /**
   * Stock / lifestyle product photos for the gallery on the brand landing page.
   * Render is skipped entirely when this is empty.
   */
  gallery?: BrandGalleryImage[]
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
    bannerSrc: `${BRAND_BASE}/as-colour-banner.png`,
    gallery: [
      { src: `${BRAND_BASE}/as-colour/ugc/ugc-1.png`, alt: "AS Colour apparel product photo" },
      { src: `${BRAND_BASE}/as-colour/ugc/ugc-2.png`, alt: "AS Colour tee product shot" },
      { src: `${BRAND_BASE}/as-colour/ugc/ugc-3.png`, alt: "AS Colour garment stock photo" },
      { src: `${BRAND_BASE}/as-colour/ugc/ugc-4.png`, alt: "AS Colour apparel lifestyle shot" },
      { src: `${BRAND_BASE}/as-colour/ugc/ugc-5.png`, alt: "AS Colour streetwear product photo" },
      { src: `${BRAND_BASE}/as-colour/ugc/ugc-6.png`, alt: "AS Colour blank garment" },
    ],
  },
  "aussie-pacific": {
    initials: "AP",
    bgClass: "bg-stone-700",
    logoSrc: `${LOGO_BASE}/aussie-pacific.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/aussie-pacific-banner.png`,
    gallery: [
      { src: `${BRAND_BASE}/aussie-pacific/hoodie.jpg`, alt: "Aussie Pacific hoodie" },
      { src: `${BRAND_BASE}/aussie-pacific/polo.jpg`, alt: "Aussie Pacific polo" },
      { src: `${BRAND_BASE}/aussie-pacific/jacket.jpg`, alt: "Aussie Pacific jacket" },
      { src: `${BRAND_BASE}/aussie-pacific/quarter-zip.jpg`, alt: "Aussie Pacific quarter-zip sweater" },
      { src: `${BRAND_BASE}/aussie-pacific/vest.jpg`, alt: "Aussie Pacific vest" },
      { src: `${BRAND_BASE}/aussie-pacific/trackpants.jpg`, alt: "Aussie Pacific trackpants" },
      { src: `${BRAND_BASE}/aussie-pacific/shorts.jpg`, alt: "Aussie Pacific sports shorts" },
      { src: `${BRAND_BASE}/aussie-pacific/backpack.jpg`, alt: "Aussie Pacific backpack" },
    ],
  },
  syzmik: {
    initials: "SY",
    bgClass: "bg-slate-800",
    logoSrc: `${LOGO_BASE}/syzmik-workwear.svg`,
    logoClass: "max-h-full max-w-[42%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/syzmik-banner.png`,
  },
  "biz-collection": {
    initials: "B+",
    bgClass: "bg-rose-800",
    logoSrc: `${LOGO_BASE}/biz-collection.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/biz-collection-banner.png`,
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
    bannerSrc: `${BRAND_BASE}/dnc-banner.png`,
  },
  ramo: {
    initials: "RA",
    bgClass: "bg-red-700",
    logoSrc: `${LOGO_BASE}/ramo.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    gallery: [
      { src: `${BRAND_BASE}/ramo/oversize-hoodie.jpg`, alt: "Ramo oversize easy-fit hoodie" },
      { src: `${BRAND_BASE}/ramo/half-zip-fleece.jpg`, alt: "Ramo enterprise half-zip fleece" },
      { src: `${BRAND_BASE}/ramo/kangaroo-hoodie.jpg`, alt: "Ramo kangaroo-pocket hoodie" },
      { src: `${BRAND_BASE}/ramo/zip-hoodie.jpg`, alt: "Ramo zip-through hoodie" },
      { src: `${BRAND_BASE}/ramo/ladies-fleece-hoodie.jpg`, alt: "Ramo ladies polar-fleece hoodie" },
      { src: `${BRAND_BASE}/ramo/style-t203ho.jpg`, alt: "Ramo apparel blank" },
      { src: `${BRAND_BASE}/ramo/style-tr09un.jpg`, alt: "Ramo apparel blank" },
      { src: `${BRAND_BASE}/ramo/tote-bag.jpg`, alt: "Ramo organic cotton tote bag" },
    ],
  },
  gildan: {
    initials: "GI",
    bgClass: "bg-zinc-800",
    logoSrc: `${LOGO_BASE}/gildan.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    gallery: [
      { src: `${BRAND_BASE}/gildan/tee.jpg`, alt: "Gildan Ultra Cotton t-shirt" },
      { src: `${BRAND_BASE}/gildan/hoodie.jpg`, alt: "Gildan Softstyle hoodie" },
      { src: `${BRAND_BASE}/gildan/crewneck.jpg`, alt: "Gildan Heavy Blend crewneck" },
      { src: `${BRAND_BASE}/gildan/polo.jpg`, alt: "Gildan DryBlend polo" },
      { src: `${BRAND_BASE}/gildan/hammer-tee.jpg`, alt: "Gildan Hammer t-shirt" },
    ],
  },
  "american-apparel": {
    initials: "AA",
    bgClass: "bg-zinc-900",
    logoSrc: `${LOGO_BASE}/american-apparel.svg`,
    logoClass: "max-h-full max-w-[40%] object-contain object-left",
    gallery: [
      { src: `${BRAND_BASE}/american-apparel/tee.jpg`, alt: "American Apparel fine jersey t-shirt" },
      { src: `${BRAND_BASE}/american-apparel/crewneck.jpg`, alt: "American Apparel ReFlex fleece crewneck" },
      { src: `${BRAND_BASE}/american-apparel/tank.jpg`, alt: "American Apparel tank top" },
      { src: `${BRAND_BASE}/american-apparel/cvc-tee.jpg`, alt: "American Apparel CVC t-shirt" },
      { src: `${BRAND_BASE}/american-apparel/tee-relaxed.jpg`, alt: "American Apparel relaxed t-shirt" },
    ],
  },
  "comfort-colors": {
    initials: "CC",
    bgClass: "bg-stone-700",
    logoSrc: `${LOGO_BASE}/comfort-colors.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    gallery: [
      { src: `${BRAND_BASE}/comfort-colors/tee.jpg`, alt: "Comfort Colors garment-dyed t-shirt" },
      { src: `${BRAND_BASE}/comfort-colors/hoodie.jpg`, alt: "Comfort Colors garment-dyed hoodie" },
      { src: `${BRAND_BASE}/comfort-colors/crewneck.jpg`, alt: "Comfort Colors garment-dyed crewneck" },
      { src: `${BRAND_BASE}/comfort-colors/tank.jpg`, alt: "Comfort Colors garment-dyed tank top" },
      { src: `${BRAND_BASE}/comfort-colors/tee-black.jpg`, alt: "Comfort Colors heavyweight t-shirt" },
    ],
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
