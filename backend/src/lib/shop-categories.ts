/**
 * Shared category-inference logic for the Shop mega-menu.
 *
 * Owns:
 *  - the audience × garment-type category tree definition (with cross-listing)
 *  - title/type/tag/brand-based inference of which categories a product belongs to
 *  - the idempotent tree-creation + product-assignment helpers
 *
 * Audience model:
 *  - 7 top-level audiences: mens, womens, kids, workwear, corporates, accessories, spirits
 *  - Products can live in MULTIPLE audiences (denormalised cross-listing):
 *      Hi-Viz Womens Polo from Syzmik → womens-polos + workwear-polos + workwear-hi-viz-polos
 *      Mens Pocket Tee from AS Colour → mens-t-shirts + mens-pocket-tees
 *      Biz Corporates Mens Business Shirt → corporates-business-shirts + mens-business-shirts
 *
 * Detection signals (priority order):
 *  1. Brand-based: brand handle is in WORKWEAR_BRAND_HANDLES or CORPORATES_BRAND_HANDLES
 *  2. Tag-based: Hi-Vis tag → workwear + auto Hi-Viz subcategory
 *  3. Title-based: "Hi-Vis" / "Pocket" / "V-Neck" / "Quarter Zip" etc. keywords
 *  4. Fit-based: tag values "Active" / "Active Fit" → active-tees / active-polos etc.
 */

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"

export type CategoryHandle = string
export type AudienceKey =
  | "mens"
  | "womens"
  | "kids"
  | "workwear"
  | "corporates"
  | "healthcare"
  | "accessories"
  | "spirits"

export type SubCategoryDef = {
  name: string
  handle: CategoryHandle
}

export type AudienceDef = {
  name: string
  handle: CategoryHandle
  children: SubCategoryDef[]
}

// ============================================================
// SUBCATEGORY LISTS PER AUDIENCE
// ============================================================

// Mens + Womens share the same sub list — same garment vocabulary, just
// different demographic-audience hierarchy. 28 subs covering the full TCC
// mega-menu structure.
const APPAREL_SUBS: SubCategoryDef[] = [
  // T-Shirts cluster
  { name: "T-Shirts", handle: "t-shirts" },
  { name: "Long Sleeves", handle: "long-sleeves" },
  { name: "Pocket Tees", handle: "pocket-tees" },
  { name: "Active Tees", handle: "active-tees" },
  { name: "V-Necks", handle: "v-necks" },
  // Jackets / Vests cluster
  { name: "Softshell Jackets", handle: "softshell-jackets" },
  { name: "Rain Jackets", handle: "rain-jackets" },
  { name: "Puffer Jackets", handle: "puffer-jackets" },
  { name: "Active Jackets", handle: "active-jackets" },
  { name: "Puffer Vests", handle: "puffer-vests" },
  { name: "Softshell Vests", handle: "softshell-vests" },
  // Sweatshirts cluster
  { name: "Hoodies", handle: "hoodies" },
  { name: "Crewneck Sweatshirts", handle: "crewnecks" },
  { name: "Quarter Zips", handle: "quarter-zips" },
  { name: "Zip Up Hoodies", handle: "zip-hoodies" },
  { name: "Active Hoodies", handle: "active-hoods" },
  // Pants / Shorts cluster
  { name: "Active Shorts", handle: "active-shorts" },
  { name: "Casual Shorts", handle: "casual-shorts" },
  { name: "Track Pants", handle: "track-pants" },
  { name: "Casual Pants", handle: "casual-pants" },
  // Tanks / Singlets cluster
  { name: "Tanks", handle: "tanks" },
  { name: "Singlets", handle: "singlets" },
  { name: "Active Singlets", handle: "active-singlets" },
  // Polos / Shirts cluster
  { name: "Polos", handle: "polos" },
  { name: "Active Polos", handle: "active-polos" },
  { name: "Business Shirts", handle: "business-shirts" },
  { name: "Casual Shirts", handle: "casual-shirts" },
  { name: "Drill Shirts", handle: "drill-shirts" },
]

// Kids has the same fundamental vocabulary as adults but narrower — no
// business shirts / drill shirts / quarter zips / active variants.
const KIDS_SUBS: SubCategoryDef[] = [
  { name: "T-Shirts", handle: "t-shirts" },
  { name: "Long Sleeves", handle: "long-sleeves" },
  { name: "Pocket Tees", handle: "pocket-tees" },
  { name: "V-Necks", handle: "v-necks" },
  { name: "Hoodies", handle: "hoodies" },
  { name: "Crewneck Sweatshirts", handle: "crewnecks" },
  { name: "Zip Up Hoodies", handle: "zip-hoodies" },
  { name: "Polos", handle: "polos" },
  { name: "Tanks", handle: "tanks" },
  { name: "Singlets", handle: "singlets" },
  { name: "Track Pants", handle: "track-pants" },
  { name: "Casual Shorts", handle: "casual-shorts" },
  { name: "Casual Pants", handle: "casual-pants" },
  { name: "Puffer Jackets", handle: "puffer-jackets" },
  { name: "Softshell Jackets", handle: "softshell-jackets" },
  { name: "Puffer Vests", handle: "puffer-vests" },
]

// Workwear: each garment type has both a regular AND Hi-Viz variant.
// Hi-Viz products land in BOTH the regular sub AND the hi-viz-X sub
// (denormalised) so they're discoverable from either menu path.
const WORKWEAR_SUBS: SubCategoryDef[] = [
  // T-Shirts
  { name: "T-Shirts", handle: "t-shirts" },
  { name: "Long Sleeves", handle: "long-sleeves" },
  { name: "Hi-Viz T-Shirts", handle: "hi-viz-t-shirts" },
  { name: "Hi-Viz Long Sleeves", handle: "hi-viz-long-sleeves" },
  // Sweatshirts
  { name: "Hoodies", handle: "hoodies" },
  { name: "Crewneck Sweatshirts", handle: "crewnecks" },
  { name: "Quarter Zips", handle: "quarter-zips" },
  { name: "Hi-Viz Hoodies", handle: "hi-viz-hoodies" },
  { name: "Hi-Viz Crewnecks", handle: "hi-viz-crewnecks" },
  { name: "Hi-Viz Quarter Zips", handle: "hi-viz-quarter-zips" },
  // Tanks / Singlets
  { name: "Tanks", handle: "tanks" },
  { name: "Singlets", handle: "singlets" },
  { name: "Hi-Viz Tanks", handle: "hi-viz-tanks" },
  { name: "Hi-Viz Singlets", handle: "hi-viz-singlets" },
  // Polos / Shirts
  { name: "Polos", handle: "polos" },
  { name: "Drill Shirts", handle: "drill-shirts" },
  { name: "Business Shirts", handle: "business-shirts" },
  { name: "Work Shirts", handle: "work-shirts" },
  { name: "Hi-Viz Polos", handle: "hi-viz-polos" },
  { name: "Hi-Viz Drill Shirts", handle: "hi-viz-drill-shirts" },
  { name: "Hi-Viz Work Shirts", handle: "hi-viz-work-shirts" },
  { name: "Hi-Viz Business Shirts", handle: "hi-viz-business-shirts" },
  // Jackets / Vests
  { name: "Softshell Jackets", handle: "softshell-jackets" },
  { name: "Rain Jackets", handle: "rain-jackets" },
  { name: "Insulated Jackets", handle: "insulated-jackets" },
  { name: "Puffer Vests", handle: "puffer-vests" },
  { name: "Softshell Vests", handle: "softshell-vests" },
  { name: "Hi-Viz Softshell Jackets", handle: "hi-viz-softshell-jackets" },
  { name: "Hi-Viz Rain Jackets", handle: "hi-viz-rain-jackets" },
  { name: "Hi-Viz Insulated Jackets", handle: "hi-viz-insulated-jackets" },
  { name: "Hi-Viz Puffer Vests", handle: "hi-viz-puffer-vests" },
  { name: "Hi-Viz Softshell Vests", handle: "hi-viz-softshell-vests" },
  // Pants / Shorts
  { name: "Work Pants", handle: "work-pants" },
  { name: "Work Shorts", handle: "work-shorts" },
  { name: "Track Pants", handle: "track-pants" },
  { name: "Rain Pants", handle: "rain-pants" },
  { name: "Hi-Viz Pants", handle: "hi-viz-pants" },
]

// Corporates: office uniforms — Biz Corporates territory. No Hi-Viz here
// (that's Workwear's domain).
const CORPORATES_SUBS: SubCategoryDef[] = [
  { name: "Business Shirts", handle: "business-shirts" },
  { name: "Casual Shirts", handle: "casual-shirts" },
  { name: "Polos", handle: "polos" },
  { name: "Knitwear", handle: "knitwear" },
  { name: "Blazers", handle: "blazers" },
  { name: "Vests", handle: "vests" },
  { name: "Pants", handle: "pants" },
  { name: "Skirts", handle: "skirts" },
  { name: "Dresses", handle: "dresses" },
]

// Healthcare: medical/clinical uniforms — Biz Care territory. Scrubs, lab
// coats, medical polos. Distinct from Workwear (tradies/Hi-Vis/Industrial)
// because "Workwear" in Aussie English carries a tradie connotation that
// doesn't fit medical/clinical settings.
const HEALTHCARE_SUBS: SubCategoryDef[] = [
  { name: "Scrub Tops", handle: "scrub-tops" },
  { name: "Scrub Pants", handle: "scrub-pants" },
  { name: "Tunics", handle: "tunics" },
  { name: "Polos", handle: "polos" },
  { name: "Cardigans", handle: "cardigans" },
  { name: "Lab Coats", handle: "lab-coats" },
  { name: "Jackets", handle: "jackets" },
  { name: "Vests", handle: "vests" },
  { name: "Pants", handle: "pants" },
  { name: "Dresses", handle: "dresses" },
]

const ACCESSORY_SUBS: SubCategoryDef[] = [
  { name: "Headwear", handle: "headwear" },
  { name: "Bags", handle: "bags" },
  { name: "Aprons", handle: "aprons" },
  { name: "Socks", handle: "socks" },
  { name: "Drinkware", handle: "drinkware" },
  { name: "Stickers", handle: "stickers" },
  { name: "Other Accessories", handle: "other" },
]

const SPIRIT_SUBS: SubCategoryDef[] = [
  { name: "Vodka", handle: "vodka" },
  { name: "Gin", handle: "gin" },
  { name: "Whisky", handle: "whisky" },
  { name: "Rum", handle: "rum" },
  { name: "Tequila", handle: "tequila" },
  { name: "Cognac", handle: "cognac" },
  { name: "Champagne", handle: "champagne" },
  { name: "Liqueur", handle: "liqueur" },
  { name: "Mezcal", handle: "mezcal" },
]

export const TREE: AudienceDef[] = [
  { name: "Mens", handle: "mens", children: APPAREL_SUBS },
  { name: "Womens", handle: "womens", children: APPAREL_SUBS },
  { name: "Kids", handle: "kids", children: KIDS_SUBS },
  { name: "Workwear", handle: "workwear", children: WORKWEAR_SUBS },
  { name: "Corporates", handle: "corporates", children: CORPORATES_SUBS },
  { name: "Healthcare", handle: "healthcare", children: HEALTHCARE_SUBS },
  { name: "Accessories", handle: "accessories", children: ACCESSORY_SUBS },
  { name: "Spirits", handle: "spirits", children: SPIRIT_SUBS },
]

// ============================================================
// BRAND-BASED AUDIENCE ROUTING
// ============================================================

// Brand handles whose products are ALWAYS workwear — tradies / Hi-Viz /
// Industrial / Construction. Hi-Viz Womens Polo from Syzmik lands in
// Workwear (cross-listed with womens via the gender path).
//
// TODO: migrate to brand.metadata.audience_type so this isn't hardcoded.
// Hardcoded list works for the first ~20 brands we'll onboard; promote to
// data-driven once the list grows or staff need to flip the flag in admin.
const WORKWEAR_BRAND_HANDLES = new Set([
  "syzmik",
  "dnc-workwear",
  "dnc",
  "jbs-wear",
  "jb's-wear",
  "bisley",
  "hard-yakka",
  "king-gee",
  "ritemate",
])

// Brand handles whose products are ALWAYS corporates — office uniforms
// (business shirts, polos, blazers, knitwear, skirts, dresses).
const CORPORATES_BRAND_HANDLES = new Set([
  "biz-corporates",
  "gloweave",
])

// Brand handles whose products are ALWAYS healthcare — medical/clinical
// uniforms (scrubs, lab coats, medical polos). Distinct from Workwear
// because "workwear" in Aussie English implies tradies, not medical staff.
const HEALTHCARE_BRAND_HANDLES = new Set([
  "biz-care",
  // Future medical-uniform brands: greys-anatomy, cherokee, dickies-medical
])

// ============================================================
// PRODUCT TYPE → PRIMARY SUB-HANDLE MAPPING
// ============================================================

// Maps the canonical product_type to the primary subcategory handle in
// the apparel audiences (mens/womens/kids). Audience-specific inference
// in `inferSubsForAudience` may add additional fit/style-variant subs.
const TYPE_TO_SUB_HANDLE: Record<string, CategoryHandle> = {
  "t-shirts": "t-shirts",
  hoodies: "hoodies",
  sweatshirts: "crewnecks",
  polos: "polos",
  shirts: "casual-shirts",
  longsleeves: "long-sleeves",
  "long sleeves": "long-sleeves",
  "singlets / tanks": "tanks",
  "tanks / singlets": "tanks",
  singlets: "singlets",
  tanks: "tanks",
  jackets: "softshell-jackets",
  pants: "casual-pants",
  shorts: "casual-shorts",
  trackpants: "track-pants",
  overalls: "casual-pants",
  headwear: "headwear",
  bags: "bags",
  aprons: "aprons",
  socks: "socks",
  drinkware: "drinkware",
  stickers: "stickers",
  // Catch-alls for orphan-prone types.
  accessories: "other",
  underwear: "other",
}

const SPIRIT_TYPE_TO_SUB_HANDLE: Record<string, CategoryHandle> = {
  vodka: "vodka",
  gin: "gin",
  whisky: "whisky",
  whiskey: "whisky",
  bourbon: "whisky",
  scotch: "whisky",
  rum: "rum",
  tequila: "tequila",
  cognac: "cognac",
  champagne: "champagne",
  liqueur: "liqueur",
  mezcal: "mezcal",
}

// Types that always route to the accessories audience regardless of any
// demographic cue.
const ACCESSORY_TYPES = new Set([
  "headwear",
  "bags",
  "aprons",
  "socks",
  "drinkware",
  "stickers",
  "accessories",
  "underwear",
])

// ============================================================
// DETECTION REGEXES
// ============================================================

const KW_WOMENS = /\b(women|womens|woman|women's|ladies|ladie's|lady|female)s?\b/i
const KW_MENS = /\b(mens|men's|gents)\b/i
const KW_KIDS = /\b(kid|kids|youth|child|children|infant|baby|babies|toddler)s?\b/i

// Workwear / Hi-Vis signals
const KW_HIVIZ = /\bhi[-\s]?vi[zs]\b|\bhigh[-\s]vis(ibility)?\b|\bhivis\b/i
const KW_WORKWEAR_GENERIC = /\bworkwear\b|\btradies?\b|\bindustrial\b|\bsafety\b/i

// Fit / style variants
const KW_POCKET = /\bpocket\b/i
const KW_VNECK = /\bv-?neck\b/i
// "Half zip" pullovers are functionally the same sub as quarter-zips for
// our customers (chest-zip sweat, no full opening) — AS Colour uses both
// terms across their catalog.
const KW_QUARTER_ZIP = /\b(quarter|1\/4|half)[-\s]+zip\b/i
const KW_ZIPUP_HOOD = /\bzip[-\s]*(up)?[-\s]*hood/i
const KW_ACTIVE = /\bactive\b/i

// Jacket / vest subtypes
const KW_SOFTSHELL = /\bsoftshell\b|\bsoft[-\s]+shell\b/i
const KW_RAIN = /\brain\b|\bwaterproof\b/i
const KW_PUFFER = /\bpuffer\b|\bpadded\b/i
const KW_INSULATED = /\binsulat(ed|ion|ing)\b/i

// Shorts / pants subtypes
const KW_TRACK = /\btrack\b|\bjogger\b/i

// Polos / Shirts subtypes
const KW_DRILL = /\bdrill\b/i
const KW_BUSINESS = /\bbusiness\b|\bexecutive\b|\bcorporate\b/i

// Corporates subtypes
const KW_BLAZER = /\bblazer\b|\bsuit\s*jacket\b/i
const KW_KNIT = /\bknit\b|\bcardigan\b|\bjumper\b|\bsweater\b/i
const KW_DRESS = /\bdress\b/i
const KW_SKIRT = /\bskirt\b/i

// Healthcare subtypes
const KW_SCRUB_TOP = /\bscrub\s+top\b|\bscrub\s+shirt\b/i
const KW_SCRUB_PANT = /\bscrub\s+pant\b|\bscrub\s+trouser\b/i
const KW_SCRUB_GENERIC = /\bscrub(s)?\b/i
const KW_TUNIC = /\btunic\b/i
const KW_LAB_COAT = /\blab\s+coat\b|\blaboratory\s+coat\b/i
const KW_CARDIGAN = /\bcardigan\b|\bcardi\b/i
const KW_HEALTHCARE_GENERIC = /\b(medical|clinical|nursing|nurse|veterinary|pharmacy|dental|dentistry|healthcare|aged\s+care)\b/i

// ============================================================
// SIGNAL HELPERS
// ============================================================

function isWorkwearBrand(brandHandle: string | null | undefined): boolean {
  if (!brandHandle) return false
  return WORKWEAR_BRAND_HANDLES.has(brandHandle.toLowerCase())
}

function isCorporatesBrand(brandHandle: string | null | undefined): boolean {
  if (!brandHandle) return false
  return CORPORATES_BRAND_HANDLES.has(brandHandle.toLowerCase())
}

function isHealthcareBrand(brandHandle: string | null | undefined): boolean {
  if (!brandHandle) return false
  return HEALTHCARE_BRAND_HANDLES.has(brandHandle.toLowerCase())
}

function hasHiViz(title: string, tags: string[]): boolean {
  if (tags.some((t) => /\bhi[-\s]?vi[zs]\b/i.test(t))) return true
  return KW_HIVIZ.test(title)
}

function isWorkwearByContext(title: string, tags: string[]): boolean {
  if (hasHiViz(title, tags)) return true
  if (KW_WORKWEAR_GENERIC.test(title)) return true
  for (const t of tags) {
    const lower = t.trim().toLowerCase()
    // Healthcare is NOT a workwear signal — it routes to its own audience.
    // Hospitality is ambiguous (chef aprons vs. waitstaff polos) — skip.
    if (lower === "industrial" || lower === "construction") {
      return true
    }
  }
  return false
}

function isHealthcareByContext(title: string, tags: string[]): boolean {
  if (KW_HEALTHCARE_GENERIC.test(title)) return true
  if (KW_SCRUB_GENERIC.test(title)) return true
  if (KW_LAB_COAT.test(title)) return true
  for (const t of tags) {
    const lower = t.trim().toLowerCase()
    if (
      lower === "healthcare" ||
      lower === "pharmacy" ||
      lower === "dentistry" ||
      lower === "veterinary" ||
      lower === "aged care" ||
      lower === "medical" ||
      lower === "clinical"
    ) {
      return true
    }
  }
  return false
}

function hasActiveFit(title: string, tags: string[]): boolean {
  if (tags.some((t) => /^active(\s+fit)?$/i.test(t.trim()))) return true
  return KW_ACTIVE.test(title)
}

// ============================================================
// CORE INFERENCE
// ============================================================

export type InferenceContext = {
  title: string
  typeValue: string | null
  tags?: string[]
  brandHandle?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Determine the audience cohorts a product belongs to. A product can belong
 * to MULTIPLE audiences (cross-listing).
 *
 * Examples:
 *  - Hi-Viz Womens Polo from Syzmik → ["workwear", "womens"]
 *  - Biz Corporates Mens Business Shirt → ["corporates", "mens"]
 *  - AS Colour Mens Pocket Tee → ["mens"]
 *  - Unisex t-shirt with no demographic cue → ["mens", "womens"]
 *  - Apron → ["accessories"] only (accessories override demographic)
 */
export function inferAudiences(ctx: InferenceContext): AudienceKey[] {
  // Bottles → spirits exclusively.
  if (ctx.metadata && ctx.metadata.product_class === "bottle") {
    return ["spirits"]
  }

  const audiences = new Set<AudienceKey>()
  const title = ctx.title ?? ""
  const tags = ctx.tags ?? []
  const normalizedType = (ctx.typeValue ?? "").trim().toLowerCase()

  // Accessory-typed products short-circuit to the accessories audience.
  if (normalizedType && ACCESSORY_TYPES.has(normalizedType)) {
    return ["accessories"]
  }

  // Healthcare via brand OR detected context. Checked BEFORE workwear so
  // a "Healthcare Polo" doesn't accidentally trip the workwear context
  // checker (it won't — different keywords — but defensive ordering).
  if (
    isHealthcareBrand(ctx.brandHandle) ||
    isHealthcareByContext(title, tags)
  ) {
    audiences.add("healthcare")
  }

  // Workwear via brand OR detected context (tradies/Hi-Viz/Industrial only).
  if (isWorkwearBrand(ctx.brandHandle) || isWorkwearByContext(title, tags)) {
    audiences.add("workwear")
  }

  // Corporates via brand.
  if (isCorporatesBrand(ctx.brandHandle)) {
    audiences.add("corporates")
  }

  // Demographic-based audience (cross-listed with workwear/corporates if applicable).
  if (KW_KIDS.test(title)) {
    audiences.add("kids")
  } else if (KW_WOMENS.test(title)) {
    audiences.add("womens")
  } else if (KW_MENS.test(title)) {
    audiences.add("mens")
  } else {
    // Unisex fallback — assign to both mens AND womens.
    audiences.add("mens")
    audiences.add("womens")
  }

  return Array.from(audiences)
}

/**
 * For a given audience, determine all subcategory handles the product
 * belongs to. Multi-sub when fit/style variants apply.
 */
function inferSubsForAudience(
  audience: AudienceKey,
  ctx: InferenceContext
): CategoryHandle[] {
  const title = ctx.title ?? ""
  const tags = ctx.tags ?? []
  const normalizedType = (ctx.typeValue ?? "").trim().toLowerCase()
  const subs = new Set<CategoryHandle>()

  // Spirits — bottle metadata only.
  if (audience === "spirits") {
    if (ctx.metadata && ctx.metadata.product_class === "bottle") {
      const spirit = (ctx.metadata.spirit_type as string | undefined)
        ?.trim()
        .toLowerCase()
      if (spirit && SPIRIT_TYPE_TO_SUB_HANDLE[spirit]) {
        subs.add(SPIRIT_TYPE_TO_SUB_HANDLE[spirit])
      }
    }
    return Array.from(subs)
  }

  // Accessories — straight type→sub lookup.
  if (audience === "accessories") {
    const sub = TYPE_TO_SUB_HANDLE[normalizedType]
    if (sub && ACCESSORY_SUBS.some((s) => s.handle === sub)) {
      subs.add(sub)
    }
    return Array.from(subs)
  }

  // Corporates — keyword-driven routing (Biz Corporates' product line).
  // Default for shirt-like garments is business-shirts because Biz
  // Corporates is the office/business-wear brand — explicit "casual" in
  // the title overrides to casual-shirts.
  if (audience === "corporates") {
    if (KW_DRESS.test(title) && !KW_DRILL.test(title)) subs.add("dresses")
    if (KW_SKIRT.test(title)) subs.add("skirts")
    if (KW_BLAZER.test(title)) subs.add("blazers")
    if (KW_KNIT.test(title)) subs.add("knitwear")
    if (/\bvest\b/i.test(title)) subs.add("vests")

    if (normalizedType === "polos") subs.add("polos")
    if (normalizedType === "pants") subs.add("pants")

    // A button-up "shirt" — type=Shirts OR (type=Longsleeves with "shirt"
    // in title — common pattern for Biz Corporates long-sleeve business
    // shirts which the title-fallback routes to type=Longsleeves). Excludes
    // T-shirts / Tees / Polos to avoid misclassification.
    const isShirtTitle =
      /\bshirt\b/i.test(title) &&
      !/\bt[-\s]?shirt\b|\btee\b|\bpolo\b/i.test(title)
    const isCorporateShirt =
      normalizedType === "shirts" ||
      (normalizedType === "longsleeves" && isShirtTitle) ||
      isShirtTitle

    if (isCorporateShirt) {
      if (/\bcasual\b/i.test(title)) subs.add("casual-shirts")
      else subs.add("business-shirts")
    }

    return Array.from(subs)
  }

  // Healthcare — keyword + type-driven routing (Biz Care's clinical line).
  // Title takes priority over type because Biz Care often categorises their
  // scrubs as generic "Shirts" / "Pants" at the API level, and the title
  // (e.g. "Womens Comfort Scrub Top") is the most reliable signal.
  if (audience === "healthcare") {
    // Title-driven medical-specific subs first.
    if (KW_SCRUB_TOP.test(title)) subs.add("scrub-tops")
    else if (KW_SCRUB_PANT.test(title)) subs.add("scrub-pants")
    else if (KW_SCRUB_GENERIC.test(title)) subs.add("scrub-tops")
    if (KW_TUNIC.test(title)) subs.add("tunics")
    if (KW_LAB_COAT.test(title)) subs.add("lab-coats")
    if (KW_CARDIGAN.test(title)) subs.add("cardigans")

    // Type-driven medical-specific subs.
    if (normalizedType === "scrub tops") subs.add("scrub-tops")
    if (normalizedType === "scrub pants") subs.add("scrub-pants")
    if (normalizedType === "tunics") subs.add("tunics")
    if (normalizedType === "lab coats") subs.add("lab-coats")
    if (normalizedType === "cardigans") subs.add("cardigans")

    // General types that also exist in HEALTHCARE_SUBS — these cross-list
    // with the gender audience too (a Biz Care medical polo also appears
    // in womens-polos so it's discoverable without a healthcare browse).
    if (normalizedType === "polos") subs.add("polos")
    if (normalizedType === "pants" && !KW_SCRUB_PANT.test(title)) {
      subs.add("pants")
    }
    if (normalizedType === "jackets" || /\bjacket\b/i.test(title)) {
      subs.add("jackets")
    }
    if (/\bvest\b/i.test(title)) subs.add("vests")
    if (KW_DRESS.test(title)) subs.add("dresses")

    return Array.from(subs)
  }

  // Workwear — type→sub plus Hi-Viz cross-listing. Title takes priority
  // over type when the title is more specific (e.g. "Long Sleeve Tee" with
  // type=T-Shirts should land in long-sleeves, not just t-shirts).
  if (audience === "workwear") {
    const isHiViz = hasHiViz(title, tags)
    const baseSubs = new Set<string>()
    const isLongSleeveTitle = /\blong\s+sleeve\b/i.test(title)
    const isQuarterZipTitle = KW_QUARTER_ZIP.test(title)

    // Type-based mapping (matches WORKWEAR_SUBS handles).
    let typeSub: string | undefined
    switch (normalizedType) {
      case "t-shirts":
        // Long Sleeve Tee with type=T-Shirts → long-sleeves takes priority
        typeSub = isLongSleeveTitle ? "long-sleeves" : "t-shirts"
        break
      case "longsleeves":
      case "long sleeves":
        typeSub = "long-sleeves"
        break
      case "polos":
        // "Long Sleeve Polo" still classified as polo (no long-sleeve-polos sub)
        typeSub = "polos"
        break
      case "shirts":
        if (KW_DRILL.test(title)) typeSub = "drill-shirts"
        else if (KW_BUSINESS.test(title)) typeSub = "business-shirts"
        else typeSub = "work-shirts"
        break
      case "hoodies":
        typeSub = isQuarterZipTitle ? "quarter-zips" : "hoodies"
        break
      case "sweatshirts":
        typeSub = isQuarterZipTitle ? "quarter-zips" : "crewnecks"
        break
      case "tanks":
        typeSub = "tanks"
        break
      case "singlets":
      case "singlets / tanks":
      case "tanks / singlets":
        typeSub = "singlets"
        break
      case "jackets":
        if (KW_RAIN.test(title)) typeSub = "rain-jackets"
        else if (KW_INSULATED.test(title)) typeSub = "insulated-jackets"
        else typeSub = "softshell-jackets"
        break
      case "pants":
        typeSub = "work-pants"
        break
      case "shorts":
        typeSub = "work-shorts"
        break
      case "trackpants":
        typeSub = "track-pants"
        break
    }
    if (typeSub) baseSubs.add(typeSub)

    // Vest detection — no specific type, title-driven.
    if (baseSubs.size === 0 && /\bvest\b/i.test(title)) {
      if (KW_SOFTSHELL.test(title)) baseSubs.add("softshell-vests")
      else baseSubs.add("puffer-vests")
    }

    // Quarter-zip override for any title (in case type isn't hoodies/sweatshirts)
    if (isQuarterZipTitle) baseSubs.add("quarter-zips")

    // Long-sleeve always-add for cross-listing (e.g. a Long Sleeve Polo gets
    // both polos AND long-sleeves so customers browsing long-sleeves see it)
    if (isLongSleeveTitle && WORKWEAR_SUBS.some((s) => s.handle === "long-sleeves")) {
      baseSubs.add("long-sleeves")
    }

    for (const baseSub of baseSubs) {
      subs.add(baseSub)
      // Cross-list to the hi-viz-X variant if applicable + the variant exists.
      if (isHiViz) {
        const hiVizHandle = `hi-viz-${baseSub}`
        if (WORKWEAR_SUBS.some((s) => s.handle === hiVizHandle)) {
          subs.add(hiVizHandle)
        }
      }
    }

    return Array.from(subs)
  }

  // Apparel audiences (mens / womens / kids) — type→sub plus fit/style variants.
  const audienceSubs = audience === "kids" ? KIDS_SUBS : APPAREL_SUBS
  const has = (handle: string) =>
    audienceSubs.some((s) => s.handle === handle)

  // Base type→sub from the generic map.
  const baseSub = TYPE_TO_SUB_HANDLE[normalizedType]
  if (baseSub && has(baseSub)) subs.add(baseSub)

  // T-Shirts variants
  if (
    normalizedType === "t-shirts" ||
    /\btee\b|\bt-shirt\b/i.test(title)
  ) {
    if (KW_POCKET.test(title) && has("pocket-tees")) subs.add("pocket-tees")
    if (KW_VNECK.test(title) && has("v-necks")) subs.add("v-necks")
    if (hasActiveFit(title, tags) && has("active-tees")) subs.add("active-tees")
  }

  // Long sleeves — also handle "Long Sleeve T-Shirt" → long-sleeves
  if (/\blong\s+sleeve\b/i.test(title) && has("long-sleeves")) {
    subs.add("long-sleeves")
  }

  // Sweatshirts / Hoodies variants
  if (
    normalizedType === "hoodies" ||
    normalizedType === "sweatshirts" ||
    /\bhood\b|\bsweat\b|\bcrew\b/i.test(title)
  ) {
    if (KW_QUARTER_ZIP.test(title) && has("quarter-zips")) subs.add("quarter-zips")
    if (KW_ZIPUP_HOOD.test(title) && has("zip-hoodies")) subs.add("zip-hoodies")
    if (hasActiveFit(title, tags) && has("active-hoods")) subs.add("active-hoods")
    if (/\bcrew\b/i.test(title) && has("crewnecks")) subs.add("crewnecks")
  }

  // Polos variants
  if (normalizedType === "polos") {
    if (hasActiveFit(title, tags) && has("active-polos")) subs.add("active-polos")
  }

  // Singlets variants
  if (/\bsinglet\b/i.test(title) || normalizedType === "singlets") {
    if (hasActiveFit(title, tags) && has("active-singlets")) {
      subs.add("active-singlets")
    }
  }

  // Shirts subtypes — split business vs casual vs drill.
  if (normalizedType === "shirts") {
    // Remove the default "casual-shirts" from baseSub if a more specific
    // signal matches.
    if (KW_DRILL.test(title) && has("drill-shirts")) {
      subs.delete("casual-shirts")
      subs.add("drill-shirts")
    } else if (KW_BUSINESS.test(title) && has("business-shirts")) {
      subs.delete("casual-shirts")
      subs.add("business-shirts")
    }
  }

  // Long Sleeve Shirt (button-up) — title contains "shirt" but not "tee" /
  // "polo" / "t-shirt", AND title contains "long sleeve". Cross-list into
  // business-shirts so a customer browsing Mens > Business Shirts sees the
  // Biz Corporates Hudson and similar long-sleeve formals.
  const isLongSleeveButtonShirt =
    /\blong\s+sleeve\s+shirt\b/i.test(title) &&
    !/\bt[-\s]?shirt\b|\btee\b|\bpolo\b/i.test(title)
  if (isLongSleeveButtonShirt) {
    if (KW_DRILL.test(title) && has("drill-shirts")) subs.add("drill-shirts")
    else if (/\bcasual\b/i.test(title) && has("casual-shirts")) {
      subs.add("casual-shirts")
    } else if (has("business-shirts")) subs.add("business-shirts")
  }

  // Jackets subtypes
  if (normalizedType === "jackets" || /\bjacket\b/i.test(title)) {
    if (KW_SOFTSHELL.test(title) && has("softshell-jackets")) {
      subs.add("softshell-jackets")
    } else if (KW_RAIN.test(title) && has("rain-jackets")) {
      subs.delete("softshell-jackets")
      subs.add("rain-jackets")
    } else if (KW_PUFFER.test(title) && has("puffer-jackets")) {
      subs.delete("softshell-jackets")
      subs.add("puffer-jackets")
    } else if (hasActiveFit(title, tags) && has("active-jackets")) {
      subs.delete("softshell-jackets")
      subs.add("active-jackets")
    }
  }

  // Vests
  if (/\bvest\b/i.test(title)) {
    if (KW_SOFTSHELL.test(title) && has("softshell-vests")) {
      subs.add("softshell-vests")
    } else if (has("puffer-vests")) {
      subs.add("puffer-vests")
    }
  }

  // Pants subtypes
  if (normalizedType === "pants" || /\bpant\b/i.test(title)) {
    if (KW_TRACK.test(title) && has("track-pants")) {
      subs.delete("casual-pants")
      subs.add("track-pants")
    }
  }
  if (normalizedType === "shorts" || /\bshort\b/i.test(title)) {
    if (hasActiveFit(title, tags) && has("active-shorts")) {
      subs.delete("casual-shorts")
      subs.add("active-shorts")
    }
  }
  if (normalizedType === "trackpants" && has("track-pants")) {
    subs.add("track-pants")
  }

  return Array.from(subs)
}

/**
 * Resolve every category handle a product should be assigned to. Combines
 * `inferAudiences` × `inferSubsForAudience` and returns the full list of
 * fully-qualified `<audience>-<sub>` handles.
 */
export function resolveCategoryHandles(
  ctx: InferenceContext
): CategoryHandle[] {
  const audiences = inferAudiences(ctx)
  const handles = new Set<CategoryHandle>()
  for (const audience of audiences) {
    const subs = inferSubsForAudience(audience, ctx)
    for (const sub of subs) {
      handles.add(`${audience}-${sub}`)
    }
  }
  return Array.from(handles)
}

// Backwards-compat thin wrappers — old callers used the 3-arg signature.
export function inferAudience(
  title: string,
  typeValue: string | null,
  metadata?: Record<string, unknown> | null
): AudienceKey[] {
  return inferAudiences({ title, typeValue, metadata })
}

export function inferSubHandle(
  typeValue: string | null,
  metadata?: Record<string, unknown> | null
): CategoryHandle | null {
  const subs = inferSubsForAudience("mens", {
    title: "",
    typeValue,
    metadata,
  })
  return subs[0] ?? null
}

// ============================================================
// CATEGORY TREE PERSISTENCE
// ============================================================

type CategoryRow = {
  id: string
  name: string
  handle: string
  parent_category_id: string | null
}

type LoggerLike = {
  info: (msg: string) => void
  warn?: (msg: string) => void
  error?: (msg: string) => void
}

type ContainerLike = {
  resolve: <T = unknown>(key: unknown) => T
}

export async function loadCategoryIdsByHandle(
  container: ContainerLike
): Promise<Map<string, string>> {
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const map = new Map<string, string>()
  for (const c of (data ?? []) as CategoryRow[]) {
    if (c.handle && c.id) map.set(c.handle, c.id)
  }
  return map
}

export async function ensureCategoryTree(
  container: ContainerLike,
  options: { dryRun?: boolean; logger?: LoggerLike } = {}
): Promise<Map<string, string>> {
  const dryRun = !!options.dryRun
  const logger = options.logger ?? { info: () => {} }

  const byHandle = await loadCategoryIdsByHandle(container)

  const topToCreate = TREE.filter((t) => !byHandle.has(t.handle)).map((t) => ({
    name: t.name,
    handle: t.handle,
    is_active: true,
  }))
  if (topToCreate.length) {
    if (dryRun) {
      logger.info?.(
        `[dry-run] would create ${topToCreate.length} audience categories: ${topToCreate
          .map((t) => t.handle)
          .join(", ")}`
      )
    } else {
      const { result } = await createProductCategoriesWorkflow(
        container as any
      ).run({
        input: { product_categories: topToCreate },
      })
      for (const c of result as CategoryRow[]) byHandle.set(c.handle, c.id)
      logger.info?.(
        `Created ${result.length} audience categories: ${(result as CategoryRow[])
          .map((c) => c.handle)
          .join(", ")}`
      )
    }
  }

  const subToCreate: Array<{
    name: string
    handle: string
    is_active: boolean
    parent_category_id: string
  }> = []
  for (const audience of TREE) {
    const parentId = byHandle.get(audience.handle)
    if (!parentId) continue
    for (const sub of audience.children) {
      const fullHandle = `${audience.handle}-${sub.handle}`
      if (byHandle.has(fullHandle)) continue
      subToCreate.push({
        name: sub.name,
        handle: fullHandle,
        is_active: true,
        parent_category_id: parentId,
      })
    }
  }
  if (subToCreate.length) {
    if (dryRun) {
      logger.info?.(
        `[dry-run] would create ${subToCreate.length} sub-categories`
      )
    } else {
      const { result } = await createProductCategoriesWorkflow(
        container as any
      ).run({
        input: { product_categories: subToCreate },
      })
      for (const c of result as CategoryRow[]) byHandle.set(c.handle, c.id)
      logger.info?.(`Created ${result.length} sub-categories`)
    }
  }

  return byHandle
}

// ============================================================
// PRODUCT → CATEGORY ASSIGNMENT
// ============================================================

export type AssignmentSummary = {
  updated: number
  skipped: number
  untyped: number
  failures: number
  sample: string[]
}

type ProductRow = {
  id: string
  title: string
  type: { value: string | null } | null
  tags: Array<{ value: string }> | null
  categories: Array<{ id: string; handle: string }> | null
  metadata: Record<string, unknown> | null
  brand: Array<{ handle: string }> | { handle: string } | null
}

export async function assignCategoriesToProducts(
  container: ContainerLike,
  byHandle: Map<string, string>,
  options: {
    productIds?: string[]
    dryRun?: boolean
    logger?: LoggerLike
  } = {}
): Promise<AssignmentSummary> {
  const dryRun = !!options.dryRun
  const logger = options.logger ?? { info: () => {} }
  const query = container.resolve<any>(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve<any>(Modules.PRODUCT) as {
    updateProducts: (
      id: string,
      data: { category_ids?: string[] }
    ) => Promise<unknown>
  }

  const filters = options.productIds ? { id: options.productIds } : undefined
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "type.value",
      "tags.value",
      "categories.id",
      "categories.handle",
      "metadata",
      "brand.handle",
    ],
    filters,
  })

  const rows = (data ?? []) as ProductRow[]

  const summary: AssignmentSummary = {
    updated: 0,
    skipped: 0,
    untyped: 0,
    failures: 0,
    sample: [],
  }

  for (const product of rows) {
    const typeValue = product.type?.value ?? null
    const tags = (product.tags ?? []).map((t) => t.value)
    // Brand link uses isList:true on the product side — comes back as
    // either an array or a single object depending on Medusa version.
    const brandLink = Array.isArray(product.brand)
      ? product.brand[0]
      : product.brand
    const brandHandle = brandLink?.handle ?? null

    const targetHandles = resolveCategoryHandles({
      title: product.title ?? "",
      typeValue,
      tags,
      brandHandle,
      metadata: product.metadata ?? null,
    })
    if (targetHandles.length === 0) {
      summary.untyped++
      continue
    }
    const targetIds = targetHandles
      .map((h) => byHandle.get(h))
      .filter((id): id is string => !!id)
    if (targetIds.length === 0) {
      summary.untyped++
      continue
    }

    const existingShopIds = new Set(
      (product.categories ?? [])
        .filter((c) => {
          const handle = c.handle ?? ""
          return TREE.some((t) => handle.startsWith(`${t.handle}-`))
        })
        .map((c) => c.id)
    )
    const targetSet = new Set(targetIds)
    const sameSet =
      existingShopIds.size === targetSet.size &&
      [...targetSet].every((id) => existingShopIds.has(id))
    if (sameSet) {
      summary.skipped++
      continue
    }

    const preservedIds = (product.categories ?? [])
      .map((c) => c.id)
      .filter((id) => !existingShopIds.has(id))
    const finalIds = Array.from(new Set([...preservedIds, ...targetIds]))

    if (summary.sample.length < 10) {
      summary.sample.push(
        `  ${product.title} → ${targetHandles.join(", ")} (type=${typeValue ?? "—"}, brand=${brandHandle ?? "—"})`
      )
    }

    if (dryRun) {
      summary.updated++
      continue
    }

    try {
      await productModule.updateProducts(product.id, { category_ids: finalIds })
      summary.updated++
    } catch (err) {
      summary.failures++
      logger.error?.(
        `Failed to update product ${product.id} (${product.title}): ${(err as Error)?.message ?? err}`
      )
    }
  }

  return summary
}
