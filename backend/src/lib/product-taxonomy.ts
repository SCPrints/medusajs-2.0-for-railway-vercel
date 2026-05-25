import type { AsColourProduct } from "../modules/ascolour/types"
import type { FashionBizProduct } from "../modules/fashionbiz/types"
import type { AussiePacificProduct } from "../modules/aussiepacific/types"

// Canonical product type names — must match create-product-types.ts exactly.
// All alias keys are lowercase; the values are the exact Medusa ProductType.value strings.
export const PRODUCT_TYPE_ALIASES: Record<string, string> = {
  // T-Shirts
  "tee": "T-Shirts",
  "tees": "T-Shirts",
  "t-shirt": "T-Shirts",
  "t-shirts": "T-Shirts",
  "t shirt": "T-Shirts",
  "t shirts": "T-Shirts",
  "tshirt": "T-Shirts",
  "tshirts": "T-Shirts",
  "basic tee": "T-Shirts",
  "ss tee": "T-Shirts",
  "short sleeve t-shirts": "T-Shirts",
  "short sleeve t-shirt": "T-Shirts",
  // Athletic / casual variants treated as T-Shirts in the canonical type
  // list — "Jersey" (rugby/baseball), "One-piece" (infant bodysuit) are
  // shirt-shaped enough to live here; the sub-router decides the fine
  // grain.
  "jersey": "T-Shirts",
  "jerseys": "T-Shirts",
  "baseball jersey": "T-Shirts",
  "rugby jersey": "T-Shirts",
  "one piece": "T-Shirts",
  "onepiece": "T-Shirts",
  "onesie": "T-Shirts",
  "onesies": "T-Shirts",
  "bodysuit": "T-Shirts",
  "romper": "T-Shirts",
  // Polos
  "polo": "Polos",
  "polos": "Polos",
  "polo shirt": "Polos",
  "polo shirts": "Polos",
  // Hoodies — including AS Colour's "Hooded Sweatshirts" / "Zip Sweatshirts"
  // (most AS Colour zip styles are zip hoodies; the few non-hooded zip crews
  // can be re-categorised manually in admin). "Hood" is AS Colour's shorthand
  // for hoodie — they title products "Heavy Hood", "Stencil Hood", "Wo's
  // Relax Hood" etc. Without the alias these fall through title-inference.
  "hoodie": "Hoodies",
  "hoodies": "Hoodies",
  "hood": "Hoodies",
  "hoods": "Hoodies",
  "hooded": "Hoodies",
  "pullover hoodie": "Hoodies",
  "zip hoodie": "Hoodies",
  "zip up hoodie": "Hoodies",
  "zip-up hoodie": "Hoodies",
  "zip hood": "Hoodies",
  "zip up hood": "Hoodies",
  "half zip hood": "Hoodies",
  "hooded sweatshirt": "Hoodies",
  "hooded sweatshirts": "Hoodies",
  "zip sweatshirt": "Hoodies",
  "zip sweatshirts": "Hoodies",
  // Sweatshirts / Crews (non-hooded). "Half Zip" is AS Colour shorthand for
  // a quarter-zip pullover sweat (no hood); shop-categories.ts further
  // routes it to the quarter-zips sub via KW_QUARTER_ZIP.
  "sweatshirt": "Sweatshirts",
  "sweatshirts": "Sweatshirts",
  "crew": "Sweatshirts",
  "crew neck": "Sweatshirts",
  "crewneck": "Sweatshirts",
  "crew sweatshirt": "Sweatshirts",
  "crew sweatshirts": "Sweatshirts",
  "half zip": "Sweatshirts",
  "half-zip": "Sweatshirts",
  "quarter zip": "Sweatshirts",
  "quarter-zip": "Sweatshirts",
  "1/4 zip": "Sweatshirts",
  // Shirts (woven / work / dress)
  "shirt": "Shirts",
  "shirts": "Shirts",
  "work shirt": "Shirts",
  "business shirt": "Shirts",
  "short sleeve shirt": "Shirts",
  "ss shirt": "Shirts",
  "shirting and tops": "Shirts",
  // Healthcare uniforms — Biz Care territory. These canonical types
  // route to the `healthcare-*` audience subs (scrub-tops / scrub-pants /
  // tunics / lab-coats / cardigans). Generic "scrubs" defaults to tops.
  "scrubs": "Scrub Tops",
  "scrub": "Scrub Tops",
  "scrub top": "Scrub Tops",
  "scrub tops": "Scrub Tops",
  "scrub shirt": "Scrub Tops",
  "scrub shirts": "Scrub Tops",
  "scrub pant": "Scrub Pants",
  "scrub pants": "Scrub Pants",
  "scrub trouser": "Scrub Pants",
  "scrub trousers": "Scrub Pants",
  "tunic": "Tunics",
  "tunics": "Tunics",
  "lab coat": "Lab Coats",
  "lab coats": "Lab Coats",
  "laboratory coat": "Lab Coats",
  "cardigan": "Cardigans",
  "cardigans": "Cardigans",
  "cardi": "Cardigans",
  // Longsleeves — both hyphenated and space-form variants needed.
  // `inferTypeFromTitle` strips hyphens during tokenisation, so a title
  // like "Womens Long Sleeve T-Shirt" becomes tokens [..., "t", "shirt"]
  // and only matches the space-form alias. Direct alias lookups (FB
  // classifier scanning `product.tags[]`, spreadsheet sync reading the
  // Type column verbatim) still match the hyphenated forms.
  "longsleeve": "Longsleeves",
  "longsleeves": "Longsleeves",
  "long sleeve": "Longsleeves",
  "long-sleeve": "Longsleeves",
  "long sleeve shirt": "Longsleeves",
  "long sleeve t-shirt": "Longsleeves",
  "long sleeve t-shirts": "Longsleeves",
  "long sleeve t shirt": "Longsleeves",
  "long sleeve t shirts": "Longsleeves",
  "long sleeve tee": "Longsleeves",
  "long sleeve tees": "Longsleeves",
  "longsleeve t-shirt": "Longsleeves",
  "longsleeve t-shirts": "Longsleeves",
  "longsleeve t shirt": "Longsleeves",
  "longsleeve t shirts": "Longsleeves",
  "longsleeve tee": "Longsleeves",
  "longsleeve tees": "Longsleeves",
  "ls shirt": "Longsleeves",
  "ls tee": "Longsleeves",
  // Singlets — distinct canonical type from Tanks. The shop tree has
  // mens-singlets, womens-singlets, kids-singlets as their own sub-handles
  // (see TYPE_TO_SUB_HANDLE in shop-categories.ts), so collapsing singlets
  // into "Singlets / Tanks" routes every singlet into mens-tanks instead
  // of mens-singlets — making the singlets sub permanently empty.
  "singlet": "Singlets",
  "singlets": "Singlets",
  // Tanks — distinct from singlets above. "Tank top" / "sleeveless" /
  // "racerback" all describe tank-style garments rather than singlets
  // (which in AU/NZ usage are the close-fit athletic vest cut), so they
  // land here.
  "tank": "Tanks",
  "tanks": "Tanks",
  "tank top": "Tanks",
  "sleeveless": "Tanks",
  "racerback": "Tanks",
  "racer back": "Tanks",
  // Shorts
  "shorts": "Shorts",
  "short": "Shorts",
  "board short": "Shorts",
  "board shorts": "Shorts",
  "boardshort": "Shorts",
  "boardshorts": "Shorts",
  // Pants
  "pants": "Pants",
  "pant": "Pants",
  "trouser": "Pants",
  "trousers": "Pants",
  "cargo pant": "Pants",
  "cargo pants": "Pants",
  "chino": "Pants",
  "chinos": "Pants",
  // Jackets
  "jacket": "Jackets",
  "jackets": "Jackets",
  "fleece": "Jackets",
  "softshell": "Jackets",
  "soft shell": "Jackets",
  "windbreaker": "Jackets",
  "rain jacket": "Jackets",
  "vest": "Jackets",
  "vests": "Jackets",
  // Headwear
  "cap": "Headwear",
  "caps": "Headwear",
  "hat": "Headwear",
  "hats": "Headwear",
  "beanie": "Headwear",
  "beanies": "Headwear",
  "headwear": "Headwear",
  "bucket hat": "Headwear",
  "trucker": "Headwear",
  "trucker cap": "Headwear",
  "snapback": "Headwear",
  "visor": "Headwear",
  // Bags
  "bag": "Bags",
  "bags": "Bags",
  "tote": "Bags",
  "tote bag": "Bags",
  "backpack": "Bags",
  "backpacks": "Bags",
  "drawstring bag": "Bags",
  "cooler bag": "Bags",
  // Accessories
  "accessory": "Accessories",
  "accessories": "Accessories",
  "lanyard": "Accessories",
  "lanyards": "Accessories",
  "belt": "Accessories",
  "belts": "Accessories",
  "umbrella": "Accessories",
  "towel": "Accessories",
  "tea towel": "Accessories",
  "tea towels": "Accessories",
  "flag": "Accessories",
  "flags": "Accessories",
  // Socks
  "socks": "Socks",
  "sock": "Socks",
  // Aprons
  "apron": "Aprons",
  "aprons": "Aprons",
  // Overalls
  "overalls": "Overalls",
  "overall": "Overalls",
  "coverall": "Overalls",
  "coveralls": "Overalls",
  // Trackpants
  "trackpants": "Trackpants",
  "track pants": "Trackpants",
  "tracksuit pants": "Trackpants",
  "jogger": "Trackpants",
  "joggers": "Trackpants",
  // Underwear / Kids
  "underwear": "Underwear",
  "kids": "Kids",
  "youth": "Kids",
  "children": "Kids",
}

// Canonical tag names. Lowercase keys → canonical Medusa ProductTag.value strings.
export const TAG_ALIASES: Record<string, string> = {
  // Gender
  "men": "Men",
  "mens": "Men",
  "men's": "Men",
  "male": "Men",
  "women": "Women",
  "womens": "Women",
  "women's": "Women",
  "ladies": "Women",
  "female": "Women",
  "unisex": "Unisex",
  "uni-sex": "Unisex",
  "kids | youth": "Kids",
  "kids": "Kids",
  "youth": "Kids",
  // Fit
  "regular": "Regular Fit",
  "regular fit": "Regular Fit",
  "slim": "Slim Fit",
  "slim fit": "Slim Fit",
  "slim-regular": "Slim Fit",
  "relaxed": "Relaxed Fit",
  "relaxed fit": "Relaxed Fit",
  "loose": "Relaxed Fit",
  "oversized": "Oversized",
  "modern fit": "Modern Fit",
  "classic fit": "Classic Fit",
  "class fit": "Classic Fit", // observed FashionBiz typo for "Classic Fit"
  "tailored fit": "Tailored Fit",
  "easy fit": "Easy Fit",
  "semi-fitted": "Semi-Fitted",
  "semi fitted": "Semi-Fitted",
  // Sleeve length
  "short sleeve": "Short Sleeve",
  "short-sleeve": "Short Sleeve",
  "shortsleeve": "Short Sleeve",
  "short": "Short Sleeve",
  "ss": "Short Sleeve",
  "long sleeve": "Long Sleeve",
  "long-sleeve": "Long Sleeve",
  "longsleeve": "Long Sleeve",
  "long": "Long Sleeve",
  "ls": "Long Sleeve",
  "sleeveless": "Sleeveless",
  "3/4 sleeve": "3/4 Sleeve",
  "3/4 sleeves": "3/4 Sleeve",
  // Cap profile (headwear)
  "high profile": "High Profile",
  "mid profile": "Mid Profile",
  "low profile": "Low Profile",
  // Industry
  "corporate": "Corporate",
  "business": "Corporate",
  "healthcare": "Healthcare",
  "medical": "Healthcare",
  "hospitality": "Hospitality",
  "construction": "Construction",
  "industrial": "Industrial",
  "industrial-workwear": "Industrial", // merge into the canonical Industrial tag
  "industrial workwear": "Industrial",
  // Safety
  "hi-vis": "Hi-Vis",
  "hi vis": "Hi-Vis",
  "high vis": "Hi-Vis",
  "high-vis": "Hi-Vis",
  "high visibility": "Hi-Vis",
  "hivis": "Hi-Vis",
  "hi vis taped": "Hi-Vis",
  // Tech / fabric properties
  "stretch": "Stretch",
  "4-way stretch": "Stretch",
  "moisture-wicking": "Moisture-Wicking",
  "moisture wicking": "Moisture-Wicking",
  "quick-dry": "Quick-Dry",
  "quick dry": "Quick-Dry",
  "uv protection": "UV Protection",
  "uv": "UV Protection",
  "upf": "UV Protection",
  "uv50+": "UV Protection",
  "upf50+": "UV Protection",
  "recycled": "Recycled",
  "recycled polyester": "Recycled",
  "sustainable": "Recycled",
  "outdoor": "Outdoor",
  "organic": "Organic",
  "anti-static": "Anti-Static",
  "antistatic": "Anti-Static",
  "waterproof": "Waterproof",
  "water resistant": "Waterproof",
  "water-resistant": "Waterproof",
  "reflective": "Reflective",
  "breathable": "Breathable",
  "antibacterial": "Antibacterial",
  // Fabric materials
  "cotton": "Cotton",
  "polyester": "Polyester",
  "elastane": "Elastane",
  "spandex": "Elastane",
  "bamboo": "Bamboo",
  "wool": "Wool",
  "merino": "Wool",
  "linen": "Linen",
  // Healthcare sub-industries (FashionBiz Biz Care)
  "pharmaceutical": "Pharmaceutical",
  "dentistry": "Dentistry",
  "healthwear": "Healthcare",
  "veterinary": "Veterinary",
  "pharmacy": "Pharmacy",
  "health aged care": "Healthcare",
  "aged care": "Aged Care",
  "allied health": "Allied Health",
  "nursing": "Nursing",
  "carers": "Carers",
  "clinical": "Clinical",
  // Use-case / vertical tags (FashionBiz)
  "retail uniforms": "Retail",
  "event promotional": "Promotional",
  "auto transport": "Automotive",
  "auto & transport": "Automotive",
  "government and council": "Government",
  "corporate office": "Corporate",
  "banking and finance": "Finance",
  "school education": "Education",
  "sports teams": "Sports",
  "mix and match": "Mix & Match",
  // Industry aliases — FashionBiz / Syzmik API stragglers that fell through
  // the 2026-05 backfill audit. Normalise to existing canonical industries.
  "health & aged care": "Healthcare",
  "hospitalities": "Hospitality", // plural typo in FB API
  "chef wear": "Hospitality",
  "alfresco": "Hospitality",
  "outerwears": "Outerwear", // plural typo in Syzmik API
  "made with cotton": "Cotton",
  // Brand range names — pass through cleaned (drop ™ etc.). These are
  // genuine fabric / safety / sustainability tech labels customers may
  // filter on. Aliased here so REBUILD_TAGS preserves them.
  "biz cool™": "Biz Cool",
  "biz cool": "Biz Cool",
  "biz eco™": "Biz Eco",
  "biz eco": "Biz Eco",
  "fire armour": "Fire Armour",
  "fire-armour": "Fire Armour", // hyphenated raw input from Syzmik API
  "fire armour™": "Fire Armour",
  "bio motion": "Bio Motion",
  // Fit variations (FashionBiz Biz Corporates)
  "executive fit": "Executive Fit",
  // Misc
  "clearance": "Clearance",
  "separates": "Separates",
  "outerwear": "Outerwear",
}

// Tag values that are placeholders / garbage data — silently dropped.
const GARBAGE_TAG_VALUES = new Set<string>([
  "to be filled in",
  "n/a",
  "na",
  "tbd",
  "tbc",
  "undefined",
  "null",
  "none",
  "-",
])

// Supplier-specific values we explicitly drop because they're either:
//   - internal range/collection groupings that don't help cross-supplier filtering
//     (e.g. FashionBiz "Collection Sports", overlaps with our "Sports" tag)
//   - product-line/model names that are meaningless without the supplier context
//     (e.g. "Camden" is a FashionBiz shirt style; not useful as a Medusa tag)
//   - garment-category labels for products outside our canonical type list
//     (e.g. "Biz Separates" — those products get product_type set manually)
const DROP_TAG_VALUES = new Set<string>([
  // FashionBiz Biz Collection internal range groupings
  "collection mix and match",
  "collection sports",
  "collection business",
  "collection hospitality",
  "collection education",
  "collection promotion",
  "collection retail",
  "collection automotive",
  "collection care",
  // FashionBiz model/style range names — typically already in the title
  "camden",
  "city",
  "memphis",
  "aston",
  "charlie",
  "focus",
  "hudson",
  "boulevard",
  // FashionBiz internal flags / usage classifications (not useful as tags)
  "best sellers",
  "best seller",
  "customer service",
  "corporate hospitality",
  "corporate education",
  "mix and match",
  // FashionBiz internal garment-category labels (not in our canonical type list)
  "biz separates",
  "separates",
  // Colour tags — colour is already a variant attribute, no need to
  // duplicate as a product tag. Add new colour-name patterns here as
  // they appear (FB API leaks colour names into the tag list, esp.
  // for Biz Care's pink range).
  "pink",
  "pink products",
  // ──────────────────────────────────────────────────────────────────
  // 2026-05-24 cleanup — values surfaced by DUMP_UNTYPED=1 backfill run.
  // Most are supplier marketing line names (Syzmik / BizCollection /
  // BizCare product ranges) or internal IDs that have no semantic value
  // to a SC Prints customer browsing the storefront. They were silently
  // title-cased and added as tags by the old fall-through behaviour,
  // polluting both the tag table and the /store ?tag=… filter dropdown.
  // ──────────────────────────────────────────────────────────────────
  // Syzmik marketing range labels
  "syzmik essentials",
  // Syzmik product line names
  "streetworx",
  "engineered-outerwear",
  "rugged cooling", // Syzmik cooling-fabric range — promote to TAG_ALIASES if we want a "Cooling" canonical later
  "antarctic",
  "meta",
  "sonar",
  "renegade",
  // NB: "fire-armour" lives in TAG_ALIASES above — it's a safety-compliance
  // signal, not noise. Don't drop it here.
  // BizCollection (Workwear / Sports) product line names
  "aero",
  "hype",
  "triton",
  "jet",
  "cambridge",
  "sprint",
  "razor",
  "elite",
  "talon",
  "charger",
  "cyber",
  "resort",
  "splice",
  "rival",
  "oceana",
  "shadow",
  "viva",
  "nitro",
  "united",
  "fusion",
  "blade",
  "edge",
  "balance",
  "byron",
  "action",
  "profile",
  // Biz Care medical line names
  "avery",
  "riley",
  "tokyo",
  "beauty",
  // Biz Collection internal pricing/sort flags (not customer-facing)
  "bizlist18101",
  "bizlist18103",
  // Marketing labels — descriptive but not semantic enough to filter on
  "basic",
  "all",
  "collections",
  "new colors",
  "ice",
  "casualwear",
  "teamwear",
  "fitness for all",
  "2017 power up",
  "careers",
  "early learning",
  // Generic absence indicators — every product without a hi-vis classification
  // would otherwise carry these. Tagging the absence of a feature is noise.
  "non hi vis",
  "hi vis non taped", // safety-coding variant; rolls up into "Hi-Vis" via the alias above
  "non taped",
  // Cultural / Biz Care medical sub-line names — drop unless we later want
  // dedicated facets for them. "Hijab" is a real garment but the catalog has
  // only ~1-2 SKUs and they're tagged as Healthcare already.
  "underscrubs",
  "t-tops",
  "hijab",
  "health", // ambiguous; "Healthcare" is the canonical, already aliased from "health aged care"
  // Fabric texture / descriptor terms — too granular to be useful as filter
  // tags. Real fabric composition (Cotton / Polyester / Bamboo) is captured
  // separately via the existing fabric aliases above.
  "cotton rich",
  "micro waffle",
  "viscose",
  "blends",
  // Misc style descriptors that are already captured elsewhere
  "fitted",
  "printed",
])

/**
 * Set of lowercase tag values that should be treated as garment-type indicators
 * (i.e. inputs to product_type derivation). When `normalizeTags` sees one of
 * these, it skips it — those values belong in product_type, not in tags.
 *
 * Built lazily from PRODUCT_TYPE_ALIASES keys so the two stay in sync.
 */
let GARMENT_TYPE_RAW_KEYS_CACHE: Set<string> | null = null
function getGarmentTypeRawKeys(): Set<string> {
  if (!GARMENT_TYPE_RAW_KEYS_CACHE) {
    GARMENT_TYPE_RAW_KEYS_CACHE = new Set(Object.keys(PRODUCT_TYPE_ALIASES))
  }
  return GARMENT_TYPE_RAW_KEYS_CACHE
}

function internalTitleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ")
}

/**
 * Demographic detection in product titles. Shared with `shop-categories.ts`
 * (audience inference) so a single regex source-of-truth backs both the
 * tag pipeline and the menu drill-down.
 */
// "wo's" is AS Colour's shorthand for "women's" — appears in titles like
// "Wo's Mali Racerback", "Wo's Heavy Hood". Match it so the demographic
// tag and audience routing fire.
export const TITLE_KW_WOMENS = /\b(women|womens|woman|women's|ladies|ladie's|lady|female|wo's)s?\b/i
export const TITLE_KW_MENS = /\b(mens|men's|gents|gentlemen)\b/i
export const TITLE_KW_KIDS = /\b(kid|kids|youth|child|children|infant|baby|babies|toddler|boys|boy|girls|girl)s?\b/i

/**
 * Walk a product title right-to-left and return the first match against
 * `PRODUCT_TYPE_ALIASES`. Right-to-left because garment-type words tend
 * to sit at the END of the title (e.g. "Parcel TOTE", "Womens Venture
 * Short Sleeve POLO", "Mens Classic Crew TEE"). Left-to-right would let
 * descriptive prefixes like "Crew" win over the real garment type at
 * the end.
 *
 * At each position, the longest multi-word match (up to 4 tokens) wins,
 * so "Long Sleeve Shirt" → "Longsleeves" not "Shirts". Returns null
 * when nothing matches; pushes a log line so the alias map can be
 * extended when a real product falls through.
 */
export function inferTypeFromTitle(
  title: string | null | undefined,
  unknownLog?: string[]
): string | null {
  if (!title?.trim()) return null
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s\-/]/g, " ")
    .split(/[\s\-/]+/)
    .filter(Boolean)
  if (!tokens.length) return null

  for (let end = tokens.length - 1; end >= 0; end--) {
    const maxLen = Math.min(4, end + 1)
    for (let len = maxLen; len >= 1; len--) {
      const start = end - len + 1
      const phrase = tokens.slice(start, end + 1).join(" ")
      const canonical = PRODUCT_TYPE_ALIASES[phrase]
      if (canonical) return canonical
    }
  }
  unknownLog?.push(
    `[title-fallback] No garment-type alias matched any phrase in title "${title}" — leaving product_type unset.`
  )
  return null
}

/**
 * Return a canonical demographic tag ("Men" / "Women" / "Kids") inferred
 * from a product title, or null if no demographic cue is present. Kids
 * cues win over womens/mens cues (a "Kids Womens Polo" doesn't exist in
 * practice; the rare clash is safer biased toward kids). Order matches
 * `shop-categories.ts:inferAudience`.
 */
export function inferDemographicTagFromTitle(
  title: string | null | undefined
): "Men" | "Women" | "Kids" | null {
  if (!title) return null
  if (TITLE_KW_KIDS.test(title)) return "Kids"
  if (TITLE_KW_WOMENS.test(title)) return "Women"
  if (TITLE_KW_MENS.test(title)) return "Men"
  return null
}

/**
 * Demographic tag values the storefront's audience browse filters on.
 * A product needs at least one of these or it disappears from every
 * audience drill-down (mens/womens/kids menus, mega-menu, etc.).
 */
const DEMOGRAPHIC_TAG_VALUES = new Set(["Men", "Women", "Kids", "Unisex"])

/**
 * Product types where no garment cut implies a demographic and the title
 * almost never carries a "Mens"/"Womens"/"Kids" cue (e.g. bags, aprons,
 * caps, towels). For these we default the demographic tag to "Unisex" so
 * the storefront audience filter still surfaces them.
 *
 * `inferAudiences()` in shop-categories.ts treats Unisex as "show in BOTH
 * mens and womens browse" — so a Unisex tote ends up under both
 * `/mens/bags` and `/womens/bags` automatically, on top of any workwear
 * routing the brand context provides.
 *
 * Conservative on purpose: only types whose entire catalog is genderless.
 * Apparel types (T-Shirts, Polos, Hoodies, …) stay strict — they need an
 * explicit Mens/Womens/Kids tag because the cut is gendered.
 */
const GENDERLESS_PRODUCT_TYPES = new Set([
  "Accessories",
  "Aprons",
  "Bags",
  "Headwear",
  "Socks",
])

/**
 * Brand handles whose catalog convention is "unisex unless explicitly
 * gendered". AS Colour designs the bulk of their apparel as unisex (the
 * Staple Tee, Heavy Tee, Premium Hood, Stock Crew, …) and only ship a
 * gender field on their handful of Womens-only / Mens-only items. The
 * absence of a gender in their API is intentional — not a data gap — so
 * we default these products to Unisex once title inference has had its
 * chance to find a more specific cue.
 *
 * FashionBiz (Biz Collection / Biz Care / Biz Corporates / Syzmik) and
 * Aussie Pacific are excluded on purpose: their products carry explicit
 * gender via `gender` / `main_category`, so a missing demographic there
 * is a data issue worth surfacing, not a unisex default.
 */
const UNISEX_BY_DEFAULT_BRAND_HANDLES = new Set(["as-colour", "ascolour"])

/**
 * Convenience wrapper for per-supplier importers. Takes the result of
 * a supplier classifier and a product title, and fills the gaps:
 *
 *  - If `productType` is null, attempt `inferTypeFromTitle`.
 *  - If a demographic tag (Men/Women/Kids) isn't already in `tags`,
 *    attempt `inferDemographicTagFromTitle` and append it.
 *  - If still no demographic tag AND the resolved product_type is in
 *    `GENDERLESS_PRODUCT_TYPES`, append "Unisex" — covers accessory
 *    catalogs whose titles never carry a Mens/Womens/Kids cue.
 *  - If still no demographic AND `brandHandle` is one whose catalog is
 *    unisex by default (AS Colour), append "Unisex". Applies only when
 *    every earlier signal has been exhausted, so an explicit Mens /
 *    Womens / Kids cue in either the classifier output or the title
 *    always wins.
 *
 * Returns a new object (does not mutate input). Use this in every
 * supplier importer after the classifier so empty type/tag fields from
 * sparse API data don't ship to production.
 */
export function applyTitleFallbacks(
  result: { productType: string | null; tags: string[] },
  title: string | null | undefined,
  unknownLog?: string[],
  brandHandle?: string | null
): { productType: string | null; tags: string[] } {
  const out = {
    productType: result.productType,
    tags: [...result.tags],
  }
  if (!out.productType) {
    out.productType = inferTypeFromTitle(title, unknownLog)
  }
  const demographic = inferDemographicTagFromTitle(title)
  if (demographic && !out.tags.includes(demographic)) {
    out.tags.push(demographic)
  }
  // Genderless-type fallback: bags/aprons/headwear/socks/accessories.
  if (
    !out.tags.some((t) => DEMOGRAPHIC_TAG_VALUES.has(t)) &&
    out.productType &&
    GENDERLESS_PRODUCT_TYPES.has(out.productType)
  ) {
    out.tags.push("Unisex")
  }
  // Brand-convention fallback: AS Colour's apparel is unisex unless
  // explicitly gendered. Other suppliers tag explicitly so absence
  // means data gap, not unisex default.
  if (
    !out.tags.some((t) => DEMOGRAPHIC_TAG_VALUES.has(t)) &&
    out.productType &&
    brandHandle &&
    UNISEX_BY_DEFAULT_BRAND_HANDLES.has(brandHandle)
  ) {
    out.tags.push("Unisex")
  }
  return out
}

/**
 * Map a raw supplier string to a canonical product type name.
 * Falls back to title-cased trimmed value for unknowns, and pushes a log
 * message to unknownLog so the alias map can be extended.
 * Returns null for empty/null input.
 */
export function normalizeProductType(
  raw: string | null | undefined,
  unknownLog?: string[]
): string | null {
  if (!raw?.trim()) return null
  const trimmed = raw.trim()
  const key = trimmed.toLowerCase()
  const canonical = PRODUCT_TYPE_ALIASES[key]
  if (canonical) return canonical
  const fallback = internalTitleCase(trimmed)
  unknownLog?.push(
    `[product_type] Unknown raw value "${trimmed}" → fell back to "${fallback}"`
  )
  return fallback
}

/**
 * Map an array of raw supplier strings to deduplicated canonical tag names.
 *
 * Silently dropped:
 *   - null/empty values
 *   - garbage placeholders (e.g. "TO BE FILLED IN", "N/A")
 *   - explicit drop list (supplier-internal range names, model names, etc.
 *     — see DROP_TAG_VALUES)
 *   - exact garment-type indicators (anything in PRODUCT_TYPE_ALIASES) —
 *     these belong in product_type, not as tags
 *   - compound tags whose tokens contain a garment-type indicator
 *     (e.g. "shirts and polos", "syzmik-shirts", "clearance tees") —
 *     these are garment-type aliases, not useful as attribute tags
 *
 * Unknown values fall back to title-case and are logged so the alias map
 * can be extended.
 */
export function normalizeTags(
  raws: (string | null | undefined)[],
  unknownLog?: string[]
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const garmentTypeKeys = getGarmentTypeRawKeys()
  for (const raw of raws) {
    if (!raw?.trim()) continue
    const trimmed = raw.trim()
    const key = trimmed.toLowerCase()
    if (GARBAGE_TAG_VALUES.has(key)) continue
    if (DROP_TAG_VALUES.has(key)) continue
    if (garmentTypeKeys.has(key)) continue
    // Token-based filter: drop multi-word tags whose LAST token is a
    // garment-type indicator (compounds where the head noun is the
    // garment type, e.g. "Clearance Tees" / "Syzmik Shirts" / "Shirts
    // and Polos"). Only the trailing token matters — modifier tokens at
    // the front are fine ("Short Sleeve" has "short" → Shorts as a
    // FRONT modifier, but the tag is sleeve length, not a shorts
    // compound, so it must pass).
    const tokens = key.split(/[\s\-_]+/).filter(Boolean)
    if (
      tokens.length > 1 &&
      garmentTypeKeys.has(tokens[tokens.length - 1])
    ) {
      continue
    }
    let canonical = TAG_ALIASES[key]
    if (!canonical) {
      canonical = internalTitleCase(trimmed)
      unknownLog?.push(
        `[tag] Unknown raw value "${trimmed}" → fell back to "${canonical}"`
      )
    }
    if (!seen.has(canonical)) {
      seen.add(canonical)
      out.push(canonical)
    }
  }
  return out
}

/**
 * Derive Medusa product_type and tags from an AS Colour product.
 *   product_type ← product.productType (real API field) or product.category (legacy)
 *   tags         ← product.gender + product.fit
 */
export function classifyAsColourProduct(
  product: AsColourProduct,
  unknownLog?: string[]
): { productType: string | null; tags: string[] } {
  // The real AS Colour API returns the garment category in a `productType`
  // field (per the comments in import-as-colour-from-api.ts). Older snapshots
  // may use `category` — try both.
  const rawType = (product as any).productType ?? product.category
  const productType = normalizeProductType(rawType, unknownLog)
  const rawTags = [
    (product as any).gender as string | undefined,
    (product as any).fit as string | undefined,
  ]
  const tags = normalizeTags(rawTags, unknownLog)
  return { productType, tags }
}

/**
 * Derive Medusa product_type and tags from a FashionBiz product.
 *
 * product_type: scan product.tags[] for the first entry that resolves to a
 *   garment-type alias. For each tag, try exact match first, then split on
 *   whitespace/hyphens/underscores and check each token (so "syzmik-shirts"
 *   resolves via "shirts", "clearance tees" via "tees"). If no tag resolves,
 *   product_type is left null — better to leave it unset than guess wrong.
 *
 * tags: all of product.tags + gender + fit + sleeve + industry + tech,
 *   normalised through TAG_ALIASES and deduplicated. Garment-type indicators
 *   are excluded automatically (they're the product_type, not a tag).
 */
export function classifyFashionBizProduct(
  product: Pick<
    FashionBizProduct,
    "slug" | "tags" | "gender" | "fit" | "sleeve" | "industry" | "tech"
  >,
  unknownLog?: string[]
): { productType: string | null; tags: string[] } {
  const rawTags = product.tags ?? []

  let productType: string | null = null
  outer: for (const t of rawTags) {
    if (!t?.trim()) continue
    const key = t.trim().toLowerCase()
    if (key in PRODUCT_TYPE_ALIASES) {
      productType = PRODUCT_TYPE_ALIASES[key]
      break
    }
    // Token-based fallback: handles "syzmik-shirts", "clearance tees",
    // "shirts and polos", "work-shirts-and-polos", etc.
    for (const token of key.split(/[\s\-_]+/)) {
      if (token && token in PRODUCT_TYPE_ALIASES) {
        productType = PRODUCT_TYPE_ALIASES[token]
        break outer
      }
    }
  }

  if (!productType && rawTags.length > 0) {
    unknownLog?.push(
      `[fashionbiz product_type] No garment-type tag found in tags=[${rawTags.join(", ")}] for slug="${product.slug ?? "unknown"}" — leaving product_type unset.`
    )
  }

  // FashionBiz's `tags[]` array is sometimes stale or wrong about
  // sleeve length — e.g. Syzmik ZH390 has sleeve="Long" but tags
  // include "short sleeve". The structured `sleeve` field is FB's
  // source of truth, so we filter sleeve-length descriptors out of
  // rawTags before normalising and let `product.sleeve` alone provide
  // that signal.
  const sleeveDescriptor = /^(short|long|3\/4)\s+sleeve(s)?$/i
  const filteredRawTags = rawTags.filter((t) => !sleeveDescriptor.test(t ?? ""))

  const allRawTags: (string | null | undefined)[] = [
    ...filteredRawTags,
    product.gender,
    product.fit,
    product.sleeve,
    product.industry,
    product.tech,
  ]
  const tags = normalizeTags(allRawTags, unknownLog)

  return { productType, tags }
}

/**
 * Derive Medusa product_type and tags from an Aussie Pacific product.
 *
 * AP exposes `main_category`, `sub_category`, and `style` (a range/
 * collection name like "Bayview", "Botany"). Observed:
 *
 *   main_category   sub_category    style
 *   "Ladies"        "Shirts"        "Bayview"
 *   "Mens"          "Polos"         "Botany"
 *
 * `main_category` is usually a demographic (Ladies/Mens/Kids), not a
 * garment shape, so we look up `sub_category` first for the product
 * type. We use STRICT alias matching (no title-case fallback) so that
 * demographic strings like "Ladies" never leak through as a Type — they
 * flow into the tag pipeline instead, where `ladies → Women` etc. are
 * already mapped (see TAG_ALIASES).
 *
 * `style` is the AP range/collection name and is already present in the
 * product title (e.g. "BAYVIEW LADY SHIRT 3/4 SLEEVE - 2906T"), so it
 * adds no customer-facing value as a tag and is dropped.
 */
export function classifyAussiePacificProduct(
  product: Pick<
    AussiePacificProduct,
    "main_category" | "sub_category" | "style" | "style_code"
  >,
  unknownLog?: string[]
): { productType: string | null; tags: string[] } {
  // Demographic tokens that should NEVER become a productType, even though
  // some of them ("kids") are also in PRODUCT_TYPE_ALIASES.
  const DEMOGRAPHIC_KEYS = new Set([
    "ladies",
    "lady",
    "women",
    "womens",
    "woman",
    "mens",
    "men",
    "kids",
    "kid",
    "youth",
    "youths",
    "children",
    "child",
    "boys",
    "boy",
    "girls",
    "girl",
    "unisex",
  ])

  // Lookup a productType from a raw string. First try exact alias; if that
  // fails, split into tokens and return the first GARMENT (non-demographic)
  // token that resolves. This handles AP's compound sub_categories like
  // "Kids Polos" → "Polos", "Mens T-Shirts" → "T-Shirts", "Womens Tees" →
  // "T-Shirts".
  const lookupType = (raw: string | null | undefined): string | null => {
    if (!raw?.trim()) return null
    const key = raw.trim().toLowerCase()
    const exact = PRODUCT_TYPE_ALIASES[key]
    if (exact && !DEMOGRAPHIC_KEYS.has(key)) return exact
    for (const token of key.split(/[\s\-_/]+/).filter(Boolean)) {
      if (DEMOGRAPHIC_KEYS.has(token)) continue
      const t = PRODUCT_TYPE_ALIASES[token]
      if (t) return t
    }
    return null
  }
  // sub_category first (more specific), main_category second.
  const productType =
    lookupType(product.sub_category) ?? lookupType(product.main_category)

  if (!productType && (product.main_category || product.sub_category)) {
    unknownLog?.push(
      `[aussie-pacific product_type] Could not resolve type from sub="${product.sub_category ?? ""}" main="${product.main_category ?? ""}" for style_code="${product.style_code ?? "unknown"}" — leaving product_type unset.`
    )
  }

  // Tags: AP's main_category is a demographic (Ladies/Mens/Kids/Unisex),
  // not a garment shape. Map it directly to a canonical demographic tag.
  // We bypass normalizeTags for this because "kids" is also in
  // PRODUCT_TYPE_ALIASES (it's both a demographic AND a garment-type
  // indicator), which would otherwise cause normalizeTags to filter it.
  //
  // `style` (Bayview, Botany, …) is intentionally NOT a tag — it's
  // already in the product title and means nothing to customers.
  // `sub_category` is also not surfaced as a tag — when it doesn't
  // resolve to the productType it's usually a garment-type variant
  // ("Long Sleeve Shirts") that adds noise; the title already conveys
  // shape.
  const DEMOGRAPHIC_TO_TAG: Record<string, string> = {
    ladies: "Women",
    lady: "Women",
    women: "Women",
    womens: "Women",
    woman: "Women",
    mens: "Men",
    men: "Men",
    kids: "Kids",
    kid: "Kids",
    youth: "Kids",
    youths: "Kids",
    children: "Kids",
    child: "Kids",
    boys: "Kids",
    boy: "Kids",
    girls: "Kids",
    girl: "Kids",
    unisex: "Unisex",
  }
  const tags: string[] = []
  const seenTags = new Set<string>()
  // Look for demographic tokens in BOTH main_category and sub_category.
  // Examples: main="Kids", sub="Kids Polos" → tag "Kids"; main="Polos",
  // sub="Mens Polos" → tag "Men".
  for (const raw of [product.main_category, product.sub_category]) {
    const key = (raw ?? "").trim().toLowerCase()
    if (!key) continue
    // Exact match first.
    const exactTag = DEMOGRAPHIC_TO_TAG[key]
    if (exactTag && !seenTags.has(exactTag)) {
      seenTags.add(exactTag)
      tags.push(exactTag)
      continue
    }
    // Token split for compounds ("Kids Polos", "Mens-Polos").
    for (const token of key.split(/[\s\-_/]+/).filter(Boolean)) {
      const t = DEMOGRAPHIC_TO_TAG[token]
      if (t && !seenTags.has(t)) {
        seenTags.add(t)
        tags.push(t)
      }
    }
  }

  return { productType, tags }
}
