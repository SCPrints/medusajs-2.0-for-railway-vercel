/**
 * Garment fit: the real body width of a product's reference size (M) and how
 * wide the body appears in its photo, so the Studio can draw prints at true
 * size on the mockup (`mockup_scale`). Production centimetres never change —
 * this only feeds the preview. Stamped by scripts/stamp-garment-fit.ts.
 *
 * Body width = the garment laid flat, measured straight across under the arms
 * (AS Colour "Body Width", Gildan "Width (A)", AP / DNC "1/2 Chest", JB's
 * "Chest"). Charts that list the full chest circumference are halved.
 */
import sharp from "sharp"

export type SizeTable = { header: string[]; rows: string[][] }

export type GarmentFit = {
  reference_size: string
  body_width_cm: number
  /** Where body_width_cm came from (size_guide, gildan_csv, kiwi, jbs_site, dnc_chart, type_default, manual). */
  source: string
  /** Body width as a fraction of the 4:5 Studio canvas width, measured from flat-lay photos. */
  photo_body_ratio: number | null
  photo_samples: number
  /** photo body (reference cm) ÷ real body cm; null = photo couldn't be measured. */
  mockup_scale: number | null
  measured_at: string
}

/* ------------------------------------------------------------------ sizes */

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "")
const M_ALIASES = new Set(["M", "MED", "MEDIUM", "MD"])

/**
 * The size the mockup is drawn for: M when the chart has it, else the middle
 * size (women's numeric 8–24 → 14/16, kids 4–16 → 10). The caption tells the
 * customer which.
 */
export function pickReferenceSize(sizes: string[]): string | null {
  const clean = sizes.map((s) => s.trim()).filter(Boolean)
  if (!clean.length) return null
  const m = clean.find((s) => M_ALIASES.has(norm(s)))
  if (m) return m
  return clean[Math.floor((clean.length - 1) / 2)]
}

/** Full chest circumference → half; reject anything that isn't a plausible flat width. */
export function toBodyWidthCm(raw: unknown): number | null {
  const v = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[^\d.]/g, ""))
  if (!Number.isFinite(v) || v <= 0) return null
  const half = v > 95 ? v / 2 : v
  return half >= 25 && half <= 95 ? Math.round(half * 10) / 10 : null
}

const WIDTH_ROW = /(1\/2|half|½)?\s*(chest|bust|body\s*width|width)/i
const NOT_WIDTH_ROW = /to\s*fit|length|sleeve|waist|hip|inseam|shoulder/i

/**
 * Pull the reference-size body width out of a size table whose header is
 * ["<label>", size1, size2, ...] and whose rows are ["<measurement>", v1, v2, ...].
 */
export function widthFromTable(
  table: SizeTable | null | undefined
): { reference_size: string; body_width_cm: number } | null {
  if (!table?.header?.length || !table.rows?.length) return null
  const sizes = table.header.slice(1)
  const row =
    table.rows.find((r) => /1\/2|half|½|body\s*width/i.test(r[0] ?? "") && !NOT_WIDTH_ROW.test(r[0] ?? "")) ??
    table.rows.find((r) => WIDTH_ROW.test(r[0] ?? "") && !NOT_WIDTH_ROW.test(r[0] ?? ""))
  if (!row) return null
  const ref = pickReferenceSize(sizes.filter((_, i) => String(row[i + 1] ?? "").trim()))
  if (!ref) return null
  const width = toBodyWidthCm(row[sizes.indexOf(ref) + 1])
  return width ? { reference_size: ref, body_width_cm: width } : null
}

/* ---------------------------------------------------------------- sources */

/** gildanbrands.com.au/content/sizing_chart.csv → style → size table (Width row). */
export function parseGildanSizingCsv(csv: string): Map<string, SizeTable> {
  const out = new Map<string, { sizes: string[]; widths: string[] }>()
  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  const head = (lines.shift() ?? "").split(",").map((h) => h.trim().toLowerCase())
  const iSku = head.indexOf("parent_sku")
  const iSize = head.indexOf("size")
  const iWidth = head.indexOf("width")
  if (iSku < 0 || iSize < 0 || iWidth < 0) return new Map()
  for (const line of lines) {
    // ponytail: plain split — the file has no quoted commas today.
    const cols = line.split(",")
    const sku = cols[iSku]?.trim().toUpperCase()
    if (!sku) continue
    const entry = out.get(sku) ?? { sizes: [], widths: [] }
    entry.sizes.push(cols[iSize]?.trim() ?? "")
    entry.widths.push(cols[iWidth]?.trim() ?? "")
    out.set(sku, entry)
  }
  return new Map(
    [...out].map(([sku, e]) => [sku, { header: ["", ...e.sizes], rows: [["Width", ...e.widths]] }])
  )
}

/** Kiwi Sizing getSizingChart JSON (Aussie Pacific) → first table that has a chest row. */
export function parseKiwiSizing(json: unknown): SizeTable | null {
  const sizings = (json as { sizings?: Array<{ tables?: Record<string, { data?: unknown }> }> })?.sizings
  for (const sizing of sizings ?? []) {
    for (const t of Object.values(sizing.tables ?? {})) {
      const data = t?.data
      if (!Array.isArray(data) || data.length < 2) continue
      const rows = data.map((r: unknown) =>
        Array.isArray(r) ? r.map((c: { value?: unknown }) => String(c?.value ?? "").trim()) : []
      )
      const table = { header: rows[0], rows: rows.slice(1) }
      if (widthFromTable(table)) return table
    }
  }
  return null
}

const cellText = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()

/** Any HTML size table (JB's product page) → header + rows. */
export function parseHtmlSizeTable(html: string): SizeTable | null {
  for (const [table] of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(([tr]) =>
      [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => cellText(m[1]))
    )
    if (rows.length < 2) continue
    const parsed = { header: rows[0], rows: rows.slice(1) }
    if (widthFromTable(parsed)) return parsed
  }
  return null
}

/**
 * DNC publishes one "actual garment" chart per garment type, not per style
 * (dncworkwear.com.au/images/templateimages/DNCGarmentsActualSizeMeasurements_web.png,
 * read 2026-10-16). Half-chest at M (women 12, kids 8).
 */
const DNC_HALF_CHEST: Array<{ match: RegExp; women?: boolean; kids?: boolean; size: string; cm: number }> = [
  { match: /polo/i, kids: true, size: "8", cm: 39 },
  { match: /polo/i, women: true, size: "12", cm: 48 },
  { match: /shirt/i, women: true, size: "12", cm: 55 },
  { match: /fleece|hood|jumper|sweat|crew/i, women: true, size: "12", cm: 51.5 },
  { match: /singlet/i, kids: true, size: "8", cm: 37 },
  { match: /singlet|tank/i, size: "M", cm: 54 },
  { match: /vest/i, size: "M", cm: 59 },
  { match: /fleece|hood|jumper|sweat|crew/i, size: "M", cm: 59 },
  { match: /jacket/i, size: "M", cm: 61.5 },
  { match: /tee|t-shirt|polo/i, size: "M", cm: 55.5 },
  { match: /shirt/i, size: "M", cm: 59 },
]

/** Typical flat body widths for when a brand publishes nothing (Ramo, anything new). */
const TYPE_DEFAULT_HALF_CHEST: Array<{ match: RegExp; women?: boolean; kids?: boolean; size: string; cm: number }> = [
  { match: /./, kids: true, size: "8", cm: 40 },
  { match: /polo/i, women: true, size: "12", cm: 48 },
  { match: /./, women: true, size: "12", cm: 49 },
  { match: /hood|fleece|sweat|crew|jumper|quarter|zip/i, size: "M", cm: 58 },
  { match: /jacket|vest|puffer|softshell/i, size: "M", cm: 60 },
  { match: /polo|shirt/i, size: "M", cm: 55 },
  { match: /./, size: "M", cm: 53 },
]

/** No chest to measure: the mockup keeps today's look for these. */
const NOT_A_TOP = /\b(socks?|caps?|hats?|beanies?|visors?|bags?|totes?|backpacks?|aprons?|towels?|pants|shorts|trousers|skirts?|leggings|scarf|scarves|gloves?|stubby|coolers?|bottles?|mugs?)\b/i

export function chartBodyWidth(
  chart: "dnc" | "type_default",
  p: { title?: string | null; type?: string | null; tags?: string[] }
): { reference_size: string; body_width_cm: number } | null {
  const text = `${p.type ?? ""} ${p.title ?? ""}`
  if (NOT_A_TOP.test(text)) return null
  const tagText = (p.tags ?? []).join(" ")
  const kids = /\b(kids?|youth|junior|boys|girls|infant)\b/i.test(`${text} ${tagText}`)
  const women = !kids && /\b(women'?s?|womens|ladies|ladys?|female)\b/i.test(`${text} ${tagText}`)
  const table = chart === "dnc" ? DNC_HALF_CHEST : TYPE_DEFAULT_HALF_CHEST
  const hit = table.find((r) => !!r.kids === kids && !!r.women === women && r.match.test(text))
  return hit ? { reference_size: hit.size, body_width_cm: hit.cm } : null
}

/* ------------------------------------------------------------------ photo */

/** Studio canvas maths (storefront getPrintArea): 38 reference cm = 68% of canvas width; frame is 4:5. */
const CANVAS_ASPECT = 1.25
const REF_CM_PER_CANVAS_WIDTH = 38 / 0.68

/**
 * Body width of a flat-lay garment photo as a fraction of the Studio canvas
 * width, after the canvas's `object-fit: cover` crop. Returns null for photos
 * that aren't a clean flat-lay (model shots run off the top/bottom edge, busy
 * backgrounds) — those can't be measured reliably.
 */
export async function measurePhotoBodyRatio(image: Buffer): Promise<number | null> {
  const W = 400
  const { data, info } = await sharp(image)
    .flatten({ background: "#ffffff" })
    .resize({ width: W })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: ch } = info
  const px = (x: number, y: number) => {
    const i = (y * w + x) * ch
    return [data[i], data[i + 1], data[i + 2]]
  }
  // Background: all four corners must agree (a studio sweep or plain white).
  const corners = [px(1, 1), px(w - 2, 1), px(1, h - 2), px(w - 2, h - 2)]
  const bg = corners[0]
  const diff = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
  if (corners.some((c) => diff(c, bg) > 30)) return null
  const isFg = (x: number, y: number) => diff(px(x, y), bg) > 40

  const rowHasFg = (y: number) => {
    for (let x = 0; x < w; x += 2) if (isFg(x, y)) return true
    return false
  }
  let top = 0
  while (top < h && !rowHasFg(top)) top++
  let bottom = h - 1
  while (bottom > top && !rowHasFg(bottom)) bottom--
  // A garment touching the top or bottom edge is a model shot (head / legs) or cropped.
  if (top <= 2 || bottom >= h - 3 || bottom - top < h * 0.3) return null

  // Body = the run of foreground that crosses the garment's centre column,
  // sampled through the lower torso (55–80% down), below the sleeves.
  const widths: number[] = []
  for (let f = 0.55; f <= 0.8; f += 0.05) {
    const y = Math.round(top + f * (bottom - top))
    const cx = Math.round(w / 2)
    if (!isFg(cx, y)) continue
    let l = cx
    while (l > 0 && isFg(l - 1, y)) l--
    let r = cx
    while (r < w - 1 && isFg(r + 1, y)) r++
    widths.push(r - l + 1)
  }
  if (widths.length < 3) return null
  widths.sort((a, b) => a - b)
  const bodyPx = widths[Math.floor(widths.length / 2)]
  // object-fit: cover into a canvas of width 1 and height 1.25.
  const coverScale = Math.max(1 / w, CANVAS_ASPECT / h)
  const ratio = Math.round(bodyPx * coverScale * 1000) / 1000
  // A garment body is never a sliver or wider than the frame — that's a misread (logo, shadow).
  return ratio >= 0.3 && ratio <= 0.95 ? ratio : null
}

/**
 * photo body (in the Studio's reference cm) ÷ real body cm. Outside 0.4–1 the
 * measurement is more likely wrong than the photo that far off — return null
 * so the mockup keeps today's look.
 */
export function mockupScaleFor(photoBodyRatio: number | null, bodyWidthCm: number): number | null {
  if (!photoBodyRatio || !bodyWidthCm) return null
  const scale = (photoBodyRatio * REF_CM_PER_CANVAS_WIDTH) / bodyWidthCm
  return scale >= 0.4 && scale <= 1 ? Math.round(scale * 1000) / 1000 : null
}

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/* ----------------------------------------------------------------- vision */

const CHART_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sizes", "body_width_cm", "measurement_label"],
  properties: {
    sizes: { type: "array", items: { type: "string" } },
    body_width_cm: { type: "array", items: { type: ["number", "null"] } },
    measurement_label: { type: "string" },
  },
}

/**
 * Read an image-only size chart (AS Colour, Shaka) into a SizeTable. One call
 * per distinct chart URL; the caller caches. Returns null when the chart has
 * no garment body-width row (e.g. a "to fit" body-measurement chart).
 */
export async function readSizeChartImage(
  url: string,
  opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch }
): Promise<SizeTable | null> {
  const f = opts.fetchImpl ?? fetch
  // Send the bytes, not the URL: supplier CDNs (AS Colour) refuse the API's downloader.
  const img = await f(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) })
  if (!img.ok) return null
  const mediaType = (img.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim()
  if (!/^image\/(jpeg|png|gif|webp)$/.test(mediaType)) return null
  const data = Buffer.from(await img.arrayBuffer()).toString("base64")
  // ponytail: raw fetch to match services/ai-copy (backend has no Anthropic SDK dep).
  const res = await f("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify({
      model: opts.model ?? "claude-opus-5-5",
      max_tokens: 2000,
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: CHART_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            {
              type: "text",
              text:
                "This is a garment size chart. Return the size labels in column order and, for each size, " +
                "the garment's flat body width in cm: the row named Body Width, Width, Chest or 1/2 Chest, " +
                "measured across the garment under the arms. Copy the numbers exactly as printed. " +
                "Put the row's printed name in measurement_label. If the chart only gives body measurements " +
                "to fit (not garment measurements), or has no such row, return empty arrays.",
            },
          ],
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as {
    stop_reason?: string
    content?: Array<{ type: string; text?: string }>
  }
  if (body.stop_reason === "refusal") return null
  const text = body.content?.find((b) => b.type === "text")?.text
  if (!text) return null
  const parsed = JSON.parse(text) as { sizes: string[]; body_width_cm: Array<number | null>; measurement_label: string }
  if (!parsed.sizes?.length || parsed.sizes.length !== parsed.body_width_cm?.length) return null
  // Force a width-row label so widthFromTable picks it up regardless of wording.
  return {
    header: ["", ...parsed.sizes],
    rows: [["Body Width", ...parsed.body_width_cm.map((v) => (v == null ? "" : String(v)))]],
  }
}
