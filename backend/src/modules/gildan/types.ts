/**
 * Type shapes for the Gildan Brands Australia data file (xlsx).
 *
 * Gildan ships a single spreadsheet (1 sheet, ~5,400 rows × 47 cols)
 * covering Gildan, American Apparel, and Comfort Colors. Each row is one
 * SKU = one (style × colour × size) tuple. We group rows by (brand, style)
 * to form Medusa products.
 *
 * Distinct from the FashionBiz / Aussie Pacific modules in that there's
 * NO API client — the source is a static file uploaded by staff. The
 * module still exists so all the per-supplier knowledge (column mapping,
 * pricing tier resolution, brand handle map) lives in one discoverable
 * place.
 */

/** A single raw row read from the Gildan xlsx, normalised into a strong type. */
export type GildanRow = {
  /** col 0 — VendorSkuCode (Child). Unique per (style, colour, size). */
  vendorSkuChild: string
  /** col 1 — "Gildan", "American Apparel", "Comfort Colors". */
  brand: string
  /** col 2 — "Style (Parent)" — usually a 3-5 digit code (e.g. 102, 64000). Stringified. */
  styleParent: string
  /** col 3 — System name: full title with all attributes shoved together. Usually noisy. */
  productNameSystem: string
  /** col 4 — Customer-facing canonical title. Prefer over the system name. */
  descriptionOfItem: string
  /** col 6 — Verbose size label, e.g. "2XLARGE". */
  size: string
  /** col 7 — Canonical short size code, e.g. "2XL". */
  sizeCode: string
  /** col 8 — "Unisex" | "Womens" | "Youth" | "Toddler" | empty. The reliable demographic signal. */
  gender: string | null
  /** col 9 — Cut style, e.g. "Boxy Fit", "Classic Fit", "Oversized fit". */
  fit: string | null
  /** col 10 — Fabric composition, e.g. "100% Ring Spun Cotton". */
  fabricContent: string | null
  /** col 11 — Garment weight, e.g. "146g/m²". */
  fabricWeight: string | null
  /** col 14 — Comma-separated bullet-point feature list. */
  productFeatures: string | null
  /** col 15 — "Apparel" | "Apaprel" (typo, ~25 rows) | "Accessories". Top-level family. */
  dnProductType: string | null
  /** col 16 — "Adult" | "Ladies" | "Youth" | "Unisex" | "Accessories" | "Womens". Mostly demographic. */
  topTierCategory: string | null
  /** col 17 — Garment family: "T-Shirt" | "Fleece" | "Polo" | "French Terry" | "Bottoms" | "Tanks" | "Cap" | "Bags". */
  subcategory1: string | null
  /**
   * col 18 — Specific garment shape: "Crew Neck" | "V-Neck" | "Long Sleeve" |
   * "Hooded" | "Crewneck" | "Sweatshirt" | "Polo" | "Shorts" | "Pants" |
   * "Sweatpants" | "Jacket" | "Tank Top" | "Racerneck" | "Tote" | "Blanket" |
   * "Sueded" | "CVC" | "Polyester" | "T-SHIRT" | empty.
   *
   * Treated as the primary product_type signal; subcategory1 is the fallback.
   */
  subcategory2: string | null
  /** col 19 — Display colour name, e.g. "Blush". */
  colourName: string
  /** col 20 — Hex string with leading #, e.g. "#CCA1A6". */
  hex: string | null
  /**
   * col 22 — Hero image FILENAME only (e.g. "102_Blush_01.jpg") — no URL.
   * Resolved at import time via image-scraper.ts against the BigCommerce
   * storefront at gildanbrands.com.au.
   */
  heroImageFilename: string | null
  /**
   * cols 23-27 — Additional view filenames (front/side/back/full/detail).
   * Same filename-only convention; populated 1-5 entries, may be sparse.
   */
  viewSrcFilenames: string[]
  /** col 31 — Retail price including GST. Informational only — we set our own retail via the ladder. */
  rrpInc: number | null
  /** col 32 — "Heavyweight" account tier cost. Higher-volume customer rate. */
  heavyweightCost: number | null
  /** col 33 — "Midweight" account tier cost. */
  midweightCost: number | null
  /**
   * col 34 — "Classic" account tier cost. SC Prints' charged rate per Gildan
   * (ex GST). This is the input that flows into `buildPriceLadder()`.
   */
  classicCost: number | null
  /**
   * col 35 — Product URL on gildanbrands.com.au — one URL per style, all
   * colours/sizes for that style share the same URL. Used by the image
   * scraper to find CDN URLs for the row's image filenames.
   */
  productUrl: string | null
  /** col 36 — "Active" | "ACTIVE" | "NEW - INACTIVE". Inactive rows are skipped on import. */
  status: string
  /** col 38 — Gross weight per garment, in pounds. */
  weightPounds: number | null
  /** col 46 — Country code, e.g. "GT" (Guatemala) | "BD" (Bangladesh). */
  countryOfOrigin: string | null
}

/** Image bundle for one colour of one style — filenames only. */
export type GildanColourImages = {
  /** Hero image filename, e.g. "102_Blush_01.jpg". */
  hero: string | null
  /** Additional view filenames, sparse 1-5 entries. */
  views: string[]
}

/** One colour of a Gildan product — bundles its sizes and image filenames. */
export type GildanColour = {
  name: string
  hex: string | null
  images: GildanColourImages
  sizes: Array<{ sizeCode: string; sizeLabel: string; sku: string }>
}

/**
 * The grouped product-level shape after collapsing rows by (brand, style).
 * Demographic and classification fields are taken from the first row of
 * the group — every row in a group should share these (we don't enforce
 * but log if drift is detected).
 */
export type GildanProduct = {
  brand: string
  styleParent: string
  /** Cleaned, title-cased customer-facing title. */
  title: string
  gender: string | null
  fit: string | null
  fabricContent: string | null
  fabricWeight: string | null
  productFeatures: string | null
  dnProductType: string | null
  topTierCategory: string | null
  subcategory1: string | null
  subcategory2: string | null
  productUrl: string | null
  countryOfOrigin: string | null
  /** SC Prints' Classic-tier supplier cost (ex GST, AUD), the cheapest non-null per-style cost. */
  classicCost: number | null
  /** Suggested RRP (inc GST) — informational, not used for pricing. */
  rrpInc: number | null
  /** Average garment weight per variant in grams (derived from `weightPounds`). */
  weightGrams: number | null
  /** Per-colour breakdown, sorted by colour name. */
  colours: GildanColour[]
  /** "Active" / "ACTIVE" — every variant in this group has this status. */
  status: string
}

/**
 * Brand handles in the Brand module that map to the three Gildan house
 * brands. Handles MUST match what the seeder creates so the importer can
 * find them by handle. The parent brand handle is shared so the three
 * children rolling up into "Gildan Brands Australia" report cleanly.
 */
export const GILDAN_BRAND_HANDLE_BY_NAME: Record<string, string> = {
  Gildan: "gildan",
  "American Apparel": "american-apparel",
  "Comfort Colors": "comfort-colors",
}

export const GILDAN_BRAND_PARENT_HANDLE = "gildan-brands-australia"
export const GILDAN_BRAND_PARENT_NAME = "Gildan Brands Australia"
export const GILDAN_BRAND_PARENT_EXTERNAL_CODE = "GBA"
