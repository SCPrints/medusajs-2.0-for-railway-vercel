import fs from "fs"
import path from "path"
import PDFDocument from "pdfkit"

import { SCP_COMPANY_ABN } from "../../lib/constants"
import { tintLogo } from "../order-receipt-pdf/service"

/**
 * One letterhead + tables PDF for the customer account documents (cart quote,
 * price list, statement). Same look as the tax invoice (logo, fonts, colours).
 * Callers pass ready-formatted strings; this only lays them out.
 */
const ASSETS_DIR = path.join(__dirname, "../../assets")
const INK = "#0f172a"
const BRAND = "#ff2e63"
const MUTED = "#666666"
const RULE = "#e5e7eb"

export type DocColumn = { label: string; /** share of the page width, 0-1 */ width: number; align?: "left" | "right" }
export type DocTable = { heading?: string; note?: string; columns: DocColumn[]; rows: string[][] }
export type DocSpec = {
  title: string
  subtitle: string
  /** "For" block, top left. */
  to?: string[]
  /** Label / value pairs, top right. */
  facts?: Array<[string, string]>
  tables: DocTable[]
  totals?: Array<{ label: string; value: string; bold?: boolean }>
  notes?: string[]
}

export async function buildDocPdf(spec: DocSpec): Promise<Buffer> {
  const regular = fs.readFileSync(path.join(ASSETS_DIR, "fonts/PlusJakartaSans-Regular.woff"))
  const bold = fs.readFileSync(path.join(ASSETS_DIR, "fonts/PlusJakartaSans-Bold.woff"))
  const logo = await tintLogo(fs.readFileSync(path.join(ASSETS_DIR, "images/sc-prints-logo.png")), 200, BRAND)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 })
    doc.registerFont("PJS", regular)
    doc.registerFont("PJS-Bold", bold)
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const PW = 595.28
    const PH = 841.89
    const ML = 48
    const W = PW - ML * 2
    const BOTTOM = PH - 56
    const text = (s: string, x: number, y: number, opts: PDFKit.Mixins.TextOptions & { font?: string; size?: number; color?: string } = {}) => {
      const { font = "PJS", size = 10, color = INK, ...rest } = opts
      doc.font(font).fontSize(size).fillColor(color).text(s, x, y, rest)
    }

    // Letterhead
    doc.image(logo, ML, 48, { fit: [56, 56] })
    text(spec.title, ML + 70, 56, { font: "PJS-Bold", size: 20 })
    text(spec.subtitle, ML + 70, 82, { color: MUTED })
    text("SC PRINTS", ML, 56, { font: "PJS-Bold", size: 12, width: W, align: "right" })
    text("info@scprints.com.au", ML, 72, { size: 9, color: MUTED, width: W, align: "right" })
    text("scprints.com.au", ML, 86, { size: 9, color: MUTED, width: W, align: "right" })
    if (SCP_COMPANY_ABN) text(`ABN ${SCP_COMPANY_ABN}`, ML, 100, { size: 9, color: MUTED, width: W, align: "right" })
    doc.moveTo(ML, 124).lineTo(PW - ML, 124).strokeColor(RULE).lineWidth(1).stroke()

    let y = 140
    const to = (spec.to ?? []).filter(Boolean)
    const facts = spec.facts ?? []
    if (to.length || facts.length) {
      const top = y
      if (to.length) {
        text("FOR", ML, y, { font: "PJS-Bold", size: 8, color: MUTED })
        let ty = y + 14
        for (const line of to) {
          text(line, ML, ty, { width: W * 0.55 })
          ty = doc.y + 2
        }
        y = ty
      }
      let fy = top
      for (const [label, value] of facts) {
        text(label.toUpperCase(), ML + W * 0.6, fy, { font: "PJS-Bold", size: 8, color: MUTED, width: W * 0.4, align: "right" })
        text(value, ML + W * 0.6, fy + 11, { width: W * 0.4, align: "right" })
        fy = doc.y + 6
      }
      y = Math.max(y, fy) + 14
    }

    const newPage = () => {
      doc.addPage()
      y = 48
    }

    for (const table of spec.tables) {
      if (y > BOTTOM - 80) newPage()
      if (table.heading) {
        text(table.heading, ML, y, { font: "PJS-Bold", size: 12 })
        y = doc.y + 4
      }
      if (table.note) {
        text(table.note, ML, y, { size: 9, color: MUTED, width: W })
        y = doc.y + 6
      }
      const xs: number[] = []
      let x = ML
      for (const c of table.columns) {
        xs.push(x)
        x += c.width * W
      }
      const cell = (s: string, i: number, cy: number, opts: { font?: string; size?: number; color?: string }) =>
        text(s, xs[i] + 2, cy, { ...opts, width: table.columns[i].width * W - 6, align: table.columns[i].align ?? "left" })
      const header = () => {
        table.columns.forEach((c, i) => cell(c.label.toUpperCase(), i, y, { font: "PJS-Bold", size: 8, color: MUTED }))
        y += 14
        doc.moveTo(ML, y).lineTo(PW - ML, y).strokeColor(RULE).lineWidth(1).stroke()
        y += 6
      }
      header()
      for (const row of table.rows) {
        doc.font("PJS").fontSize(9.5)
        const h = Math.max(
          ...row.map((s, i) => doc.heightOfString(s || " ", { width: table.columns[i].width * W - 6 }))
        )
        if (y + h > BOTTOM) {
          newPage()
          header()
        }
        row.forEach((s, i) => cell(s, i, y, { size: 9.5 }))
        y += h + 5
        doc.moveTo(ML, y).lineTo(PW - ML, y).strokeColor(RULE).lineWidth(0.5).stroke()
        y += 5
      }
      y += 12
    }

    const totals = spec.totals ?? []
    if (totals.length) {
      if (y + totals.length * 18 > BOTTOM) newPage()
      for (const t of totals) {
        const font = t.bold ? "PJS-Bold" : "PJS"
        const size = t.bold ? 12 : 10
        text(t.label, ML + W * 0.45, y, { font, size, color: t.bold ? INK : MUTED, width: W * 0.3, align: "right" })
        text(t.value, ML + W * 0.75, y, { font, size, width: W * 0.25, align: "right" })
        y += t.bold ? 22 : 16
      }
      y += 10
    }

    for (const note of spec.notes ?? []) {
      doc.font("PJS").fontSize(9)
      if (y + doc.heightOfString(note, { width: W }) > BOTTOM) newPage()
      text(note, ML, y, { size: 9, color: MUTED, width: W })
      y = doc.y + 6
    }

    doc.end()
  })
}

export const money = (n: number | null | undefined, currency = "aud"): string =>
  n == null || !Number.isFinite(n)
    ? ""
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase() }).format(n)

export const longDate = (d: Date | string): string =>
  new Date(d).toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric", timeZone: "Australia/Sydney" })
