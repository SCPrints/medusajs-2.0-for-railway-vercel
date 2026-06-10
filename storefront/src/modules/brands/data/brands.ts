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
   * CSS filter applied to the logo image to adjust its appearance
   * (e.g. `"grayscale(1)"` for black logos that should render grey).
   */
  logoFilterClass?: string
  /**
   * Background applied to the logo's container in the dark side-menu brand
   * list (e.g. `"bg-white"`). The hero and `/brands` grid already place the
   * logo on a light surface, but the side-menu renders it on a dark panel —
   * so a dark/black logo needs an explicit light chip there to stay legible.
   * Only applied when a `logoSrc` exists. Omit for logos that already read on
   * dark (white / muted-grey wordmarks like AS Colour, Shaka).
   */
  logoChipClass?: string
  /**
   * Full-width banner shown as the hero background on the `/brands/<handle>`
   * landing page. When absent the hero falls back to a branded gradient built
   * from `bgClass`. These are the same wide banners used by the home-page
   * scrolling picture bar.
   */
  bannerSrc?: string
  /**
   * Optional autoplaying, muted, looping background video for the hero. Takes
   * precedence over `bannerSrc`. `videoPosterSrc` is the still shown while it
   * loads and to `prefers-reduced-motion` visitors. Local file in /public.
   */
  videoSrc?: string
  videoPosterSrc?: string
  /**
   * "light" renders a split hero: text on the left, a product photo on the
   * right, over the `bgClass` background. Text is dark (not white). Designed
   * for product-shot images with a white/light background — `mix-blend-multiply`
   * makes the white bg transparent so the brand colour shows through cleanly.
   */
  heroVariant?: "light"
  /**
   * Product / lifestyle photo used by the "light" hero variant (right-hand side).
   * Local /public path or absolute URL.
   */
  heroProductSrc?: string
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

const THREAD_LAB_CDN =
  "https://cdn.shopify.com/s/files/1/0749/0073/4179/files"

const BRAND_PRESENTATION_BY_HANDLE: Record<string, BrandPresentation> = {
  "thread-lab": {
    initials: "TL",
    bgClass: "bg-stone-900",
    // Black "ThreadLAB." wordmark (supplied by the brand) on transparent.
    // Reads on the white hero chip + the white /brands grid card as-is; the
    // dark side-menu needs the white chip below to stay legible.
    logoSrc: `${LOGO_BASE}/thread-lab.png`,
    logoClass: "max-h-full max-w-[68%] object-contain object-left",
    logoFilterClass: "opacity(0.5)",
    logoChipClass: "bg-white",
    // Hero loop hotlinked from Thread Lab's own homepage — the factory/fabric
    // "threadheads_video" section about halfway down threadlab.com.au. Plain
    // <video> element, so no next.config allowlist needed. If the URL ever
    // 404s (re-upload), download + host locally under /public/images/brands/
    // like shaka-wear-hero.mp4.
    videoSrc:
      "https://www.threadlab.com.au/cdn/shop/videos/c/vp/6254479295be4931a8a1208b9e8276f0/6254479295be4931a8a1208b9e8276f0.HD-1080p-7.2Mbps-57638434.mp4?v=0",
    videoPosterSrc:
      "https://www.threadlab.com.au/cdn/shop/files/preview_images/6254479295be4931a8a1208b9e8276f0.thumbnail.0000000000_800x.jpg?v=1758091777",
    gallery: [
      {
        src: `${THREAD_LAB_CDN}/black-core-tee_ab118b29-9ffb-4fd5-9729-88ed1eacf0a0.jpg`,
        alt: "Thread Lab Core Tee in Black",
      },
      {
        src: `${THREAD_LAB_CDN}/natural-premium-tee_da817f66-f6f3-465f-8dd4-d8c4d4041b41.jpg`,
        alt: "Thread Lab Premium Tee in Natural",
      },
      {
        src: `${THREAD_LAB_CDN}/natural-core-hoodie.jpg`,
        alt: "Thread Lab Core Hoodie in Natural",
      },
      {
        src: `${THREAD_LAB_CDN}/stoneblue-superior-tee.jpg`,
        alt: "Thread Lab Superior Tee in Stone Blue",
      },
      {
        src: `${THREAD_LAB_CDN}/Frame_7cff79c6-6a70-451b-9e86-6d82201ae39a.jpg`,
        alt: "Thread Lab Elevated Hoodie in Jungle",
      },
      {
        src: `${THREAD_LAB_CDN}/natural-core-sweatshirt.jpg`,
        alt: "Thread Lab Core Crew in Natural",
      },
    ],
  },
  "shaka-wear": {
    initials: "SW",
    // Dark tile so the white initials fallback + brand-hero white title read.
    // The logo PNG is recoloured to the shared muted grey so it shows on both
    // the dark mega-menu tile and the light brand-hero chip.
    bgClass: "bg-neutral-900",
    logoSrc: `${LOGO_BASE}/shaka-wear.png`,
    logoClass: "max-h-full max-w-[55%] object-contain object-left",
    // Their homepage hero loop (sourced from shakawear.com, hosted locally).
    videoSrc: `${BRAND_BASE}/shaka-wear-hero.mp4`,
    videoPosterSrc: `${BRAND_BASE}/shaka-wear-hero-poster.jpg`,
  },
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
    logoFilterClass: "grayscale(1) opacity(0.55)",
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
    bannerSrc: `${BRAND_BASE}/biz-care-banner.jpg`,
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
    bgClass: "bg-stone-200",
    logoSrc: `${LOGO_BASE}/ramo.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    heroVariant: "light",
    heroProductSrc: `${BRAND_BASE}/ramo/hero-hoodies.png`,
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
    bannerSrc: `${BRAND_BASE}/gildan-banner.jpg`,
    gallery: [
      { src: `${BRAND_BASE}/gildan/tee.jpg`, alt: "Gildan Heavy Cotton t-shirt" },
      { src: `${BRAND_BASE}/gildan/hoodie.jpg`, alt: "Gildan Heavy Blend hoodie" },
      { src: `${BRAND_BASE}/gildan/crewneck.jpg`, alt: "Gildan Heavy Blend crewneck" },
      { src: `${BRAND_BASE}/gildan/polo.jpg`, alt: "Gildan double piqué polo" },
      { src: `${BRAND_BASE}/gildan/hammer-tee.jpg`, alt: "Gildan Hammer t-shirt" },
    ],
  },
  "american-apparel": {
    initials: "AA",
    bgClass: "bg-zinc-900",
    logoSrc: `${LOGO_BASE}/american-apparel.svg`,
    logoClass: "max-h-full max-w-[40%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/american-apparel-banner.jpg`,
    gallery: [
      { src: `${BRAND_BASE}/american-apparel/tee.jpg`, alt: "American Apparel cotton t-shirt" },
      { src: `${BRAND_BASE}/american-apparel/crewneck.jpg`, alt: "American Apparel ReFlex fleece crewneck" },
      { src: `${BRAND_BASE}/american-apparel/tank.jpg`, alt: "American Apparel garment-dyed tank top" },
      { src: `${BRAND_BASE}/american-apparel/cvc-tee.jpg`, alt: "American Apparel CVC t-shirt" },
      { src: `${BRAND_BASE}/american-apparel/tee-relaxed.jpg`, alt: "American Apparel relaxed t-shirt" },
    ],
  },
  "comfort-colors": {
    initials: "CC",
    bgClass: "bg-stone-700",
    logoSrc: `${LOGO_BASE}/comfort-colors.svg`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/comfort-colors-banner.jpg`,
    gallery: [
      { src: `${BRAND_BASE}/comfort-colors/tee.jpg`, alt: "Comfort Colors garment-dyed t-shirt" },
      { src: `${BRAND_BASE}/comfort-colors/hoodie.jpg`, alt: "Comfort Colors garment-dyed hoodie" },
      { src: `${BRAND_BASE}/comfort-colors/crewneck.jpg`, alt: "Comfort Colors garment-dyed crewneck" },
      { src: `${BRAND_BASE}/comfort-colors/tank.jpg`, alt: "Comfort Colors garment-dyed tank top" },
      { src: `${BRAND_BASE}/comfort-colors/colorblast-tee.jpg`, alt: "Comfort Colors Colorblast tie-dye t-shirt" },
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
