/**
 * Editorial for the JB's Wear guide. Which styles are featured lives here;
 * weights, colours, photos and product types are read live from the products.
 * Handles are `{brand}-{slug}-{stylecode}` (see backend jbs-wear-catalog.ts).
 */

export const COLOUR_WALL_HANDLE = "jbs-wear-tee-1ht"
export const HERO_HANDLES = ["jbs-wear-hv-d-n-ss-cotton-polo-6dcps", "jbs-wear-210-polo-210"]

/** One tile per part of the range. `anchor` keeps the tile on this page. */
export const RANGE_TILES: { label: string; blurb: string; handle: string; anchor?: string }[] = [
  { label: "Polos", blurb: "The uniform staple, 160 to 250 GSM.", handle: "jbs-wear-210-polo-210" },
  { label: "Tees", blurb: "Cotton tees and singlets, adult to infant.", handle: COLOUR_WALL_HANDLE },
  { label: "Fleece", blurb: "Hoodies, crews, rugbys and half zips.", handle: "jbs-wear-fleecy-hoodie-3fh" },
  { label: "Hi-vis", blurb: "Day and day/night, to the Australian standard.", handle: "jbs-wear-hv-ss-trad-polo-6hvps", anchor: "#hi-vis" },
  { label: "Jackets and vests", blurb: "Softshells, puffers and tricot vests.", handle: "jbs-wear-tempest-jacket-3tpj" },
  { label: "Work shirts", blurb: "Drill and epaulette shirts, long and short sleeve.", handle: "jbs-wear-ss-epaulette-shirt-6e" },
  { label: "Work pants", blurb: "Cargos, multi-pocket pants and shorts.", handle: "jbs-wear-mrised-multi-pocket-pant-6nmp" },
  { label: "Scrubs", blurb: "Tops, cargo pants and joggers for clinics.", handle: "jbs-wear-unisex-premium-scrubs-top-4spt" },
  { label: "Hospitality", blurb: "Aprons, chef polos and caps.", handle: "jbs-wear-86x50-apron-5a" },
]

/** The polos as a weight scale, lightest first. */
export const POLO_LADDER = [
  "jbs-wear-hv-ss-trad-polo-6hvps",
  "jbs-wear-hv-ss-cotton-polo-6cphv",
  "jbs-wear-210-polo-210",
  "jbs-wear-pique-polo-250",
]

export const FLEECE_LADDER = [
  "jbs-wear-hv-pull-over-hoodie-6hvph",
  "jbs-wear-fleecy-hoodie-3fh",
  "jbs-wear-350-trade-hoodie-6cfh",
  "jbs-wear-rugby-3r",
]

export const HI_VIS_PICKS: { handle: string; note: string }[] = [
  { handle: "jbs-wear-hv-ss-trad-polo-6hvps", note: "Day only. Fluoro body, no tape." },
  { handle: "jbs-wear-hv-d-n-ss-cotton-polo-6dcps", note: "Day/night. Reflective tape added." },
  { handle: "jbs-wear-hv-ls-150g-shirt-6hwsl", note: "Lightweight drill for the heat." },
  { handle: "jbs-wear-hv-46021-d-n-softshell-jacket-6d4lj", note: "Day/night outer layer." },
]

export const LABELS: { handle: string; name: string; blurb: string; pick: string }[] = [
  {
    handle: "jbs-wear",
    name: "JB's Wear",
    blurb: "The main line. Polos, tees, fleece, hi-vis, workwear, scrubs and hospitality.",
    pick: "jbs-wear-contrast-polo-2cp",
  },
  {
    handle: "podium",
    name: "Podium",
    blurb: "Sport and teamwear. Shorts, skorts, singlets, warm-ups and softshells.",
    pick: "podium-three-layer-softshell-jacket-3wsj",
  },
  {
    handle: "colours-of-cotton",
    name: "Colours of Cotton",
    blurb: "The softer, heavier cotton range. Popcorn polos, boat necks, rugbys and barn jackets.",
    pick: "colours-of-cotton-320g-popcorn-cotton-polo-2pcs",
  },
  {
    handle: "johnny-bobbin",
    name: "Johnny Bobbin",
    blurb: "A small range of everyday cotton tees.",
    pick: "johnny-bobbin-bobbin-tee-1jt",
  },
]

/** The shorthand in JB's style names. */
export const NAME_DECODER: { term: string; meaning: string }[] = [
  { term: "HV", meaning: "Hi-vis. A fluoro garment for being seen on site." },
  { term: "D+N", meaning: "Day and night. Hi-vis with reflective tape for low light." },
  { term: "4602.1", meaning: "Made to AS/NZS 4602.1, the standard for hi-vis safety garments." },
  { term: "Trad", meaning: "Traditional cut. The plain, classic version of the style." },
  { term: "Cotton Back", meaning: "Fluoro polyester outside, cotton against the skin." },
  { term: "S/S · L/S", meaning: "Short sleeve and long sleeve." },
  { term: "210 · 250 · 350", meaning: "A number in the name is usually the fabric weight in GSM." },
  { term: "P/C", meaning: "Poly/cotton blend." },
  { term: "W/Shirt", meaning: "Work shirt." },
]

export const ALL_HANDLES = Array.from(
  new Set([
    ...HERO_HANDLES,
    ...RANGE_TILES.map((t) => t.handle),
    ...POLO_LADDER,
    ...FLEECE_LADDER,
    ...HI_VIS_PICKS.map((p) => p.handle),
    ...LABELS.map((l) => l.pick),
  ])
)
