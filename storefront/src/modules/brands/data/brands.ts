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
   * object-position for the banner (e.g. "object-[center_20%]"). The hero is a
   * wide letterbox, so a centred crop cuts heads off photos whose subject sits
   * high in the frame. Defaults to centre.
   */
  bannerPositionClass?: string
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
  /** Search-facing <title> for the brand landing page (template adds "| SC PRINTS"). */
  seoTitle?: string
  /**
   * One short paragraph rendered under the hero and used as the meta
   * description. Brand pages with no body copy sit at pos 7-15 with hundreds
   * of impressions and nothing for Google to quote.
   */
  intro?: string
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
    seoTitle: "Shaka Wear Australia — Heavyweight Tees, Custom Printed",
    intro:
      "Shaka Wear heavyweight tees and hoodies, available in Australia and custom printed in Sydney. The Max Heavyweight 7.5oz tee, the garment-dyed range and the oversized drop-shoulder cuts are the streetwear blanks our customers ask for by name — pick a colour and size run, add your artwork in the online studio, and we print or embroider it in-house at Villawood. From a single piece, shipped Australia-wide.",
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
  "jbs-wear": {
    initials: "JB",
    // Guide navy (not JB's own #174a7c) — the hero falls back to this until a
    // banner is supplied.
    bgClass: "bg-[#0f2238]",
    // Boxed wordmark from JB's EPS, box recoloured to the shared muted grey.
    logoSrc: `${LOGO_BASE}/jbs-wear.svg`,
    seoTitle: "JB's Wear Australia — Custom Printed Polos, Hi-Vis & Workwear",
    intro:
      "JB's Wear polos, tees, hoodies, hi-vis, workwear and scrubs, custom printed or embroidered at our Sydney studio. The 210 Polo, the day/night hi-vis range and the Fleecy Hoodie are uniform staples for trades, clubs, schools and clinics — pick a colour and size run, add your logo in the online studio, and we decorate it in-house at Villawood. From a single piece, shipped Australia-wide.",
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
    seoTitle: "American Apparel Australia — Custom Printed Tees & Fleece",
    intro:
      "American Apparel blanks in Australia — the fine jersey tee, CVC tees, garment-dyed tanks and ReFlex fleece — custom screen printed, DTF printed or embroidered at our Sydney studio. Order from one piece, design it online, and we decorate it in-house at Villawood and ship Australia-wide.",
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
  // ---- Legend Life / Epicentre labels (imported Nov 2026). Logos are each
  // brand's official reversed artwork (from Epicentre's brand pages)
  // recoloured to the shared grey; photos are the brands' own campaign
  // shots, hosted locally. Tirano + EXTON have no lifestyle photography
  // anywhere, so they use the light hero with one of their product shots.
  stormtech: {
    initials: "ST",
    bgClass: "bg-neutral-950",
    logoSrc: `${LOGO_BASE}/stormtech.png`,
    logoClass: "max-h-full max-w-[60%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/stormtech/hero.jpg`,
    gallery: [
      { src: `${BRAND_BASE}/stormtech/gallery-1.jpg`, alt: "Stormtech insulated jacket" },
      { src: `${BRAND_BASE}/stormtech/gallery-2.jpg`, alt: "Stormtech quilted puffer jacket" },
      { src: `${BRAND_BASE}/stormtech/gallery-3.jpg`, alt: "Stormtech performance polos in a stack" },
      { src: `${BRAND_BASE}/stormtech/gallery-4.jpg`, alt: "Stormtech waterproof backpack" },
      { src: `${BRAND_BASE}/stormtech/gallery-5.jpg`, alt: "Stormtech duffle backpack" },
      { src: `${BRAND_BASE}/stormtech/gallery-6.jpg`, alt: "Stormtech cooler bag" },
    ],
    seoTitle: "Stormtech Australia — Custom Branded Jackets, Softshells & Polos",
    intro:
      "Stormtech is Canadian outerwear built for proper weather: waterproof shells, softshells, puffers, 3-in-1 jackets, performance polos and bags. It's the range we point people to when a uniform has to work outdoors all year. We embroider or print your logo on it in-house at our Sydney studio, from a single jacket, and ship Australia-wide.",
  },
  legend: {
    initials: "LG",
    bgClass: "bg-slate-800",
    logoSrc: `${LOGO_BASE}/legend.png`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/legend/hero.jpg`,
    bannerPositionClass: "object-[center_20%]",
    gallery: [
      { src: `${BRAND_BASE}/legend/gallery-1.jpg`, alt: "Legend cap worn with a crew sweat" },
      { src: `${BRAND_BASE}/legend/gallery-2.jpg`, alt: "Legend caps in navy and maroon" },
      { src: `${BRAND_BASE}/legend/gallery-3.jpg`, alt: "Legend sand cap" },
    ],
    seoTitle: "Legend Australia — Custom Branded Caps, Bags & Coolers",
    intro:
      "Legend is the Australian everyday range: caps, bucket hats, beanies, backpacks, duffles, coolers and umbrellas, built to carry a logo. Good-value gear for staff, events and giveaways. We print or embroider it in-house at our Sydney studio and ship Australia-wide. Printed pieces start at one; embroidered caps start at 10.",
  },
  "legend-black": {
    initials: "LB",
    bgClass: "bg-black",
    logoSrc: `${LOGO_BASE}/legend-black.png`,
    logoClass: "max-h-full max-w-[42%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/legend-black/hero.jpg`,
    bannerPositionClass: "object-[center_25%]",
    gallery: [
      { src: `${BRAND_BASE}/legend-black/gallery-1.jpg`, alt: "Legend Black trucker cap" },
      { src: `${BRAND_BASE}/legend-black/gallery-2.jpg`, alt: "Legend Black caps stacked" },
      { src: `${BRAND_BASE}/legend-black/gallery-3.jpg`, alt: "Legend Black backpack cooler" },
      { src: `${BRAND_BASE}/legend-black/gallery-4.jpg`, alt: "Legend Black cooler bag" },
      { src: `${BRAND_BASE}/legend-black/gallery-5.jpg`, alt: "Legend Black cap worn street-side" },
      { src: `${BRAND_BASE}/legend-black/gallery-6.jpg`, alt: "Legend Black bags and coolers" },
    ],
    seoTitle: "Legend Black Australia — Custom Embroidered Caps & Bags",
    intro:
      "Legend Black is Legend's premium line: structured caps, A-frames, truckers, visors and a matching range of bags and coolers, finished to retail standard. The caps for a team, a brewery or a brand that wants merch people actually wear. We embroider or print them in-house at our Sydney studio. Embroidered caps start at 10; printed pieces start at one.",
  },
  atlantis: {
    initials: "AT",
    bgClass: "bg-neutral-900",
    logoSrc: `${LOGO_BASE}/atlantis.png`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/atlantis/hero.jpg`,
    bannerPositionClass: "object-[center_20%]",
    gallery: [
      { src: `${BRAND_BASE}/atlantis/gallery-1.jpg`, alt: "Atlantis bucket hats and dad caps" },
      { src: `${BRAND_BASE}/atlantis/gallery-2.jpg`, alt: "Atlantis canvas caps and truckers" },
      { src: `${BRAND_BASE}/atlantis/gallery-3.jpg`, alt: "Atlantis corduroy cap from behind" },
      { src: `${BRAND_BASE}/atlantis/gallery-4.jpg`, alt: "Atlantis beanies" },
      { src: `${BRAND_BASE}/atlantis/gallery-5.jpg`, alt: "Atlantis water-repellent cap close-up" },
      { src: `${BRAND_BASE}/atlantis/gallery-6.jpg`, alt: "Atlantis headwear on display" },
    ],
    seoTitle: "Atlantis Headwear Australia — Custom Embroidered Caps & Beanies",
    intro:
      "Atlantis is Italian headwear with a fashion eye: dad hats, washed and destroyed caps, truckers, bucket hats and beanies, in colours you won't find in a promo catalogue. We embroider or print them in-house at our Sydney studio and ship Australia-wide. Embroidered headwear starts at 10; printed pieces start at one.",
  },
  "james-harvest": {
    initials: "JH",
    // PMS 296, the navy on James Harvest's own logo box.
    bgClass: "bg-[#002855]",
    logoSrc: `${LOGO_BASE}/james-harvest.png`,
    logoClass: "max-h-full max-w-[60%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/james-harvest/hero.jpg`,
    bannerPositionClass: "object-[center_15%]",
    gallery: [
      { src: `${BRAND_BASE}/james-harvest/gallery-1.jpg`, alt: "James Harvest caps and hoodie" },
      { src: `${BRAND_BASE}/james-harvest/gallery-2.jpg`, alt: "James Harvest crew sweat" },
      { src: `${BRAND_BASE}/james-harvest/gallery-3.jpg`, alt: "James Harvest hybrid vest" },
      { src: `${BRAND_BASE}/james-harvest/gallery-4.jpg`, alt: "James Harvest jacket" },
      { src: `${BRAND_BASE}/james-harvest/gallery-5.jpg`, alt: "James Harvest softshell jacket" },
      { src: `${BRAND_BASE}/james-harvest/gallery-6.jpg`, alt: "James Harvest women's softshell" },
    ],
    seoTitle: "James Harvest Australia — Custom Embroidered Polos & Softshells",
    intro:
      "James Harvest is Swedish sportswear with a smart-casual cut: cotton polos, softshells, quilted jackets, hybrids and hoodies that look at home in the office or on the course. We embroider or print your logo in-house at our Sydney studio, from a single garment, and ship Australia-wide.",
  },
  "stedman-collection": {
    initials: "SC",
    // Warm sand, after the studio backdrop Stedman shoots everything on.
    bgClass: "bg-[#6b5640]",
    logoSrc: `${LOGO_BASE}/stedman-collection.png`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/stedman-collection/hero.jpg`,
    gallery: [
      { src: `${BRAND_BASE}/stedman-collection/gallery-1.jpg`, alt: "Stedman Classic-T in white" },
      { src: `${BRAND_BASE}/stedman-collection/gallery-2.jpg`, alt: "Stedman women's tee in olive" },
      { src: `${BRAND_BASE}/stedman-collection/gallery-3.jpg`, alt: "Stedman cotton polo in royal blue" },
      { src: `${BRAND_BASE}/stedman-collection/gallery-4.jpg`, alt: "Stedman tees in orange and khaki" },
      { src: `${BRAND_BASE}/stedman-collection/gallery-5.jpg`, alt: "Stedman women's tee in black" },
      { src: `${BRAND_BASE}/stedman-collection/gallery-6.jpg`, alt: "Stedman women's polo in navy" },
    ],
    seoTitle: "Stedman Australia — Custom Printed Tees & Polos",
    intro:
      "Stedman makes blanks for printers: the Classic-T, heavyweight Comfort-T, Active sports tees, raglans and cotton polos, in a deep colour range. Plain, reliable garments that take a print well. We screen print, DTF print or embroider them in-house at our Sydney studio, from one piece, and ship Australia-wide.",
  },
  swissdigital: {
    initials: "SD",
    bgClass: "bg-zinc-800",
    logoSrc: `${LOGO_BASE}/swissdigital.png`,
    logoClass: "max-h-full max-w-[45%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/swissdigital/hero.jpg`,
    bannerPositionClass: "object-[center_20%]",
    gallery: [
      { src: `${BRAND_BASE}/swissdigital/gallery-1.jpg`, alt: "Swissdigital laptop backpack" },
      { src: `${BRAND_BASE}/swissdigital/gallery-2.jpg`, alt: "Swissdigital tote bag" },
      { src: `${BRAND_BASE}/swissdigital/gallery-3.jpg`, alt: "Swissdigital Neptune backpack" },
      { src: `${BRAND_BASE}/swissdigital/gallery-4.jpg`, alt: "Swissdigital Java backpack" },
      { src: `${BRAND_BASE}/swissdigital/gallery-5.jpg`, alt: "Swissdigital bags in the snow" },
      { src: `${BRAND_BASE}/swissdigital/gallery-6.jpg`, alt: "Swissdigital backpack on a ride" },
    ],
    seoTitle: "Swissdigital Australia — Custom Branded Laptop Backpacks",
    intro:
      "Swissdigital makes tech-ready travel bags: padded laptop backpacks, anti-theft packs, shoulder bags, wash bags and duffles, many with a built-in tracker pocket and recycled fabric. A gift that gets used every day. We add your logo in-house at our Sydney studio and ship Australia-wide.",
  },
  "printer-activewear": {
    initials: "PR",
    bgClass: "bg-neutral-900",
    logoSrc: `${LOGO_BASE}/printer-activewear.png`,
    logoClass: "max-h-full max-w-[38%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/printer-activewear/hero.jpg`,
    bannerPositionClass: "object-[center_25%]",
    gallery: [
      { src: `${BRAND_BASE}/printer-activewear/gallery-1.jpg`, alt: "Printer polo in royal blue" },
      { src: `${BRAND_BASE}/printer-activewear/gallery-2.jpg`, alt: "Printer two-tone polo" },
      { src: `${BRAND_BASE}/printer-activewear/gallery-3.jpg`, alt: "Printer contrast polo" },
      { src: `${BRAND_BASE}/printer-activewear/gallery-4.jpg`, alt: "Printer women's tee in green" },
      { src: `${BRAND_BASE}/printer-activewear/gallery-5.jpg`, alt: "Printer women's polo in red" },
      { src: `${BRAND_BASE}/printer-activewear/gallery-6.jpg`, alt: "Printer active tee in hi-vis yellow" },
    ],
    seoTitle: "Printer Activewear Australia — Custom Printed Polos & Tees",
    intro:
      "Printer is Scandinavian teamwear: Surf cotton polos, Smash and Run active polos and tees, and Vert softshells, in strong colours that mix and match across a team. We print or embroider them in-house at our Sydney studio, from one piece, and ship Australia-wide.",
  },
  "great-southern-clothing": {
    initials: "GS",
    bgClass: "bg-zinc-900",
    logoSrc: `${LOGO_BASE}/great-southern-clothing.png`,
    logoClass: "max-h-full max-w-[60%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/great-southern-clothing/hero.jpg`,
    bannerPositionClass: "object-[center_15%]",
    gallery: [
      { src: `${BRAND_BASE}/great-southern-clothing/gallery-1.jpg`, alt: "Great Southern men's softshell" },
      { src: `${BRAND_BASE}/great-southern-clothing/gallery-2.jpg`, alt: "Great Southern women's softshell" },
      { src: `${BRAND_BASE}/great-southern-clothing/gallery-3.jpg`, alt: "Great Southern softshell vests" },
      { src: `${BRAND_BASE}/great-southern-clothing/gallery-4.jpg`, alt: "Great Southern women's puffer vest" },
      { src: `${BRAND_BASE}/great-southern-clothing/gallery-5.jpg`, alt: "Great Southern puffer jacket" },
      { src: `${BRAND_BASE}/great-southern-clothing/gallery-6.jpg`, alt: "Great Southern puffer vest" },
    ],
    seoTitle: "Great Southern Clothing Australia — Custom Branded Puffers & Softshells",
    intro:
      "Great Southern Clothing Co. is an Australian-owned outerwear label: The Puffer, The Softshell and their vests, in men's, women's and youth cuts, plus scarves and a fleece blanket. Simple, warm uniform layers. We embroider or print your logo in-house at our Sydney studio, from one piece, and ship Australia-wide.",
  },
  tirano: {
    initials: "TI",
    bgClass: "bg-stone-300",
    heroVariant: "light",
    heroProductSrc: `${BRAND_BASE}/tirano/hero-product.png`,
    seoTitle: "Tirano Australia — Custom Branded Bags & Coolers",
    intro:
      "Tirano is a charcoal-marle range of everyday bags: backpacks, laptop satchels, totes, a travel bag, a toiletry bag and a set of coolers from lunch size up. It matches across the range, so a whole kit looks like a set. We add your logo in-house at our Sydney studio and ship Australia-wide.",
  },
  umbra: {
    initials: "UM",
    bgClass: "bg-[#0b2545]",
    logoSrc: `${LOGO_BASE}/umbra.png`,
    logoClass: "max-h-full max-w-[50%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/umbra/hero.jpg`,
    gallery: [
      { src: `${BRAND_BASE}/umbra/gallery-1.jpg`, alt: "Umbra golf umbrella in the rain" },
      { src: `${BRAND_BASE}/umbra/gallery-2.jpg`, alt: "Umbra vented umbrella in the city" },
      { src: `${BRAND_BASE}/umbra/gallery-3.jpg`, alt: "Umbra umbrella on a wet street" },
    ],
    seoTitle: "Umbra Umbrellas Australia — Custom Branded Umbrellas",
    intro:
      "Umbra makes wind-resistant umbrellas: fibreglass frames, vented double canopies and auto open, from the Ultimate golf size down to compacts that fit in a bag. The umbrella you hand a client and see again next winter. We add your logo in-house at our Sydney studio and ship Australia-wide.",
  },
  "harvest-and-frost": {
    initials: "HF",
    bgClass: "bg-neutral-900",
    logoSrc: `${LOGO_BASE}/harvest-and-frost.png`,
    logoClass: "max-h-full max-w-[60%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/harvest-and-frost/hero.jpg`,
    bannerPositionClass: "object-[center_45%]",
    gallery: [
      { src: `${BRAND_BASE}/harvest-and-frost/gallery-1.jpg`, alt: "J.Harvest & Frost Green Bow shirt in light blue" },
      { src: `${BRAND_BASE}/harvest-and-frost/gallery-2.jpg`, alt: "J.Harvest & Frost women's black shirt" },
      { src: `${BRAND_BASE}/harvest-and-frost/gallery-3.jpg`, alt: "J.Harvest & Frost women's fine-stripe shirt" },
      { src: `${BRAND_BASE}/harvest-and-frost/gallery-4.jpg`, alt: "J.Harvest & Frost Red Bow women's shirt" },
      { src: `${BRAND_BASE}/harvest-and-frost/gallery-5.jpg`, alt: "J.Harvest & Frost white business shirt" },
      { src: `${BRAND_BASE}/harvest-and-frost/gallery-6.jpg`, alt: "J.Harvest & Frost Yellow Bow stripe close-up" },
    ],
    seoTitle: "J.Harvest & Frost Australia — Custom Embroidered Business Shirts",
    intro:
      "J.Harvest & Frost is a Swedish shirtmaker for corporate wear. Each line is named by its Bow colour: Green Bow is the clean classic, Red Bow adds contrast details, Purple Bow is the trend line and Yellow Bow the everyday value line. Men's and women's fits. We embroider your logo in-house at our Sydney studio, from a single shirt, and ship Australia-wide.",
  },
  "beacon-sportswear": {
    initials: "BE",
    // Harbour navy, after the New England coastline Beacon is named for.
    bgClass: "bg-[#1b2a41]",
    logoSrc: `${LOGO_BASE}/beacon-sportswear.png`,
    logoClass: "max-h-full max-w-[40%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/beacon-sportswear/hero.jpg`,
    bannerPositionClass: "object-[center_10%]",
    gallery: [
      { src: `${BRAND_BASE}/beacon-sportswear/gallery-1.jpg`, alt: "Beacon Libby women's softshell jacket" },
      { src: `${BRAND_BASE}/beacon-sportswear/gallery-2.jpg`, alt: "Beacon Montana men's softshell vest" },
      { src: `${BRAND_BASE}/beacon-sportswear/gallery-3.jpg`, alt: "Beacon softshell on the jetty" },
    ],
    seoTitle: "Beacon Sportswear Australia — Custom Branded Softshells & Puffers",
    intro:
      "Beacon Sportswear is coastal outerwear: the Libby and Perkins softshells, Montana and Morgan vests, and the Hudson and Loma puffers. Tidy, warm jackets for staff who are out and about. We embroider or print your logo in-house at our Sydney studio, from one piece, and ship Australia-wide.",
  },
  "next-level-apparel": {
    initials: "NL",
    bgClass: "bg-neutral-900",
    logoSrc: `${LOGO_BASE}/next-level-apparel.png`,
    logoClass: "max-h-full max-w-[60%] object-contain object-left",
    bannerSrc: `${BRAND_BASE}/next-level-apparel/hero.jpg`,
    bannerPositionClass: "object-[center_20%]",
    gallery: [
      { src: `${BRAND_BASE}/next-level-apparel/gallery-1.jpg`, alt: "Next Level CVC crew tee" },
      { src: `${BRAND_BASE}/next-level-apparel/gallery-2.jpg`, alt: "Next Level tri-blend crew tee" },
      { src: `${BRAND_BASE}/next-level-apparel/gallery-3.jpg`, alt: "Next Level cotton crew tee" },
      { src: `${BRAND_BASE}/next-level-apparel/gallery-4.jpg`, alt: "Next Level tees worn by a group" },
      { src: `${BRAND_BASE}/next-level-apparel/gallery-5.jpg`, alt: "Next Level women's tee in navy" },
      { src: `${BRAND_BASE}/next-level-apparel/gallery-6.jpg`, alt: "Next Level women's tri-blend tee" },
    ],
    seoTitle: "Next Level Apparel Australia — Custom Printed Soft Tees",
    intro:
      "Next Level is the soft-hand tee from Los Angeles: the CVC crew, tri-blend crew, cotton crew and the women's boyfriend tee. Lightweight, fitted and smooth to print on, the tee for band merch and events. We screen print, DTF print or embroider them in-house at our Sydney studio, from one piece, and ship Australia-wide.",
  },
  exton: {
    initials: "EX",
    bgClass: "bg-neutral-300",
    heroVariant: "light",
    heroProductSrc: `${BRAND_BASE}/exton/hero-product.png`,
    seoTitle: "EXTON Australia — Custom Branded Business Bags",
    intro:
      "EXTON is a black business range: a padded laptop backpack, a business satchel and a cooler. Sharp, plain bags that suit a corporate gift. We add your logo in-house at our Sydney studio and ship Australia-wide.",
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
