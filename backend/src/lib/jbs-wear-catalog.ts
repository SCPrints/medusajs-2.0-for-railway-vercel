/**
 * Pure parsing for the JB's Wear "SKU - WEBCC Trade" spreadsheet — one row per
 * SKU (style × colour × size), each row carrying its own trade cost, carton
 * weight and a public per-colour front image on jbswear.com.au.
 *
 * Kept free of Medusa so it can be unit-tested; the import script
 * (src/scripts/import-jbs-wear-from-xlsx.ts) does the DB work.
 */

export type JbsRow = Record<string, unknown>

export type JbsVariant = {
  sku: string
  barcode: string | null
  colour: string
  colourCode: string
  size: string
  cost: number
  weightGrams: number | null
  /** Public front shot on jbswear.com.au — fallback when R2 has none. */
  imageUrl: string | null
  /** Filenames in JB's Hightail pack: `_01` front, alt (usually `_03`) back. */
  hightailFront: string | null
  hightailBack: string | null
}

export type JbsStyle = {
  code: string
  brand: string
  title: string
  handle: string
  category: string
  subCategory: string
  blurb: string | null
  details: string | null
  websiteUrl: string | null
  isNew: boolean
  variants: JbsVariant[]
}

// Supplier brand string → our Brand handle. JB's is the parent; the others
// are its house labels (re-parented under it for supplier-mix reporting).
export const JBS_BRANDS: Record<string, { name: string; handle: string; code: string }> = {
  "jb's wear": { name: "JB's Wear", handle: "jbs-wear", code: "JBS" },
  podium: { name: "Podium", handle: "podium", code: "PDM" },
  "colours of cotton": { name: "Colours of Cotton", handle: "colours-of-cotton", code: "COC" },
  "johnny bobbin": { name: "Johnny Bobbin", handle: "johnny-bobbin", code: "BOBBIN" },
}

// JB's catalogue shorthand worth expanding in a customer-facing title.
const EXPAND: Record<string, string> = {
  PDM: "Podium",
  LDS: "Ladies",
  JCKT: "Jacket",
  PKT: "Pocket",
}
// Acronyms that must stay upper-case after title-casing.
const KEEP_UPPER = new Set(["HV", "PU", "FR", "VIC", "UPF", "PPE", "NSW", "QLD", "AUST"])

/** "JB's KIDS S/S 150G HV POLO" → "JB's Kids S/S 150g HV Polo". */
export function prettifyJbsTitle(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => {
      if (EXPAND[w]) return EXPAND[w]
      if (KEEP_UPPER.has(w.replace(/[.()]/g, ""))) return w
      if (/^\d+G$/.test(w)) return w.toLowerCase() // 150G → 150g
      // Title-case caps runs inside a token too: (SOFTSHELL), CHEF'S, L/LINE.
      // 1-2 letter runs stay (JB's, S/S, D+N, NU, PK).
      return w.replace(/[A-Z]{3,}(?:'[A-Z]+)?/g, (m) =>
        KEEP_UPPER.has(m) ? m : m[0] + m.slice(1).toLowerCase()
      )
    })
    .join(" ")
}

const BRAND_PREFIX = /^(JB's|Podium|C of C)\s+/i

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['/.]/g, "") // JB's → jbs, S/S → ss, A.T. → at
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** `jbs-wear-kids-ss-150g-hv-polo-1kp` — descriptive + style code for uniqueness. */
export function buildJbsHandle(brandHandle: string, title: string, code: string): string {
  return `${brandHandle}-${slugify(title.replace(BRAND_PREFIX, ""))}-${slugify(code)}`
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim())
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number.parseFloat(str(v))
  return Number.isFinite(n) ? n : NaN
}

/** Normalise the multi-line spreadsheet headers ("Style\nCode ") to "Style Code". */
export function normaliseHeader(h: unknown): string {
  return str(h).replace(/\s+/g, " ")
}

/**
 * Group SKU rows into styles. Rows without a style code or a positive cost
 * are dropped (counted in `skipped`).
 */
export function groupJbsRows(rows: JbsRow[]): { styles: JbsStyle[]; skipped: number } {
  const byCode = new Map<string, JbsRow[]>()
  let skipped = 0
  for (const r of rows) {
    const code = str(r["Style Code"])
    if (!code || !(num(r["WEBCC Trade"]) > 0) || !str(r["SKU"])) {
      skipped++
      continue
    }
    const list = byCode.get(code) ?? []
    list.push(r)
    byCode.set(code, list)
  }

  const styles: JbsStyle[] = []
  for (const [code, list] of byCode) {
    const first = list[0]
    const brandKey = str(first["Brand"]).toLowerCase()
    const brand = JBS_BRANDS[brandKey]?.handle ?? slugify(str(first["Brand"]))

    // Some styles mix a KIDS name onto their kids sizes ("C of C KIDS L/S TEE"
    // vs "C of C L/S TEE") — the shortest name is the adult/base one.
    const rawName = [...new Set(list.map((r) => str(r["Product Name"])))].sort(
      (a, b) => a.length - b.length
    )[0]
    const title = prettifyJbsTitle(rawName)

    // A colour NAME can map to two colour CODES in one style (4P: "White" is
    // both WS and WX at different costs). Suffix the code so options stay unique.
    const codesByColour = new Map<string, Set<string>>()
    for (const r of list) {
      const c = str(r["Colour"])
      const set = codesByColour.get(c) ?? new Set<string>()
      set.add(str(r["Colour Code"]))
      codesByColour.set(c, set)
    }

    const variants: JbsVariant[] = list.map((r) => {
      const colourName = str(r["Colour"])
      const colour =
        (codesByColour.get(colourName)?.size ?? 0) > 1
          ? `${colourName} (${str(r["Colour Code"])})`
          : colourName
      const cartonKg = num(r["Carton Gross Weight (kg)"])
      const cartonQty = num(r["Carton Qty"])
      return {
        sku: str(r["SKU"]),
        barcode: str(r["Barcode"]) || null,
        colour,
        colourCode: str(r["Colour Code"]),
        size: str(r["Size"]),
        cost: num(r["WEBCC Trade"]),
        // Carton gross weight ÷ units — real per-unit weight incl. packaging.
        weightGrams:
          cartonKg > 0 && cartonQty > 0 ? Math.round((cartonKg / cartonQty) * 1000) : null,
        imageUrl: str(r["Colour Image URL"]) || null,
        hightailFront: str(r["Hightail Colour Image"]) || null,
        hightailBack: str(r["Hightail Alt Colour Image"]) || null,
      }
    })

    styles.push({
      code,
      brand,
      title,
      handle: buildJbsHandle(brand, title, code),
      category: str(first["Category"]),
      subCategory: str(first["Sub Category"]),
      blurb: str(first["Style Blurb"]) || null,
      details: str(first["Style Details"]) || null,
      websiteUrl: str(first["Style Website Page"]) || null,
      isNew: str(first["New 2026"]).toLowerCase() === "new style",
      variants,
    })
  }
  return { styles, skipped }
}

/**
 * R2 object key for a JB's garment shot. JB's files are `<STYLE>_<COLOUR>_01`
 * (front) / `_03` (back) — no view word — but the storefront's
 * garmentUrlViewRank tells front from back by "front"/"back" in the URL, so we
 * re-key them: `jbs-wear/1BT3_F1_front.jpg`. Deterministic, so the uploader
 * and the importer agree without a manifest.
 */
export function jbsImageKey(styleCode: string, colourCode: string, view: "front" | "back"): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "")
  return `jbs-wear/${safe(styleCode)}_${safe(colourCode)}_${view}.jpg`
}

/** Blurb + the pipe-separated "Style Details" as one feature per line. */
export function renderJbsDescription(style: Pick<JbsStyle, "blurb" | "details">): string {
  const parts: string[] = []
  if (style.blurb) parts.push(style.blurb)
  if (style.details) {
    parts.push(
      style.details
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `• ${s}`)
        .join("\n")
    )
  }
  return parts.join("\n\n")
}

/**
 * Drop excluded styles ("4LSW") and colourways ("1HT/NX"); a style left with
 * no variants is dropped too. Returns what was removed for the import log.
 */
export function applyJbsExclusions(
  styles: JbsStyle[],
  exclude: string[]
): { styles: JbsStyle[]; removedStyles: string[]; removedColourways: string[] } {
  const set = new Set(exclude.map((e) => e.trim().toUpperCase()).filter(Boolean))
  const removedStyles: string[] = []
  const removedColourways = new Set<string>()
  const kept: JbsStyle[] = []
  for (const s of styles) {
    const code = s.code.toUpperCase()
    if (set.has(code)) {
      removedStyles.push(s.code)
      continue
    }
    const variants = s.variants.filter((v) => {
      const key = `${code}/${v.colourCode.toUpperCase()}`
      if (!set.has(key)) return true
      removedColourways.add(key)
      return false
    })
    if (!variants.length) removedStyles.push(s.code)
    else kept.push({ ...s, variants })
  }
  return { styles: kept, removedStyles, removedColourways: [...removedColourways] }
}
