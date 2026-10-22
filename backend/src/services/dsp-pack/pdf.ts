import fs from "fs"
import path from "path"
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib"
import sharp from "sharp"

import { dspDate, type DspGroupPack, type DspPage } from "../../lib/dsp-job"

/**
 * Stamps our job data onto DSP's own art-proof template
 * (assets/dsp/art-proof-template.pdf — their "J00000_ARTPROOF_ALL CUSTOMERS"),
 * one page per position, so their art team checks a proof instead of building
 * one. Their template stays the vector background, so the PDF still opens and
 * edits in Illustrator.
 *
 * Coordinates were measured off the template rendered 1222 px wide; `px()`
 * converts them to PDF points (page is 883 × 1249 pt, origin bottom-left).
 */

const TEMPLATE = path.join(__dirname, "../../assets/dsp/art-proof-template.pdf")
const PAGE_H = 1248.72
const K = 883.025 / 1222
const X = (px: number) => px * K
const Y = (px: number) => PAGE_H - px * K
const RED = rgb(0.89, 0.12, 0.13)
const BLACK = rgb(0.1, 0.1, 0.1)
const WHITE = rgb(1, 1, 1)

const IMAGE_TIMEOUT_MS = 12_000

/** pdf-lib's standard fonts are WinAnsi — drop anything they can't encode rather than throw. */
const safe = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/×/g, "x").replace(/[^\x20-\x7E -ÿ]/g, "")

async function fetchPng(url: string | null): Promise<Buffer | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) })
    if (!res.ok) return null
    // Normalise anything (webp, svg, jpg) to a bounded PNG pdf-lib can embed.
    return await sharp(Buffer.from(await res.arrayBuffer()), { density: 400 })
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer()
  } catch {
    return null
  }
}

function drawFitted(page: PDFPage, img: PDFImage, box: { x: number; y: number; w: number; h: number }) {
  const s = Math.min(box.w / img.width, box.h / img.height)
  const w = img.width * s
  const h = img.height * s
  page.drawImage(img, { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, width: w, height: h })
}

function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color = BLACK) {
  page.drawText(safe(s), { x, y, size, font, color })
}

function stampPage(page: PDFPage, pg: DspPage, ctx: { bold: PDFFont; reg: PDFFont; po: string; customer: string; due: string | null; art: PDFImage | null; garment: PDFImage | null }) {
  const { bold, reg } = ctx

  // Artwork band (template: black, px y 212–775). Light garments get a light band.
  const band = { x: 0, y: Y(775), w: X(1222), h: Y(212) - Y(775) }
  if (!pg.dark) page.drawRectangle({ ...band, color: rgb(0.93, 0.93, 0.93) })
  if (ctx.art) drawFitted(page, ctx.art, { x: band.x + 40, y: band.y + 30, w: band.w - 80, h: band.h - 60 })
  else text(page, "ARTWORK TO FOLLOW", X(420), Y(500), bold, 28, pg.dark ? WHITE : BLACK)
  text(page, "SCALED TO FIT THIS PAGE.", X(940), Y(806), bold, 10, RED)
  text(page, "PRINT WILL BE AS PER SIZE BELOW", X(905), Y(826), bold, 10, RED)

  // Position heading + garment view.
  text(page, pg.positionLabel.toUpperCase(), X(10), Y(828), bold, 26, RED)
  if (ctx.garment) drawFitted(page, ctx.garment, { x: X(8), y: Y(1245), w: X(470), h: Y(850) - Y(1245) })

  // Size breakdown column (px x 500, y 860 → 1260), shrinks to fit.
  const lines = pg.sizeLines
  const avail = Y(860) - Y(1265)
  const lh = Math.min(24, avail / Math.max(1, lines.length))
  lines.forEach((l, i) => text(page, l, X(500), Y(860) - lh * (i + 1) + lh * 0.2, bold, lh * 0.95, RED))

  // Tick-box panel (px x 655–1205, y 1000–1375).
  const rows: Array<[string, string, boolean?]> = [
    ...pg.colourLines.map((l, i) => [i === 0 ? "COLOURS:" : "", l, true] as [string, string, boolean]),
    ["QTY:", String(pg.qty)],
    ...(pg.screens != null ? [["SCREENS:", `${pg.screens} SCREEN/S`] as [string, string]] : []),
    ["POSITION:", `${pg.n}/${pg.of} ${pg.positionLabel.toUpperCase()}`, true],
    ["", "- SEE DIAGRAM"],
    ["CODE/PROD:", pg.codeProd, true],
    ["PRINT SIZE:", pg.printSize ? `${pg.printSize.widthMm}mm WIDE` : "TBC", true],
    ["", pg.printSize ? `${pg.printSize.heightMm}mm HIGH` : ""],
  ]
  const top = Y(1030)
  const step = Math.min(X(33), (top - Y(1372)) / rows.length)
  rows.forEach(([label, value, emphasise], i) => {
    const y = top - step * (i + 1) + step * 0.25
    if (label) text(page, label, X(690), y, bold, 10, label === "POSITION:" || label === "CODE/PROD:" || label === "PRINT SIZE:" ? RED : BLACK)
    const font = emphasise ? bold : reg
    const maxW = X(1130) - X(790)
    let size = Math.min(emphasise ? 14 : 11, step * 0.75)
    // Shrink long values (garment names) to fit before resorting to "...".
    while (size > 8 && font.widthOfTextAtSize(safe(value), size) > maxW) size -= 0.5
    let v = safe(value)
    while (v.length > 4 && font.widthOfTextAtSize(v, size) > maxW) v = v.slice(0, -2)
    text(page, v === safe(value) ? v : `${v}...`, X(790), y, font, size, label === "POSITION:" ? RED : BLACK)
    if (value) page.drawRectangle({ x: X(1140), y: y - 2, width: X(20), height: X(20), borderColor: BLACK, borderWidth: 1 })
  })

  // Job ref line (template prints "DSP#J00000_CUSTOMER" at px 19,1362 — cover it).
  page.drawRectangle({ x: X(15), y: Y(1376), width: X(625), height: X(30), color: WHITE })
  text(page, `DSP#J______ SC PRINTS #${ctx.po}`, X(19), Y(1370), bold, 14)

  // Office use: special instructions, CPO, PPD (cover the template's "# 00000" / "00/0").
  if (pg.repeatJob) text(page, `REPEAT ${pg.repeatJob.toUpperCase()}`, X(270), Y(1585), bold, 30, RED)
  page.drawRectangle({ x: X(1040), y: Y(1559), width: X(160), height: X(34), color: WHITE })
  text(page, `# ${ctx.po}`, X(1046), Y(1549), reg, 12)
  page.drawRectangle({ x: X(1090), y: Y(1595), width: X(110), height: X(29), color: WHITE })
  if (ctx.due) text(page, ctx.due.slice(0, 5), X(1108), Y(1588), bold, 12)
}

export async function buildDspProofPdf(packs: DspGroupPack[], meta: { po: string; customer: string; dueDate: string | null }): Promise<Buffer> {
  const template = await PDFDocument.load(fs.readFileSync(TEMPLATE))
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const due = dspDate(meta.dueDate)

  // Each image once, however many pages reuse it.
  const cache = new Map<string, Promise<PDFImage | null>>()
  const image = (url: string | null) => {
    if (!url) return Promise.resolve(null)
    if (!cache.has(url)) cache.set(url, fetchPng(url).then((b) => (b ? doc.embedPng(b) : null)))
    return cache.get(url)!
  }

  for (const pack of packs) {
    for (const pg of pack.pages) {
      const [page] = await doc.copyPages(template, [0])
      doc.addPage(page)
      stampPage(page, pg, { bold, reg, po: meta.po, customer: meta.customer, due, art: await image(pg.artworkUrl), garment: await image(pg.garmentImageUrl) })
    }
  }
  return Buffer.from(await doc.save())
}
