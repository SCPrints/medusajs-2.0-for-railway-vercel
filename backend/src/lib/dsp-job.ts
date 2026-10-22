/**
 * DSP job pack — turns an ORDER into what DSP (our screen-print and
 * Supacolour supplier, runs printIQ) needs to book the job with minimal typing:
 *   - one art-proof page per position, laid out on DSP's own template
 *     (services/dsp-pack/pdf.ts stamps it), and
 *   - a printIQ copy-paste block in the same order and wording as their job
 *     window (title, description, PO, due date, production-priority sizes,
 *     stock + colour questions).
 *
 * Everything comes from the order: garment / colour / size / qty from the
 * lines, positions + colour counts + dark-garment base + artwork from each
 * line's customizerDesign, print size from staff's typed dimension or the
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
  printiqText: string
  artwork: Array<{ position: string; printUrl: string | null; originals: Array<{ name: string; url: string }> }>
  warnings: string[]
}

const SIDE_LABELS: Record<string, string> = {
  front: "Centre Front",
  back: "Centre Back",
  left_sleeve: "Left Sleeve",
  right_sleeve: "Right Sleeve",
  printed_tag: "Neck Label",
}
const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"]
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
      const printSize = parseSizeMm(typed) ?? (placement ? { widthMm: placement.widthMm, heightMm: placement.heightMm } : null)
      if (!printSize) warnings.push(`${label}: print size unknown — DSP will size from the artwork.`)
      const art = artifacts.find((a) => a.side === side)
      if (!art?.printUrl) warnings.push(`${label}: no print file on the order.`)
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
        artworkUrl: art?.printUrl ?? null,
        garmentImageUrl: mockup,
      }
      if ((methods[side] ?? "print") === "screen") {
        const cfg = screenCfg[side] ?? {}
        const n = Math.min(6, Math.max(1, Number(cfg.colours) || 1))
        const dark = cfg.darkGarment === true
        const names = notedInks.length === n ? notedInks : Array.from({ length: n }, (_, k) => `Colour ${k + 1} - see artwork`)
        const inks = [...(dark ? ["Base"] : []), ...names]
        return { ...common, method: "screen" as const, dark, inks, colourLines: inks.map((ink, k) => `${k + 1}/${inks.length} ${ink.toUpperCase()}`), screens: inks.length }
      }
      return { ...common, method: "transfer" as const, dark: false, inks: [], colourLines: ["1/1 SUPACOLOUR TRANSFER"], screens: null }
    })

    const title = `${input.customer} ${codeProd} x ${qty}. ${pages.length} pos`
    out.push({
      groupId,
      title,
      qty,
      pages,
      printiqText: printiqBlock({ input, product, pages, title, rows, garment, notes: canonical.notes }),
      artwork: pages.map((pg) => ({
        position: pg.positionLabel,
        printUrl: pg.artworkUrl,
        originals: originals
          .filter((f) => f.url && (!f.sides?.length || f.sides.includes(pg.side)))
          .map((f) => ({ name: f.fileName || "upload", url: f.url! })),
      })),
      warnings,
    })
  }
  return out
}

function printiqBlock(a: {
  input: DspInput
  product: DspProduct | undefined
  pages: DspPage[]
  title: string
  rows: Array<{ colour: string; sizes: Array<[string, number]> }>
  garment: string
  notes: string | null
}): string {
  const desc: string[] = []
  a.pages.forEach((pg, i) => {
    const size = pg.printSize ? `${pg.printSize.widthMm} x ${pg.printSize.heightMm} mm` : "as per artwork"
    desc.push(`${ORDINALS[i] ?? `Position ${i + 1}`} Position -`)
    if (pg.method === "screen") {
      desc.push(`${pg.inks.length} Colours (Refs - ${pg.inks.join(", ")})`)
      desc.push("New Job screens,")
      desc.push(`Screenprinting position to ${pg.positionLabel},`)
      desc.push(`Screenprinting size ${size},`)
    } else {
      desc.push("Supacolour Transfer - full colour,")
      desc.push(`Transfer application position to ${pg.positionLabel},`)
      desc.push(`Transfer size ${size},`)
    }
    desc.push("")
  })
  const stock = a.rows.map((r) => `${r.colour}: ${r.sizes.map(([s, q]) => `${s} x ${q}`).join(", ")}`).join(" | ")
  const brandType = [a.product?.brand, a.product?.type].filter(Boolean).join(" ")
  const stockDetails = `${brandType ? `${brandType} - ` : ""}${a.garment} - ${stock}`

  const questions: string[] = [`Stock Details (Customer to Supply Stock): ${stockDetails}`]
  a.pages.forEach((pg, i) => {
    if (pg.method !== "screen") return
    questions.push(`${ORDINALS[i] ?? `Position ${i + 1}`} Position (${pg.positionLabel}):`)
    pg.inks.forEach((ink, k) => questions.push(`  Colour ${k + 1}: ${ink}`))
  })

  return [
    `JOB TITLE: ${a.title}`,
    `PO NO: ${a.input.poNumber}`,
    `DUE DATE: ${dspDate(a.input.dueDate) ?? "TBC"}`,
    "",
    "--- DESCRIPTION ---",
    ...desc,
    `Customer to Supply Stock - Stock Details - ${stockDetails}`,
    ...(a.notes ? ["", `Job notes: ${a.notes}`] : []),
    "",
    "Artwork supplied - see attached proof and artwork links,",
    "Photo of job is not required,",
    "No Labelling Required,",
    "STANDARD - Hand Fold & Re-Box,",
    "Pick Up - SC Prints will collect; please advise once the job is completed.",
    "",
    "--- NOTES: PRODUCTION PRIORITY ---",
    ...a.rows.flatMap((r) => [...(a.rows.length > 1 ? [r.colour] : []), ...r.sizes.map(([s, q]) => `${s} - ${q}`)]),
    "",
    "--- QUESTIONS ---",
    ...questions,
  ].join("\n")
}
