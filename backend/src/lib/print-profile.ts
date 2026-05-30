/**
 * Print profiles — the single source of truth for "what can be printed where,
 * with what technique, at what size" for a garment.
 *
 * Replaces the invisible, title/tag-regex inference that used to live only in
 * the storefront customizer (`storefront/src/modules/products/lib/variant-options.ts`
 * + the `allowedPrintSides` memo in the customizer template). Staff now assign
 * every product an explicit, editable profile via admin; the customizer reads
 * the resolved profile instead of guessing.
 *
 * A product references a profile by HANDLE (`product.metadata.print_profile`),
 * so editing a profile propagates to every product on it. Full-custom products
 * instead carry an inline `product.metadata.print_config` (a PrintProfileArea[])
 * which wins over the profile reference.
 *
 * Vocabulary is kept in lockstep with the storefront:
 *   - sizes  → ScpPrintSizeId  (storefront/src/modules/customizer/lib/scp-dtf-print-pricing.ts)
 *   - methods→ DecorationMethod (storefront/src/modules/customizer/lib/types.ts)
 *   - sides  → GarmentSide      (storefront/src/modules/customizer/lib/types.ts)
 */

export const PRINT_METHODS = ["print", "embroidery"] as const
export type PrintMethod = (typeof PRINT_METHODS)[number]

export const PRINT_SIZES = [
  "up_to_a6",
  "up_to_a4",
  "up_to_a3",
  "oversize",
] as const
export type PrintSizeId = (typeof PRINT_SIZES)[number]

/**
 * Canonical apparel side keys the customizer canvas knows how to render.
 * Phase 1 profiles use only these. Custom-named areas (Phase 2) will extend
 * beyond this set, which is why `PrintProfileArea.key` is a free string.
 */
export const APPAREL_SIDE_KEYS = [
  "front",
  "back",
  "left_sleeve",
  "right_sleeve",
  "printed_tag",
] as const
export type ApparelSideKey = (typeof APPAREL_SIDE_KEYS)[number]

export const SIDE_LABELS: Record<string, string> = {
  front: "Front",
  back: "Back",
  left_sleeve: "Left Sleeve",
  right_sleeve: "Right Sleeve",
  printed_tag: "Neck Tag",
}

/** One printable location within a profile. */
export type PrintProfileArea = {
  /** Side key (front/back/left_sleeve/right_sleeve/printed_tag) or custom slug. */
  key: string
  /** Display label shown on the side tab / admin. */
  label: string
  /** Allowed decoration methods for this area. */
  methods: PrintMethod[]
  /** Allowed print sizes for this area. */
  sizes: PrintSizeId[]
  /** Max number of distinct prints/transfers on this area. Defaults to 4 in UI. */
  max_prints?: number
}

export type PrintProfileShape = {
  name: string
  handle: string
  description?: string
  is_system?: boolean
  position?: number
  areas: PrintProfileArea[]
}

/** Handle used on `metadata.print_profile` when a product carries its own inline config. */
export const CUSTOM_PROFILE_HANDLE = "custom"

// ---------------------------------------------------------------------------
// System profiles — seeded on first run, re-parentable/editable by staff.
// These reproduce the previous hard-coded heuristics as explicit data.
// ---------------------------------------------------------------------------

const ALL_SIZES: PrintSizeId[] = ["up_to_a6", "up_to_a4", "up_to_a3", "oversize"]
const A6_ONLY: PrintSizeId[] = ["up_to_a6"]
const SLEEVE_LONG: PrintSizeId[] = ["up_to_a6", "up_to_a4", "up_to_a3"]
const BOTH: PrintMethod[] = ["print", "embroidery"]
const EMB_ONLY: PrintMethod[] = ["embroidery"]
const PRINT_ONLY: PrintMethod[] = ["print"]

const area = (
  key: ApparelSideKey,
  methods: PrintMethod[],
  sizes: PrintSizeId[],
  max_prints?: number
): PrintProfileArea => ({
  key,
  label: SIDE_LABELS[key] ?? key,
  methods,
  sizes,
  ...(typeof max_prints === "number" ? { max_prints } : {}),
})

export const SYSTEM_PROFILES: PrintProfileShape[] = [
  {
    name: "Short Sleeve Garment",
    handle: "short-sleeve-garment",
    description: "Tees, polos and other short-sleeve tops. Sleeves are A6 only.",
    is_system: true,
    position: 0,
    areas: [
      area("front", BOTH, ALL_SIZES),
      area("back", BOTH, ALL_SIZES),
      area("left_sleeve", BOTH, A6_ONLY),
      area("right_sleeve", BOTH, A6_ONLY),
      area("printed_tag", PRINT_ONLY, A6_ONLY),
    ],
  },
  {
    name: "Long Sleeve Garment",
    handle: "long-sleeve-garment",
    description:
      "Long-sleeve tees, hoodies, crewnecks and jumpers. Sleeves print up to A3.",
    is_system: true,
    position: 1,
    areas: [
      area("front", BOTH, ALL_SIZES),
      area("back", BOTH, ALL_SIZES),
      area("left_sleeve", BOTH, SLEEVE_LONG),
      area("right_sleeve", BOTH, SLEEVE_LONG),
      area("printed_tag", PRINT_ONLY, A6_ONLY),
    ],
  },
  {
    name: "Sleeveless",
    handle: "sleeveless",
    description: "Tanks, singlets, vests and camisoles. No sleeve locations.",
    is_system: true,
    position: 2,
    areas: [
      area("front", BOTH, ALL_SIZES),
      area("back", BOTH, ALL_SIZES),
      area("printed_tag", PRINT_ONLY, A6_ONLY),
    ],
  },
  {
    name: "Cap / Headwear",
    handle: "cap-headwear",
    description:
      "Caps, snapbacks, truckers, buckets. Front (crown) only, A6 — the realistic limit on a curved crown.",
    is_system: true,
    position: 3,
    areas: [area("front", BOTH, A6_ONLY, 1)],
  },
  {
    name: "Beanie",
    handle: "beanie",
    description: "Knit pull-on beanies. Embroidery only, front cuff, A6.",
    is_system: true,
    position: 4,
    areas: [area("front", EMB_ONLY, A6_ONLY, 1)],
  },
  {
    name: "Bag / Tote",
    handle: "bag-tote",
    description: "Totes, bags and other front + back only items.",
    is_system: true,
    position: 5,
    areas: [area("front", BOTH, ALL_SIZES), area("back", BOTH, ALL_SIZES)],
  },
  {
    name: "Puffer / Insulated Jacket",
    handle: "puffer-jacket",
    description:
      "Puffer / quilted / insulated jackets. Embroidery only — heat-applied transfers damage the fill.",
    is_system: true,
    position: 6,
    areas: [
      area("front", EMB_ONLY, ALL_SIZES),
      area("back", EMB_ONLY, ALL_SIZES),
      area("left_sleeve", EMB_ONLY, SLEEVE_LONG),
      area("right_sleeve", EMB_ONLY, SLEEVE_LONG),
      area("printed_tag", EMB_ONLY, A6_ONLY),
    ],
  },
  {
    name: "Socks",
    handle: "socks",
    description: "Socks — print only, front + back. Small print area (A6).",
    is_system: true,
    position: 7,
    areas: [
      area("front", PRINT_ONLY, A6_ONLY),
      area("back", PRINT_ONLY, A6_ONLY),
    ],
  },
]

/** Default profile handle for an unclassifiable apparel product. */
export const DEFAULT_PROFILE_HANDLE = "short-sleeve-garment"

// ---------------------------------------------------------------------------
// Backfill classifier — mirrors the storefront variant-options precedence so
// existing products land on the right profile. NOTE: the front+back regex uses
// `shorts?(?!\s*sleeve)` so the canonical "Short Sleeve" tag is NOT mistaken
// for the garment "shorts" (the exact bug that capped short-sleeve tees at
// front+back under the old inference).
// ---------------------------------------------------------------------------

type ClassifiableProduct = {
  title?: string | null
  handle?: string | null
  subtitle?: string | null
  description?: string | null
  metadata?: Record<string, unknown> | null
  tags?: Array<{ value?: string | null }> | null
}

const PUFFER_PATTERN =
  /\b(puffer|quilted|down[\s-]?(?:jacket|filled|fill|vest)|(?:padded|insulated)[\s-]?(?:jacket|vest|gilet|bodywarmer|coat|parka))\b/
const SOCKS_PATTERN = /\bsocks?\b/
const SLEEVELESS_PATTERN = /\b(?:vest|singlet|tank|camisole)s?\b/
const FRONT_BACK_TAG_PATTERN =
  /\b(pants?|shorts?(?!\s*sleeve)|trousers?|jeans?|leggings?|skirts?|tote|totes|bags?|backpacks?|pouch|pouches|apron|aprons|towel|towels)\b/
const FRONT_BACK_TITLE_PATTERN =
  /\b(tote|bag|backpack|pouch|apron|towel)\b/

function isLongSleeve(titleBlob: string, metaString: (k: string) => string): boolean {
  for (const key of [
    "sleeve_length",
    "sleeve_type",
    "sleeves",
    "apparel_sleeve",
    "garment_sleeve",
  ]) {
    const s = metaString(key)
    if (s) {
      if (/\blong\b/.test(s)) return true
      if (/\bshort\b/.test(s)) return false
    }
  }
  if (/\b(short[\s-]*sleeve|shortsleeve|s\/s)\b/.test(titleBlob)) return false
  if (/\b(long[\s-]*sleeve|longsleeve|l\/s)\b/.test(titleBlob)) return true
  if (
    /\b(hoodie|hood\b|sweatshirt|sweat\s*shirt|fleece|pullover|jumper|sweater|rugby|jerseys?|crewneck|crew\s*neck|cardigan|cardigans)\b/.test(
      titleBlob
    )
  ) {
    return true
  }
  return false
}

/**
 * Best-guess profile handle for a product, mirroring the storefront's previous
 * inference precedence. Used by the one-shot backfill; runtime never calls this.
 */
export function inferPrintProfileHandle(product: ClassifiableProduct): string {
  const meta = (product.metadata ?? {}) as Record<string, unknown>
  const metaString = (key: string): string => {
    const v = meta[key]
    return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : ""
  }
  const tags = (product.tags ?? [])
    .map((t) => (t?.value ?? "").toLowerCase().trim())
    .filter(Boolean)
  const titleBlob = [
    product.title,
    product.handle,
    product.subtitle,
    product.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  const headwearMeta = [
    "garment_type",
    "style",
    "product_type",
    "category",
    "apparel_category",
    "headwear_type",
  ]
    .map(metaString)
    .filter(Boolean)
    .join(" ")
  const generalMeta = [
    "garment_type",
    "style",
    "product_type",
    "category",
    "apparel_category",
  ]
    .map(metaString)
    .filter(Boolean)
    .join(" ")

  // 1. Beanie (embroidery-only knit cap) — checked before generic hat.
  if (/\bbeanie(s)?\b/.test(headwearMeta) || /\bbeanie(s)?\b/.test(titleBlob)) {
    return "beanie"
  }
  // 2. Brimmed headwear.
  if (
    /\b(hat|cap|caps|headwear)\b/.test(headwearMeta) ||
    /\b(cap|caps|snapback(s)?|trucker(s)?|bucket\s*hat|visor(s)?|brim(med)?|hat(s)?)\b/.test(
      titleBlob
    )
  ) {
    return "cap-headwear"
  }
  // 3. Puffer / insulated jacket (embroidery only).
  if (PUFFER_PATTERN.test(generalMeta) || PUFFER_PATTERN.test(titleBlob)) {
    return "puffer-jacket"
  }
  // 3b. Socks (print only, front + back) — distinctive, checked before the
  // sleeveless / front+back fallbacks so a "sock" never mis-buckets.
  if (
    tags.some((t) => SOCKS_PATTERN.test(t)) ||
    SOCKS_PATTERN.test(generalMeta) ||
    SOCKS_PATTERN.test(titleBlob)
  ) {
    return "socks"
  }
  // 4. Sleeveless.
  if (SLEEVELESS_PATTERN.test(generalMeta) || SLEEVELESS_PATTERN.test(titleBlob)) {
    return "sleeveless"
  }
  // 5. Front + back only (bags, totes, bottoms, accessories).
  if (
    tags.some((t) => FRONT_BACK_TAG_PATTERN.test(t)) ||
    FRONT_BACK_TITLE_PATTERN.test(titleBlob)
  ) {
    return "bag-tote"
  }
  // 6. Long-sleeve tops.
  if (isLongSleeve(titleBlob, metaString)) {
    return "long-sleeve-garment"
  }
  // 7. Default — short-sleeve garment.
  return DEFAULT_PROFILE_HANDLE
}

/**
 * Parse a product-level technique restriction (`metadata.print_methods`).
 * Returns the allowed-method subset, or `null` when absent / invalid / permits
 * EVERY method (both ticked == "no restriction, defer to the profile").
 */
export function sanitizeMethodFilter(input: unknown): PrintMethod[] | null {
  if (!Array.isArray(input)) return null
  const uniq = Array.from(
    new Set(
      input.filter((m): m is PrintMethod =>
        (PRINT_METHODS as readonly string[]).includes(m as string)
      )
    )
  )
  if (!uniq.length) return null
  if (PRINT_METHODS.every((m) => uniq.includes(m))) return null
  return uniq
}

/**
 * Layer a product-level technique restriction on top of a profile's areas:
 * intersect each area's methods with `allow`, dropping any area left with no
 * method (e.g. a print-only neck tag under an embroidery-only garment). A null
 * filter is a no-op. Used by the admin resolved preview AND the storefront
 * resolver so a garment can be flagged print-only / embroidery-only without
 * forking it to a full-custom config.
 */
export function applyMethodFilter(
  areas: PrintProfileArea[],
  allow: PrintMethod[] | null | undefined
): PrintProfileArea[] {
  if (!allow || !allow.length) return areas
  const set = new Set<string>(allow)
  if (PRINT_METHODS.every((m) => set.has(m))) return areas
  const out: PrintProfileArea[] = []
  for (const a of areas) {
    const methods = a.methods.filter((m) => set.has(m))
    if (methods.length) out.push({ ...a, methods })
  }
  return out
}

/** Coerce/clean an arbitrary areas payload into valid PrintProfileArea[]. */
export function sanitizeAreas(input: unknown): PrintProfileArea[] {
  if (!Array.isArray(input)) return []
  const out: PrintProfileArea[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const key = typeof r.key === "string" ? r.key.trim() : ""
    if (!key || seen.has(key)) continue
    const methods = Array.isArray(r.methods)
      ? (r.methods.filter((m) => (PRINT_METHODS as readonly string[]).includes(m as string)) as PrintMethod[])
      : []
    const sizes = Array.isArray(r.sizes)
      ? (r.sizes.filter((s) => (PRINT_SIZES as readonly string[]).includes(s as string)) as PrintSizeId[])
      : []
    if (!methods.length || !sizes.length) continue
    const label =
      typeof r.label === "string" && r.label.trim()
        ? r.label.trim()
        : SIDE_LABELS[key] ?? key
    const max_prints =
      typeof r.max_prints === "number" && r.max_prints > 0
        ? Math.floor(r.max_prints)
        : undefined
    seen.add(key)
    out.push({ key, label, methods, sizes, ...(max_prints ? { max_prints } : {}) })
  }
  return out
}
