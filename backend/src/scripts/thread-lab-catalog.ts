/**
 * Thread Lab catalog — resolved data for the one-off seed importer.
 *
 * SOURCE OF TRUTH:
 *   - Sizes + descriptions: threadlab.com.au product pages (June 2026).
 *   - Costs: SC Prints wholesale account, ex-GST, supplied 2026-06-02. Flat
 *     per-size (Thread Lab's wholesale rate doesn't differ by size). The only
 *     unconfirmed values are Core Tee 4XL/5XL — currently assumed equal to the
 *     base size; correct if Thread Lab charges an upsize premium.
 *   - Images: fetched at import time from threadlab.com.au Shopify product
 *     JSON (`/products/<slug>.json`) so all colour shots (front + back +
 *     lifestyle) are captured automatically.
 *
 * No stock data → all variants use `manage_inventory: false` (always
 * available), no stock location, no daily sync cron — same policy as Gildan
 * and Shaka Wear.
 *
 * Pricing: costs are ex-GST and feed the shared buildPriceLadder() with a
 * cost-adjustment of 1.0. Flat cost per size (Thread Lab's public pricing
 * doesn't differentiate by size; update if your wholesale invoice does).
 */

export type ThreadLabSize = {
  code: string
  /** Ex-GST wholesale cost in AUD — UPDATE FROM YOUR PRICE LIST */
  cost: number
}

export type ThreadLabStyle = {
  code: string
  handle: string
  /** URL slug used to fetch the Shopify product JSON */
  slug: string
  title: string
  description: string
  composition: string
  /** GSM weight for description text */
  gsm: number
  /** Estimated per-garment shipping weight in grams (calibrate against invoices) */
  weight_grams: number
  sizes: ThreadLabSize[]
  colours: string[]
  tags: string[]
  /** Medusa product_type value */
  product_type: string
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const THREAD_LAB_CATALOG: ThreadLabStyle[] = [
  {
    code: "CTEE",
    handle: "thread-lab-core-tee",
    slug: "core-tee",
    title: "Thread Lab Core Tee",
    description:
      "A premium 200 GSM unisex tee built for print. The Core Tee's relaxed straight-cut silhouette drapes clean across the body, making it the go-to blank for DTF, screen printing, and embroidery. 100% combed cotton with a tear-away neck label and pre-shrunk fabric for reliable print registration wash after wash. Ethically sourced. Same-day dispatch from Melbourne.\n\nFabric: 100% combed cotton\nWeight: 200 GSM\nFit: Relaxed unisex\nSizes: XS – 5XL",
    composition: "100% combed cotton",
    gsm: 200,
    weight_grams: 180,
    sizes: [
      { code: "XS", cost: 6.5 },
      { code: "S", cost: 6.5 },
      { code: "M", cost: 6.5 },
      { code: "L", cost: 6.5 },
      { code: "XL", cost: 6.5 },
      { code: "2XL", cost: 6.5 },
      { code: "3XL", cost: 6.5 },
      // ⚠ 4XL/5XL cost not confirmed — update if Thread Lab charges more
      { code: "4XL", cost: 6.5 },
      { code: "5XL", cost: 6.5 },
    ],
    colours: ["Black", "White", "Natural", "Grey"],
    tags: ["Unisex", "Short Sleeve"],
    product_type: "T-Shirts",
  },
  {
    code: "PTEE",
    handle: "thread-lab-premium-tee",
    slug: "premium-tee",
    title: "Thread Lab Premium Tee",
    description:
      "275 GSM oversized tee with 90s-inspired dropped shoulders and wide neck ribbing. The Premium Tee's boxy straight-cut frame provides a generous canvas for full-coverage artwork. 100% combed cotton, tear-away neck label, ethically sourced. Ships from Melbourne.\n\nFabric: 100% combed cotton\nWeight: 275 GSM\nFit: Oversized / Drop shoulder\nSizes: XS – 3XL",
    composition: "100% combed cotton",
    gsm: 275,
    weight_grams: 270,
    sizes: [
      { code: "XS", cost: 9.95 },
      { code: "S", cost: 9.95 },
      { code: "M", cost: 9.95 },
      { code: "L", cost: 9.95 },
      { code: "XL", cost: 9.95 },
      { code: "2XL", cost: 9.95 },
      { code: "3XL", cost: 9.95 },
    ],
    colours: ["White", "Black", "Natural", "Black Snow Wash"],
    tags: ["Unisex", "Short Sleeve", "Oversized"],
    product_type: "T-Shirts",
  },
  {
    code: "STEE",
    handle: "thread-lab-superior-tee",
    slug: "superior-tee",
    title: "Thread Lab Superior Tee",
    description:
      "The heaviest tee in the Core range at 260 GSM. The Superior Tee holds its shape through repeated wear with wide neck ribbing and a substantial drape that keeps printed artwork flat and crisp across the whole life of the garment. 100% combed cotton, tear-away neck label. Same-day dispatch from Melbourne.\n\nFabric: 100% combed cotton\nWeight: 260 GSM\nFit: Oversized unisex\nSizes: XS – 3XL",
    composition: "100% combed cotton",
    gsm: 260,
    weight_grams: 250,
    sizes: [
      { code: "XS", cost: 11.0 },
      { code: "S", cost: 11.0 },
      { code: "M", cost: 11.0 },
      { code: "L", cost: 11.0 },
      { code: "XL", cost: 11.0 },
      { code: "2XL", cost: 11.0 },
      { code: "3XL", cost: 11.0 },
    ],
    colours: ["Vanilla", "Black", "White", "Stone Blue"],
    tags: ["Unisex", "Short Sleeve", "Oversized"],
    product_type: "T-Shirts",
  },
  {
    code: "CHOODIE",
    handle: "thread-lab-core-hoodie",
    slug: "core-hoodie",
    title: "Thread Lab Core Hoodie",
    description:
      "340 GSM pullover hoodie built for print. The drop-shoulder design, ribbed cuffs and waistband, and preshrunk 80/20 cotton-polyester blend deliver reliable print registration across every wash cycle. Tear-away neck label. Same-day dispatch from Melbourne.\n\nFabric: 80% cotton, 20% polyester\nWeight: 340 GSM\nFit: Relaxed unisex\nSizes: XS – 3XL",
    composition: "80% cotton, 20% polyester",
    gsm: 340,
    weight_grams: 480,
    sizes: [
      { code: "XS", cost: 19.5 },
      { code: "S", cost: 19.5 },
      { code: "M", cost: 19.5 },
      { code: "L", cost: 19.5 },
      { code: "XL", cost: 19.5 },
      { code: "2XL", cost: 19.5 },
      { code: "3XL", cost: 19.5 },
    ],
    colours: ["Black", "Natural"],
    tags: ["Unisex"],
    product_type: "Hoodies",
  },
  {
    code: "CCREW",
    handle: "thread-lab-core-crew",
    slug: "core-crew",
    title: "Thread Lab Core Crew",
    description:
      "340 GSM crewneck sweatshirt with a relaxed drop-shoulder silhouette. Clean drape, ribbed finishes, tear-away neck label, and an 80/20 cotton-polyester blend that holds prints sharp wash after wash. Ships from Melbourne.\n\nFabric: 80% cotton, 20% polyester\nWeight: 340 GSM\nFit: Relaxed unisex\nSizes: XS – 3XL",
    composition: "80% cotton, 20% polyester",
    gsm: 340,
    weight_grams: 430,
    sizes: [
      { code: "XS", cost: 17.5 },
      { code: "S", cost: 17.5 },
      { code: "M", cost: 17.5 },
      { code: "L", cost: 17.5 },
      { code: "XL", cost: 17.5 },
      { code: "2XL", cost: 17.5 },
      { code: "3XL", cost: 17.5 },
    ],
    colours: ["Natural", "Black"],
    tags: ["Unisex"],
    product_type: "Crewneck Sweatshirts",
  },
  {
    code: "EQZ",
    handle: "thread-lab-elevated-quarter-zip",
    slug: "elevated-quarter-zip",
    title: "Thread Lab Elevated Quarter Zip",
    description:
      "480 GSM ultra-heavyweight quarter-zip in 100% spiro spun combed cotton. Boxy, cropped silhouette with side-seamed construction, double-needle hems, and ribbed collar — preshrunk and shrink-resistant. Built for premium decoration at any gauge.\n\nFabric: 100% spiro spun combed cotton\nWeight: 480 GSM\nFit: Boxy / Cropped\nSizes: XS – 3XL",
    composition: "100% spiro spun combed cotton",
    gsm: 480,
    weight_grams: 550,
    sizes: [
      { code: "XS", cost: 29.5 },
      { code: "S", cost: 29.5 },
      { code: "M", cost: 29.5 },
      { code: "L", cost: 29.5 },
      { code: "XL", cost: 29.5 },
      { code: "2XL", cost: 29.5 },
      { code: "3XL", cost: 29.5 },
    ],
    colours: ["Henna", "Slate"],
    tags: ["Unisex"],
    product_type: "Quarter Zips",
  },
  {
    code: "EHOOD",
    handle: "thread-lab-elevated-hoodie",
    slug: "elevated-hoodie",
    title: "Thread Lab Elevated Hoodie",
    description:
      "480 GSM preshrunk hoodie in 100% spiro spun combed cotton. Boxy, cropped silhouette with drop-shoulder design, ribbed trims, shoulder-to-shoulder taping, and a tear-away neck label — Thread Lab's flagship blank for premium embroidery and screen printing.\n\nFabric: 100% spiro spun combed cotton\nWeight: 480 GSM\nFit: Boxy / Cropped / Drop shoulder\nSizes: XS – 3XL",
    composition: "100% spiro spun combed cotton",
    gsm: 480,
    weight_grams: 600,
    sizes: [
      { code: "XS", cost: 32.5 },
      { code: "S", cost: 32.5 },
      { code: "M", cost: 32.5 },
      { code: "L", cost: 32.5 },
      { code: "XL", cost: 32.5 },
      { code: "2XL", cost: 32.5 },
      { code: "3XL", cost: 32.5 },
    ],
    colours: ["Slate", "Henna", "Jungle"],
    tags: ["Unisex"],
    product_type: "Hoodies",
  },
  {
    code: "ECREW",
    handle: "thread-lab-elevated-crew",
    slug: "elevated-crew",
    title: "Thread Lab Elevated Crew",
    description:
      "480 GSM double-rigged yarn crewneck in 100% spiro spun combed cotton. Oversized, boxy frame with drop shoulders, double-needle hems, and a tear-away neck label. Preshrunk and shrink-resistant — the crewneck that holds print detail through every wash.\n\nFabric: 100% spiro spun combed cotton\nWeight: 480 GSM\nFit: Oversized / Boxy / Drop shoulder\nSizes: XS – 3XL",
    composition: "100% spiro spun combed cotton",
    gsm: 480,
    weight_grams: 500,
    sizes: [
      { code: "XS", cost: 27.0 },
      { code: "S", cost: 27.0 },
      { code: "M", cost: 27.0 },
      { code: "L", cost: 27.0 },
      { code: "XL", cost: 27.0 },
      { code: "2XL", cost: 27.0 },
      { code: "3XL", cost: 27.0 },
    ],
    colours: ["Henna", "Slate"],
    tags: ["Unisex"],
    product_type: "Crewneck Sweatshirts",
  },
  {
    code: "EJOG",
    handle: "thread-lab-elevated-jogger",
    slug: "elevated-jogger",
    title: "Thread Lab Elevated Jogger",
    description:
      "480 GSM relaxed-fit jogger in 100% spiro spun combed cotton. Cuffless hem, side-seamed construction, and double-needle finishing throughout — the cleanest printed bottom-wear blank in the Thread Lab range.\n\nFabric: 100% spiro spun combed cotton\nWeight: 480 GSM\nFit: Relaxed unisex\nSizes: XS – 3XL",
    composition: "100% spiro spun combed cotton",
    gsm: 480,
    weight_grams: 400,
    sizes: [
      { code: "XS", cost: 26.5 },
      { code: "S", cost: 26.5 },
      { code: "M", cost: 26.5 },
      { code: "L", cost: 26.5 },
      { code: "XL", cost: 26.5 },
      { code: "2XL", cost: 26.5 },
      { code: "3XL", cost: 26.5 },
    ],
    colours: ["Slate", "Henna"],
    tags: ["Unisex"],
    product_type: "Track Pants",
  },
  {
    code: "ESHRT",
    handle: "thread-lab-elevated-shorts",
    slug: "elevated-shorts",
    title: "Thread Lab Elevated Shorts",
    description:
      "480 GSM premium shorts in 100% spiro spun combed cotton. Straight, relaxed cut with side-seamed construction, double-needle hems, and a tear-away label for a clean finish after decoration.\n\nFabric: 100% spiro spun combed cotton\nWeight: 480 GSM\nFit: Relaxed unisex\nSizes: XS – 3XL",
    composition: "100% spiro spun combed cotton",
    gsm: 480,
    weight_grams: 300,
    sizes: [
      { code: "XS", cost: 18.0 },
      { code: "S", cost: 18.0 },
      { code: "M", cost: 18.0 },
      { code: "L", cost: 18.0 },
      { code: "XL", cost: 18.0 },
      { code: "2XL", cost: 18.0 },
      { code: "3XL", cost: 18.0 },
    ],
    colours: ["Henna", "Slate"],
    tags: ["Unisex"],
    product_type: "Casual Shorts",
  },
]
