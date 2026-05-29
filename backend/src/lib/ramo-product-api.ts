/**
 * Pure helpers for RAMO's product JSON API.
 *
 * RAMO (ramo.com.au) runs a Maropost/Neto storefront whose product pages are
 * a Vue app fed by a JSON endpoint:
 *
 *   https://www.ramo.com.au/cgi/get_retail_product.cgi?webname=<web_name>
 *
 * The response carries an EXPLICIT colour → image-filename map under
 * `metadata.colour_images`, plus the lifestyle/model shots shared across
 * colours under `metadata.shared_model_images`, and the canonical colour
 * list (name + hex) under `attributes`. Image files live at
 * `/persistent/catalogue_images/products/<filename>`.
 *
 * This is far better than the old `_backfill-ramo-cdn-images.ts` URL-guessing
 * (`{STYLE}_{Colour}.jpg`): the API tells us the real per-colour filenames, so
 * no colour ends up with the wrong photo (or no photo when RAMO named the file
 * differently than we guessed).
 *
 * Everything here is pure (no network, no container) so it can be unit-tested
 * against a fixture. The network walk + DB writes live in
 * `backend/src/scripts/backfill-ramo-images-from-api.ts`.
 */

/** Public image base. `www.ramo.com.au` is the host already allow-listed in the
 *  storefront's `next.config.js` remotePatterns, so URLs built here render in
 *  `next/image` without a config change. */
export const RAMO_IMAGE_BASE =
  "https://www.ramo.com.au/persistent/catalogue_images/products/"

/** Build a full image URL from a RAMO catalogue filename (e.g. `f377dg_olive_front.jpg`). */
export const ramoImageUrl = (filename: string): string =>
  `${RAMO_IMAGE_BASE}${String(filename).trim()}`

/** Lowercased basename without extension — used for dedupe across hosts/case. */
export const imageFilenameKey = (urlOrName: string): string => {
  const noQuery = String(urlOrName).split("?")[0] ?? ""
  const base = noQuery.split("/").pop() ?? noQuery
  return base.replace(/\.(jpe?g|png|webp|gif)$/i, "").toLowerCase()
}

/** Normalise a colour label for matching ("  Navy  Blue " → "navy blue"). */
export const normaliseColourKey = (value: string): string =>
  String(value).trim().toLowerCase().replace(/\s+/g, " ")

/**
 * Fabric-finish modifiers that mark a DISTINCT colourway, not the plain solid
 * (e.g. "Navy Marl" vs the solid "Navy Blue"). Used to disambiguate a plain
 * colour against its marled sibling during matching.
 */
const COLOUR_MODIFIER_RE = /\b(marl|marle|marled|heather|heathered|htr|melange|tri[- ]?blend)\b/

/**
 * Style code from a RAMO variant code, e.g. `F377DG_RE_S` → `F377DG`.
 * Some codes carry a Neto parent artifact (`TP212H--5_GO_S`); strip anything
 * past the leading alphanumeric run so it still resolves to `TP212H`.
 */
export const styleFromVariantCode = (code: string): string => {
  const head = String(code).split("_")[0]?.trim().toUpperCase() ?? ""
  return head.match(/^[A-Z0-9]+/)?.[0] ?? ""
}

/** Style code from a catalogue filename, e.g. `f377dg_olive_front.jpg` → `F377DG`. */
export const styleFromFilename = (filename: string): string => {
  const head = String(filename).split("_")[0]?.trim().toUpperCase() ?? ""
  return head.match(/^[A-Z0-9]+/)?.[0] ?? ""
}

type RamoImageEntry = {
  filename?: unknown
  sort_order?: unknown
  sort_value?: unknown
}

/** One colour's ordered image URLs: a representative `front` + the full set. */
export type RamoColourImages = { front: string; all: string[] }

export type RamoParsedProduct = {
  /** Style code derived from variant codes (preferred) or filenames. */
  styleCode: string
  /** RAMO colour value → ordered image URLs. Keyed by the verbatim RAMO label. */
  colourImages: Record<string, RamoColourImages>
  /** Lifestyle / model shots shared across colours (full URLs). */
  modelImageUrls: string[]
  /** Product-level gallery: model shots, then each colour's front + back. */
  gallery: string[]
  /** Canonical colour list from `attributes` (name + primary hex). */
  attributeColours: { value: string; hex: string | null }[]
}

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

/**
 * Order a colour's filenames: front first, then back, then everything else
 * (detail/close-up shots) by the API's own sort. `front`/`back` are detected
 * by filename token because RAMO's `sort_order` is inconsistent for the
 * primary colour (it interleaves the shared model shots).
 */
const orderColourFilenames = (images: RamoImageEntry[]): string[] => {
  const rows = images
    .map((i) => ({
      filename: typeof i.filename === "string" ? i.filename.trim() : "",
      sort_order: toNum(i.sort_order),
      sort_value: toNum(i.sort_value),
    }))
    .filter((r) => r.filename.length > 0)

  const rank = (fn: string): number => {
    const f = fn.toLowerCase()
    if (/(_|-)front\b|_front\./.test(f) || f.includes("_front")) return 0
    if (f.includes("_back")) return 1
    return 2
  }

  rows.sort((a, b) => {
    const ra = rank(a.filename)
    const rb = rank(b.filename)
    if (ra !== rb) return ra - rb
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    if (a.sort_value !== b.sort_value) return a.sort_value - b.sort_value
    return a.filename.localeCompare(b.filename)
  })

  // Dedupe preserving order.
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    const key = imageFilenameKey(r.filename)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r.filename)
  }
  return out
}

/**
 * Parse a `get_retail_product.cgi` JSON payload into a structured,
 * colour-keyed image map. Returns `null` when the payload has no usable
 * product data (e.g. an empty `{metadata:null,products:{}}` miss).
 */
export function parseRamoProductApi(json: unknown): RamoParsedProduct | null {
  if (!json || typeof json !== "object") return null
  const root = json as Record<string, unknown>

  const metadata = (root.metadata ?? null) as Record<string, unknown> | null
  const products = (root.products ?? {}) as Record<string, unknown>
  const attributes = Array.isArray(root.attributes) ? root.attributes : []

  const colourImagesRaw =
    (metadata?.colour_images ?? null) as Record<string, { images?: unknown }> | null
  const sharedFilenames: string[] = Array.isArray(metadata?.shared_model_images)
    ? (metadata!.shared_model_images as unknown[]).filter(
        (f): f is string => typeof f === "string" && f.length > 0
      )
    : []

  // ---- style code -------------------------------------------------------
  // Prefer the catalogue FILENAME (always clean `tp212h_...`) over the
  // variant `code`, which can carry a Neto parent artifact (`TP212H--5_...`).
  let styleCode = ""
  for (const obj of Object.values(colourImagesRaw ?? {})) {
    const imgs = Array.isArray(obj?.images) ? (obj.images as RamoImageEntry[]) : []
    const fn = imgs.find((i) => typeof i.filename === "string")?.filename
    if (typeof fn === "string") {
      styleCode = styleFromFilename(fn)
      if (styleCode) break
    }
  }
  if (!styleCode) {
    for (const sizes of Object.values(products)) {
      if (!sizes || typeof sizes !== "object") continue
      for (const prod of Object.values(sizes as Record<string, unknown>)) {
        const code = (prod as Record<string, unknown>)?.code
        if (typeof code === "string" && code.length) {
          styleCode = styleFromVariantCode(code)
          break
        }
      }
      if (styleCode) break
    }
  }

  const sharedKeys = new Set(sharedFilenames.map(imageFilenameKey))
  const modelImageUrls = sharedFilenames.map(ramoImageUrl)

  // ---- per-colour images ------------------------------------------------
  const colourImages: Record<string, RamoColourImages> = {}
  if (colourImagesRaw) {
    for (const [colour, obj] of Object.entries(colourImagesRaw)) {
      const label = colour.trim()
      if (!label) continue
      const imgs = Array.isArray(obj?.images) ? (obj.images as RamoImageEntry[]) : []
      const ordered = orderColourFilenames(imgs)
      const specific = ordered.filter((fn) => !sharedKeys.has(imageFilenameKey(fn)))
      const shared = ordered.filter((fn) => sharedKeys.has(imageFilenameKey(fn)))

      // `all` = colour-specific (front→back→details), then shared model shots.
      const allFilenames = [...specific, ...shared]
      if (allFilenames.length === 0) continue

      const frontFilename =
        specific.find((fn) => fn.toLowerCase().includes("_front")) ??
        specific[0] ??
        allFilenames[0]

      colourImages[label] = {
        front: ramoImageUrl(frontFilename),
        all: allFilenames.map(ramoImageUrl),
      }
    }
  }

  // ---- product-level gallery (model shots, then each colour front+back) --
  const galleryFilenames: string[] = [...sharedFilenames]
  for (const obj of Object.values(colourImagesRaw ?? {})) {
    const imgs = Array.isArray(obj?.images) ? (obj.images as RamoImageEntry[]) : []
    const ordered = orderColourFilenames(imgs).filter(
      (fn) => !sharedKeys.has(imageFilenameKey(fn))
    )
    // front + back only — keep detail close-ups out of the headline grid.
    const front = ordered.find((fn) => fn.toLowerCase().includes("_front")) ?? ordered[0]
    const back = ordered.find((fn) => fn.toLowerCase().includes("_back"))
    for (const fn of [front, back]) if (fn) galleryFilenames.push(fn)
  }
  const gallerySeen = new Set<string>()
  const gallery: string[] = []
  for (const fn of galleryFilenames) {
    const key = imageFilenameKey(fn)
    if (gallerySeen.has(key)) continue
    gallerySeen.add(key)
    gallery.push(ramoImageUrl(fn))
  }

  // ---- attribute colours (name + hex) -----------------------------------
  const attributeColours: { value: string; hex: string | null }[] = []
  for (const attr of attributes) {
    const a = attr as Record<string, unknown>
    if (String(a.attribute ?? "").toLowerCase() !== "colour") continue
    const value = typeof a.value === "string" ? a.value.trim() : ""
    if (!value) continue
    const hex = typeof a.colour1 === "string" && a.colour1.trim() ? a.colour1.trim() : null
    attributeColours.push({ value, hex: hex ? `#${hex.replace(/^#/, "")}` : null })
  }

  if (!styleCode && Object.keys(colourImages).length === 0 && gallery.length === 0) {
    return null
  }

  return { styleCode, colourImages, modelImageUrls, gallery, attributeColours }
}

/**
 * Match RAMO colour labels to a product's own colour option values.
 * Returns `ourValue → RamoColourImages`. Exact (normalised) match first; then
 * an unambiguous substring match (exactly one candidate) to absorb minor
 * label drift ("Navy" ↔ "Navy Blue"). Ambiguous/again-missing colours are
 * reported in `unmatched` for the caller to log.
 */
export function matchColoursToVariants(
  ourColourValues: string[],
  ramoColourImages: Record<string, RamoColourImages>
): {
  matched: Record<string, RamoColourImages>
  unmatched: string[]
} {
  const matched: Record<string, RamoColourImages> = {}
  const unmatched: string[] = []

  const ramoEntries = Object.entries(ramoColourImages)
  const byKey = new Map<string, RamoColourImages>()
  for (const [label, imgs] of ramoEntries) byKey.set(normaliseColourKey(label), imgs)

  for (const ours of ourColourValues) {
    const key = normaliseColourKey(ours)
    if (!key) continue

    const exact = byKey.get(key)
    if (exact) {
      matched[ours] = exact
      continue
    }

    // Substring fallback for minor label drift.
    let candidates = ramoEntries.filter(([label]) => {
      const lk = normaliseColourKey(label)
      return lk.includes(key) || key.includes(lk)
    })

    // When our value is a SOLID colour (no contrast slash) but several RAMO
    // labels contain it, prefer the solid RAMO names. RAMO ships contrast
    // colourways like "Navy/Red", "Navy/White", "Navy/Sky Blue" alongside the
    // solid "Navy Blue" — our plain "Navy" must land on the solid, not a
    // two-tone. Resolves "Navy" → "Navy Blue", "Royal" → "Royal Blue".
    if (candidates.length > 1 && !key.includes("/")) {
      const solids = candidates.filter(
        ([label]) => !normaliseColourKey(label).includes("/")
      )
      if (solids.length) candidates = solids
    }

    // Still ambiguous because RAMO also stocks a marled/heathered variant of
    // the same base (e.g. "Navy Marl" AND "Navy Blue")? Our plain colour is
    // the solid one — drop the textured modifiers. Resolves "Navy" →
    // "Navy Blue" (not "Navy Marl"), unless OUR value itself names a modifier.
    if (candidates.length > 1 && !COLOUR_MODIFIER_RE.test(key)) {
      const plain = candidates.filter(
        ([label]) => !COLOUR_MODIFIER_RE.test(normaliseColourKey(label))
      )
      if (plain.length) candidates = plain
    }

    if (candidates.length === 1) {
      matched[ours] = candidates[0][1]
    } else {
      unmatched.push(ours)
    }
  }

  return { matched, unmatched }
}
