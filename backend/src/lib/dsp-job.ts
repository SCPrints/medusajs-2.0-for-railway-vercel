/**
 * DSP job pack — turns a job-pricer job into what DSP (our screen-print and
 * Supacolour supplier, runs printIQ) needs to book it with minimal typing:
 *   - one art-proof page per position, laid out on DSP's own template
 *     (services/dsp-pack/pdf.ts stamps it), and
 *   - a printIQ copy-paste block in the same order and wording as their job
 *     window (title, description, PO, due date, production-priority sizes,
 *     the stock + PMS questions).
 *
 * Pure: no framework imports, so it is unit-tested and safe to share.
 * One pack per pricer GROUP (one garment type) — DSP books one job per garment.
 * Only DSP work is included: screen print positions, and print positions on
 * the Supacolour channel. DTF and embroidery stay in-house.
 */

export type DspPricerPosition = {
  id: string
  side: string
  method: "print" | "screen" | "embroidery"
  designId: string
  channel?: string
  colours?: string
  /** One entry per design colour, e.g. "PMS 485C - Red". */
  pms?: string[]
  /** DSP job number of the run whose screens / transfers we're repeating, e.g. "J52350". */
  repeatJob?: string
  /** Finished print size in mm, "280 x 189". */
  sizeMm?: string
}
export type DspPricerDesign = { id: string; label: string; name?: string; repeat?: boolean; imageUrl?: string | null; vectorUrl?: string | null }
export type DspPricerRow = { colour: string | null; label: string; dark: boolean; cells: Record<string, string> }
export type DspPricerGroup = {
  id: string
  name?: string
  product: { id: string; title: string; thumbnail?: string | null } | null
  supplied: boolean
  rows: DspPricerRow[]
  positions: DspPricerPosition[]
  mockupUrl?: string | null
}
export type DspPricerState = { designs: DspPricerDesign[]; groups: DspPricerGroup[] }

export type DspProduct = { title: string; brand: string | null; type: string | null; supacolour: boolean }

export type DspInput = {
  state: DspPricerState
  products: Record<string, DspProduct>
  /** Our order number (DSP's "PO No." / "CPO"). Quote ref before an order exists. */
  poNumber: string
  customer: string
  /** ISO date; DSP's "Due date" / "PPD". */
  dueDate: string | null
  /** Print size measured off the Studio design, by group id then side. */
  placements?: Record<string, Record<string, { widthMm: number; heightMm: number }>>
}

export type DspPage = {
  positionLabel: string
  n: number
  of: number
  method: "screen" | "transfer"
  /** Ink names as staff typed them (base first on dark garments). */
  inks: string[]
  /** "1/3 BASE" … as DSP writes them on the proof. */
  colourLines: string[]
  screens: number | null
  qty: number
  codeProd: string
  printSize: { widthMm: number; heightMm: number } | null
  sizeLines: string[]
  repeatJob: string | null
  dark: boolean
  artworkUrl: string | null
  vectorUrl: string | null
  garmentImageUrl: string | null
}

export type DspGroupPack = {
  groupId: string
  title: string
  qty: number
  pages: DspPage[]
  printiqText: string
  artwork: Array<{ position: string; design: string; vectorUrl: string | null; rasterUrl: string | null }>
  warnings: string[]
}

const POSITION_LABELS: Record<string, string> = {
  front: "Centre Front",
  back: "Centre Back",
  left_chest: "Left Chest",
  right_chest: "Right Chest",
  left_sleeve: "Left Sleeve",
  right_sleeve: "Right Sleeve",
  nape: "Nape",
  hood: "Hood",
  side: "Side Panel",
  printed_tag: "Neck Label",
  other: "Other (see notes)",
}
/** Pricer side → the Studio canvas side its measured placement lives on. */
const STUDIO_SIDE: Record<string, string> = { left_chest: "front", right_chest: "front", nape: "back", hood: "back" }
const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"]

const SIZE_ORDER = ["2XS", "XXS", "XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL", "5XL", "6XL", "7XL"]
const sizeRank = (s: string) => {
  const i = SIZE_ORDER.indexOf(s.trim().toUpperCase())
  if (i >= 0) return i
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? 100 + n : 1000
}
const qtyOf = (v: string | undefined) => Math.max(0, Math.floor(Number(v) || 0))

export const positionLabel = (side: string) => POSITION_LABELS[side] ?? side.replace(/_/g, " ")

/** "280 x 189", "280×189mm", "280 by 189" → { 280, 189 }; anything else → null. */
export function parseSizeMm(raw: string | undefined | null): { widthMm: number; heightMm: number } | null {
  const m = String(raw ?? "").match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)/i)
  if (!m) return null
  const [w, h] = [Number(m[1]), Number(m[2])]
  return w > 0 && h > 0 ? { widthMm: Math.round(w), heightMm: Math.round(h) } : null
}

const isDspPosition = (p: DspPricerPosition, product: DspProduct | undefined) =>
  p.method === "screen" || (p.method === "print" && (p.channel === "supacolour" || (p.channel === "auto" && product?.supacolour === true)))

/** "DD/MM/YY" like DSP's due-date field. */
export function dspDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Australia/Sydney" })
}

function rowName(g: DspPricerGroup, r: DspPricerRow) {
  return g.supplied ? r.label.trim() || (r.dark ? "Dark garments" : "Light garments") : r.colour ?? r.label.trim() ?? ""
}

function sizeBreakdown(g: DspPricerGroup): { lines: string[]; byRow: Array<{ name: string; sizes: Array<[string, number]> }> } {
  const byRow = g.rows
    .map((r) => ({
      name: rowName(g, r),
      sizes: Object.entries(r.cells)
        .map(([s, q]) => [s === "" ? "Any size" : s, qtyOf(q)] as [string, number])
        .filter(([, q]) => q > 0)
        .sort((a, b) => sizeRank(a[0]) - sizeRank(b[0])),
    }))
    .filter((r) => r.sizes.length)
  const multi = byRow.length > 1
  const lines = byRow.flatMap((r) => [...(multi ? [r.name.toUpperCase()] : []), ...r.sizes.map(([s, q]) => `${s} - ${q}`)])
  return { lines, byRow }
}

export function buildDspPack(input: DspInput): DspGroupPack[] {
  const { state, products } = input
  const due = dspDate(input.dueDate)
  const out: DspGroupPack[] = []

  for (const g of state.groups ?? []) {
    const product = g.product ? products[g.product.id] : undefined
    const positions = (g.positions ?? []).filter((p) => isDspPosition(p, product))
    if (!positions.length) continue

    const warnings: string[] = []
    const { lines: sizeLines, byRow } = sizeBreakdown(g)
    const qty = byRow.reduce((s, r) => s + r.sizes.reduce((a, [, q]) => a + q, 0), 0)
    const anyDark = g.rows.some((r) => r.dark)
    const allDark = g.rows.length > 0 && g.rows.every((r) => r.dark)
    const garmentTitle = g.supplied ? (g.name?.trim() || "Customer-supplied garments") : product?.title ?? g.product?.title ?? "Garment"
    const colours = byRow.map((r) => r.name).filter(Boolean)
    const codeProd = `${colours.join("; ")} ${garmentTitle}`.trim()

    const pages: DspPage[] = positions.map((p, i) => {
      const design = state.designs.find((d) => d.id === p.designId)
      const label = positionLabel(p.side)
      const studioSide = STUDIO_SIDE[p.side] ?? p.side
      const printSize = parseSizeMm(p.sizeMm) ?? input.placements?.[g.id]?.[studioSide] ?? null
      if (!printSize) warnings.push(`${label}: no print size — enter it in the job pricer (mm, e.g. 280 x 189).`)
      if (!design?.vectorUrl) warnings.push(`${label}: no vector artwork on design ${design?.label ?? "?"} — DSP won't accept raster files for screens.`)

      if (p.method === "screen") {
        const n = Math.min(6, Math.max(1, Number(p.colours) || 1))
        const refs = Array.from({ length: n }, (_, k) => p.pms?.[k]?.trim() || "")
        if (refs.some((r) => !r)) warnings.push(`${label}: ${refs.filter((r) => !r).length} PMS colour(s) not entered.`)
        const inks = [...(anyDark ? [allDark ? "Base" : "Base (dark garments only)"] : []), ...refs.map((r, k) => r || `Colour ${k + 1} - PMS TBC`)]
        return {
          positionLabel: label,
          n: i + 1,
          of: positions.length,
          method: "screen",
          inks,
          colourLines: inks.map((ink, k) => `${k + 1}/${inks.length} ${ink.toUpperCase()}`),
          screens: inks.length,
          qty,
          codeProd,
          printSize,
          sizeLines,
          repeatJob: p.repeatJob?.trim() || null,
          dark: anyDark,
          artworkUrl: design?.imageUrl ?? null,
          vectorUrl: design?.vectorUrl ?? null,
          garmentImageUrl: g.mockupUrl ?? g.product?.thumbnail ?? null,
        }
      }
      return {
        positionLabel: label,
        n: i + 1,
        of: positions.length,
        method: "transfer",
        inks: [],
        colourLines: ["1/1 SUPACOLOUR TRANSFER"],
        screens: null,
        qty,
        codeProd,
        printSize,
        sizeLines,
        repeatJob: p.repeatJob?.trim() || null,
        dark: anyDark,
        artworkUrl: design?.imageUrl ?? null,
        vectorUrl: design?.vectorUrl ?? null,
        garmentImageUrl: g.mockupUrl ?? g.product?.thumbnail ?? null,
      }
    })

    const title = `${input.customer} ${codeProd} x ${qty}. ${pages.length} pos`
    const printiqText = printiqBlock({ input, g, product, pages, title, due, byRow, garmentTitle })
    out.push({
      groupId: g.id,
      title,
      qty,
      pages,
      printiqText,
      artwork: pages.map((pg, i) => {
        const d = state.designs.find((x) => x.id === positions[i].designId)
        return { position: pg.positionLabel, design: d?.label ?? "?", vectorUrl: pg.vectorUrl, rasterUrl: pg.artworkUrl }
      }),
      warnings,
    })
  }
  return out
}

function printiqBlock(a: {
  input: DspInput
  g: DspPricerGroup
  product: DspProduct | undefined
  pages: DspPage[]
  title: string
  due: string | null
  byRow: Array<{ name: string; sizes: Array<[string, number]> }>
  garmentTitle: string
}): string {
  const { input, g, product, pages } = a
  const desc: string[] = []
  pages.forEach((pg, i) => {
    const size = pg.printSize ? `${pg.printSize.widthMm} x ${pg.printSize.heightMm} mm` : "TBC"
    desc.push(`${ORDINALS[i] ?? `Position ${i + 1}`} Position -`)
    if (pg.method === "screen") {
      desc.push(`${pg.inks.length} PMS Colours (PMS Refs - ${pg.inks.join(", ")})`)
      desc.push(pg.repeatJob ? `Repeat Job screens - ${pg.repeatJob},` : "New Job screens,")
      desc.push(`Screenprinting position to ${pg.positionLabel},`)
      desc.push(`Screenprinting size ${size},`)
    } else {
      desc.push("Supacolour Transfer - full colour,")
      desc.push(pg.repeatJob ? `Repeat transfers - ${pg.repeatJob},` : "New transfers,")
      desc.push(`Transfer application position to ${pg.positionLabel},`)
      desc.push(`Transfer size ${size},`)
    }
    desc.push("")
  })
  const stock = a.byRow.map((r) => `${r.name}: ${r.sizes.map(([s, q]) => `${s} x ${q}`).join(", ")}`).join(" | ")
  const brandType = [product?.brand, product?.type].filter(Boolean).join(" ")
  const stockDetails = `${g.supplied ? "" : brandType ? `${brandType} - ` : ""}${a.garmentTitle} - ${stock}`

  const questions: string[] = [`Stock Details (Customer to Supply Stock): ${stockDetails}`]
  pages.forEach((pg, i) => {
    if (pg.method !== "screen") return
    questions.push(`${ORDINALS[i] ?? `Position ${i + 1}`} Position (${pg.positionLabel}):`)
    pg.inks.forEach((ink, k) => questions.push(`  PMS ${k + 1}: ${ink}`))
  })

  return [
    `JOB TITLE: ${a.title}`,
    `PO NO: ${input.poNumber}`,
    `DUE DATE: ${a.due ?? "TBC"}`,
    "",
    "--- DESCRIPTION ---",
    ...desc,
    `Customer to Supply Stock - Stock Details - ${stockDetails}`,
    "",
    "Artwork supplied Vector Art with PMS Colour Codes,",
    "Photo of job is not required,",
    "No Labelling Required,",
    "STANDARD - Hand Fold & Re-Box,",
    "Pick Up - SC Prints will collect; please advise once the job is completed.",
    "",
    "--- NOTES: PRODUCTION PRIORITY ---",
    ...a.byRow.flatMap((r) => [...(a.byRow.length > 1 ? [r.name] : []), ...r.sizes.map(([s, q]) => `${s} - ${q}`)]),
    "",
    "--- QUESTIONS ---",
    ...questions,
  ].join("\n")
}
