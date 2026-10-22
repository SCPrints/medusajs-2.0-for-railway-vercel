/**
 * DSP job pack — turns an ORDER into what DSP (our screen-print and
 * Supacolour supplier, runs printIQ) needs to book the job with minimal typing:
 * one art-proof page per position on DSP's own template (services/dsp-pack/pdf.ts),
 * a short job summary for the email, and the best artwork file per position.
 *
 * Everything comes from the order: garment / colour / size / qty from the
 * lines, positions + colour counts + dark-garment base from each line's
 * customizerDesign, artwork from staff's revised proof → the customer's upload
 * → the order print file, print size from staff's typed dimension or the
 * design's measured placement. Nothing for staff to fill in.
 *
 * Pure: no framework imports, so it is unit-tested and safe to share.
 * One pack per design group (one garment + design) — DSP books one job per garment.
 * Only DSP work is included: screen sides, and print sides on Supacolour
 * garments. DTF and embroidery stay in-house.
 */

export type DspLine = {
  id: string
  productId: string | null
  productTitle: string
  colour: string | null
  size: string | null
  quantity: number
  /** The line's customizerDesign (sideLayouts not needed). */
  design: Record<string, any> | null
  /** Staff description of the decoration (quote line text), e.g. "Screen print, white + green ink · …". */
  notes: string | null
}

export type DspProduct = { brand: string | null; type: string | null; supacolour: boolean }
export type DspPlacement = { side: string; widthMm: number; heightMm: number; offsetXMm: number }

export type DspInput = {
  /** Our order number — DSP's "PO No." / "CPO". */
  poNumber: string
  customer: string
  /** ISO date; DSP's "Due date" / "PPD". */
  dueDate: string | null
  lines: DspLine[]
  products: Record<string, DspProduct>
  /** Measured off each line's design (lib/print-placement), by line id. */
  placements?: Record<string, DspPlacement[]>
  /** Staff-typed print dimensions, `order.metadata.mockup_print_dimensions` ("<line>:<side>" → "8.75×3.5cm"). */
  dimensions?: Record<string, string>
  /** Latest revised-proof mockup per "<line>:<side>". */
  revisedMockups?: Record<string, string>
  /** Latest revised-proof ARTWORK per "<line>:<side>" — staff's corrected file, beats the customer's upload. */
  revisedArtwork?: Record<string, string>
}

export type DspPage = {
  side: string
  positionLabel: string
  n: number
  of: number
  method: "screen" | "transfer"
  /** Ink names (base first on dark garments). */
  inks: string[]
  /** "1/3 BASE" … as DSP writes them on the proof. */
  colourLines: string[]
  screens: number | null
  qty: number
  codeProd: string
  printSize: { widthMm: number; heightMm: number } | null
  sizeLines: string[]
  /** Kept for the proof's "REPEAT J…" slot; orders don't record it yet. */
  repeatJob: string | null
  dark: boolean
  artworkUrl: string | null
  garmentImageUrl: string | null
}

export type DspGroupPack = {
  groupId: string
  title: string
  qty: number
  pages: DspPage[]
  /** "Grey Marle AS Colour Staple Tee 5001" */
  garment: string
  /** "L 30 · XL 20 (50 total)" */
  sizesText: string
  /** Best artwork file per position (revised proof → customer upload → order print file). */
  artwork: Array<{ position: string; url: string | null; name: string }>
  warnings: string[]
}

const SIDE_LABELS: Record<string, string> = {
  front: "Centre Front",
  back: "Centre Back",
  left_sleeve: "Left Sleeve",
  right_sleeve: "Right Sleeve",
  printed_tag: "Neck Label",
}
const SIDE_ORDER = ["front", "back", "left_sleeve", "right_sleeve", "printed_tag"]

const SIZE_ORDER = ["2XS", "XXS", "XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL", "5XL", "6XL", "7XL"]
const sizeRank = (s: string) => {
  const i = SIZE_ORDER.indexOf(s.trim().toUpperCase())
  if (i >= 0) return i
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? 100 + n : 1000
}
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * A front print that's small and well off-centre is a chest print. As you
 * look at the garment, right of centre is the WEARER's left chest.
 * ponytail: 160 mm / 30 mm thresholds are eyeballed; tune if DSP mislabels.
 */
export function positionLabel(side: string, placement?: DspPlacement | null): string {
  if (side === "front" && placement && placement.widthMm <= 160 && Math.abs(placement.offsetXMm) >= 30) {
    return placement.offsetXMm > 0 ? "Left Chest" : "Right Chest"
  }
  return SIDE_LABELS[side] ?? titleCase(side.replace(/_/g, " "))
}

/** "280 x 189", "280×189mm", "8.75×3.5cm" → mm; anything else → null. */
export function parseSizeMm(raw: string | undefined | null): { widthMm: number; heightMm: number } | null {
  const m = String(raw ?? "").match(/(\d+(?:\.\d+)?)\s*(mm|cm)?\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i)
  if (!m) return null
  const k = (m[2] ?? m[4] ?? "mm").toLowerCase() === "cm" ? 10 : 1
  const [w, h] = [Number(m[1]) * k, Number(m[3]) * k]
  return w > 0 && h > 0 ? { widthMm: Math.round(w), heightMm: Math.round(h) } : null
}

/** "130 mm wide" / "13cm wide" → 130; anything else → null. */
export function parseWidthMm(raw: string | undefined | null): number | null {
  const m = String(raw ?? "").match(/(\d+(?:\.\d+)?)\s*(mm|cm)?\s*wide/i)
  if (!m) return null
  const w = Number(m[1]) * ((m[2] ?? "mm").toLowerCase() === "cm" ? 10 : 1)
  return w > 0 ? Math.round(w) : null
}

/** "Screen print, white + green ink · …" → ["White", "Green"]. */
export function inksFromNotes(notes: string | null): string[] {
  // Up to two words per ink ("forest green"), joined by + / & / and, right before "ink".
  const name = "[a-z]+(?: [a-z]+)?"
  const m = String(notes ?? "").match(new RegExp(`(${name}(?:\\s*(?:\\+|&|\\band\\b)\\s*${name})*)\\s+inks?\\b`, "i"))
  if (!m) return []
  return m[1]
    .split(/\s*(?:\+|&|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(titleCase)
}

/** "DD/MM/YY" like DSP's due-date field. */
export function dspDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Australia/Sydney" })
}

export function buildDspPack(input: DspInput): DspGroupPack[] {
  const groups = new Map<string, DspLine[]>()
  for (const l of input.lines) {
    if (!l.design) continue
    const key = String(l.design.group_id ?? l.productId ?? l.id)
    groups.set(key, [...(groups.get(key) ?? []), l])
  }

  const out: DspGroupPack[] = []
  for (const [groupId, lines] of groups) {
    const canonical = lines[0]
    const design = canonical.design!
    const product = canonical.productId ? input.products[canonical.productId] : undefined
    const methods = (design.sideDecorationMethods ?? {}) as Record<string, string>
    const screenCfg = (design.sideScreenConfigs ?? {}) as Record<string, { colours?: number; darkGarment?: boolean }>
    const artifacts = (Array.isArray(design.artifacts) ? design.artifacts : []) as Array<{ side?: string; printUrl?: string; mockupUrl?: string }>
    const originals = (Array.isArray(design.customerOriginalFiles) ? design.customerOriginalFiles : []) as Array<{ url?: string; fileName?: string; sides?: string[] }>

    const sides = Array.from(new Set([...Object.keys(methods), ...artifacts.map((a) => a.side).filter((s): s is string => !!s)]))
      .filter((side) => {
        const method = methods[side] ?? "print"
        return method === "screen" || (method === "print" && product?.supacolour === true)
      })
      .sort((a, b) => (SIDE_ORDER.indexOf(a) + 1 || 99) - (SIDE_ORDER.indexOf(b) + 1 || 99))
    if (!sides.length) continue

    // Sizes per colour, from the lines themselves.
    const byColour = new Map<string, Map<string, number>>()
    for (const l of lines) {
      const c = l.colour ?? ""
      const sizes = byColour.get(c) ?? new Map<string, number>()
      const s = l.size ?? "One size"
      sizes.set(s, (sizes.get(s) ?? 0) + l.quantity)
      byColour.set(c, sizes)
    }
    const rows = [...byColour].map(([colour, sizes]) => ({
      colour: titleCase(colour),
      sizes: [...sizes].sort((a, b) => sizeRank(a[0]) - sizeRank(b[0])),
    }))
    const qty = lines.reduce((s, l) => s + l.quantity, 0)
    const sizeLines = rows.flatMap((r) => [...(rows.length > 1 ? [r.colour.toUpperCase()] : []), ...r.sizes.map(([s, q]) => `${s} - ${q}`)])
    const garment = canonical.productTitle
    const codeProd = `${rows.map((r) => r.colour).filter(Boolean).join("; ")} ${garment}`.trim()
    const notedInks = inksFromNotes(canonical.notes)

    const warnings: string[] = []
    const pages: DspPage[] = sides.map((side, i) => {
      const placement = input.placements?.[canonical.id]?.find((p) => p.side === side) ?? null
      const label = positionLabel(side, placement)
      const typed = lines.map((l) => input.dimensions?.[`${l.id}:${side}`]).find(Boolean)
      const typedWidth = parseWidthMm(typed)
      const printSize =
        parseSizeMm(typed) ??
        (typedWidth && placement?.widthMm
          ? { widthMm: typedWidth, heightMm: Math.round((typedWidth * placement.heightMm) / placement.widthMm) } // keep the artwork's proportions
          : placement
            ? { widthMm: placement.widthMm, heightMm: placement.heightMm }
            : null)
      if (!printSize) warnings.push(`${label}: print size unknown — DSP will size from the artwork.`)
      const art = artifacts.find((a) => a.side === side)
      // Best file for DSP: staff's corrected proof artwork, else the customer's
      // own upload, else the order's rendered print file (often thumbnail-sized).
      const revised = lines.map((l) => input.revisedArtwork?.[`${l.id}:${side}`]).find(Boolean)
      // An untagged upload (pre-`sides` orders) only counts when it's the only one.
      const original =
        originals.find((f) => f.url && f.sides?.includes(side)) ??
        (originals.length === 1 && !originals[0].sides?.length ? originals[0] : undefined)
      const artworkUrl = revised ?? original?.url ?? art?.printUrl ?? null
      if (!artworkUrl) warnings.push(`${label}: no artwork file on the order.`)
      else if (!revised && !original) warnings.push(`${label}: only a low-resolution print file — attach the original artwork.`)
      const mockup = lines.map((l) => input.revisedMockups?.[`${l.id}:${side}`]).find(Boolean) ?? art?.mockupUrl ?? null
      const common = {
        side,
        positionLabel: label,
        n: i + 1,
        of: sides.length,
        qty,
        codeProd,
        printSize,
        sizeLines,
        repeatJob: null,
        artworkUrl,
        garmentImageUrl: mockup,
      }
      if ((methods[side] ?? "print") === "screen") {
        const cfg = screenCfg[side] ?? {}
        const n = Math.min(6, Math.max(1, Number(cfg.colours) || 1))
        const dark = cfg.darkGarment === true
        // The note covers the whole garment, so a 1-colour back on a "white + green"
        // job takes the first noted ink; fewer names than screens → DSP reads the artwork.
        const names = notedInks.length >= n ? notedInks.slice(0, n) : Array.from({ length: n }, (_, k) => `Colour ${k + 1} - see artwork`)
        const inks = [...(dark ? ["Base"] : []), ...names]
        return { ...common, method: "screen" as const, dark, inks, colourLines: inks.map((ink, k) => `${k + 1}/${inks.length} ${ink.toUpperCase()}`), screens: inks.length }
      }
      return { ...common, method: "transfer" as const, dark: false, inks: [], colourLines: ["1/1 SUPACOLOUR TRANSFER"], screens: null }
    })

    out.push({
      groupId,
      title: `${input.customer} ${codeProd} x ${qty}. ${pages.length} pos`,
      qty,
      pages,
      garment: codeProd,
      sizesText: `${rows.map((r) => `${rows.length > 1 ? `${r.colour}: ` : ""}${r.sizes.map(([s, q]) => `${s} ${q}`).join(" · ")}`).join(" | ")} (${qty} total)`,
      artwork: pages.map((pg) => ({
        position: pg.positionLabel,
        url: pg.artworkUrl,
        name: pg.artworkUrl ? decodeURIComponent(pg.artworkUrl.split("/").pop() ?? "artwork") : "",
      })),
      warnings,
    })
  }
  return out
}
