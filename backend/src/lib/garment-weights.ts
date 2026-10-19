/**
 * Estimated per-unit garment weight (grams) by `product.type.value`.
 *
 * Shippit prices a consignment purely on total weight, so a product with no
 * weight falls back to SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS (300 g) and tees get
 * over-quoted while hoodies get under-quoted. These are blank-garment
 * ESTIMATES (adult M, no packaging) — to be confirmed by Sean against a few
 * real cartons before the backfill is applied on prod. Real per-variant
 * weights (e.g. JB's Wear carton data) always take precedence.
 *
 * Keys are matched case-insensitively. Includes both the storefront sub-type
 * names and the coarser canonical values from PRODUCT_TYPE_ALIASES
 * ("Jackets", "Shirts", "Headwear", …) so either vocabulary resolves.
 */
export const GARMENT_WEIGHT_GRAMS_BY_TYPE: Record<string, number> = {
  // Tees
  "T-Shirts": 200,
  "Pocket Tees": 200,
  "V-Necks": 200,
  "Active Tees": 200,
  "Long Sleeves": 200,
  Longsleeves: 200,
  // Sleeveless
  Tanks: 150,
  Singlets: 150,
  // Polos
  Polos: 250,
  "Active Polos": 250,
  // Shirts
  "Business Shirts": 300,
  "Casual Shirts": 300,
  "Drill Shirts": 300,
  Shirts: 300,
  // Fleece
  "Crewneck Sweatshirts": 450,
  Sweatshirts: 450,
  Hoodies: 550,
  "Zip Up Hoodies": 550,
  "Active Hoods": 550,
  "Quarter Zips": 450,
  // Outerwear
  "Softshell Jackets": 600,
  "Rain Jackets": 600,
  Jackets: 600,
  "Puffer Jackets": 700,
  Vests: 400,
  // Bottoms
  Shorts: 250,
  "Track Pants": 450,
  Trackpants: 450,
  "Casual Pants": 450,
  Pants: 450,
  // Headwear
  Caps: 100,
  Beanies: 100,
  Headwear: 100,
  // Bags
  Bags: 150,
  Totes: 150,
  // Misc
  Socks: 60,
  "Scrub Tops": 220,
  "Scrub Pants": 300,
  Aprons: 200,
}

const BY_LOWER = new Map(
  Object.entries(GARMENT_WEIGHT_GRAMS_BY_TYPE).map(([k, v]) => [k.toLowerCase(), v])
)

/** Estimated grams for a product type, or null when the type is unknown/blank. */
export const pickGarmentWeightGrams = (
  typeValue: string | null | undefined
): number | null => {
  const key = typeValue?.trim().toLowerCase()
  if (!key) return null
  return BY_LOWER.get(key) ?? null
}
