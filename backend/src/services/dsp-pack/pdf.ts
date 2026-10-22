import fs from "fs"
import path from "path"
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib"
import sharp from "sharp"

import { dspDate, type DspGroupPack, type DspPage } from "../../lib/dsp-job"
import { inkClusters, type InkCluster } from "../../lib/dsp-inks"

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

async function fetchPng(url: string | null, trim = false): Promise<Buffer | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) })
    if (!res.ok) return null
    // Normalise anything (webp, svg, jpg) to a bounded PNG pdf-lib can embed.
    const src = Buffer.from(await res.arrayBuffer())
    const read = () => sharp(src, { density: 400 })
    // Artwork: drop transparent margins so it can be drawn at its true print size.
    const img = trim ? sharp(await read().trim().png().toBuffer().catch(() => read().png().toBuffer())) : read()
    return await img.resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).png().toBuffer()
  } catch {
    return null
  }
}

/** Ink colours in an artwork file (lib/dsp-inks inkClusters); null when sharp can't read it (PDF/AI). */
export async function artworkInks(buf: Buffer): Promise<InkCluster[] | null> {
  try {
    const data = await sharp(buf, { density: 150 }).resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer()
    return inkClusters(data)
  } catch {
    return null
  }
}

/**
 * The garment's colour, sampled off its mockup photo: the median of a patch
 * low on the body (x 45–55%, y 72–82%), clear of chest and back prints.
 * Null when the patch is transparent/white background or unreadable.
 * ponytail: tees and hoodies frame like this; caps/bags may hit background — falls back to the old band.
 */
export async function garmentColour(buf: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(buf).resize({ width: 200, height: 200, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const px: number[][] = []
    for (let y = Math.round(info.height * 0.72); y < info.height * 0.82; y++)
      for (let x = Math.round(info.width * 0.45); x < info.width * 0.55; x++) {
        const i = (y * info.width + x) * 4
        if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]])
      }
    if (px.length < 20) return null
    const med = [0, 1, 2].map((c) => px.map((p) => p[c]).sort((a, b) => a - b)[px.length >> 1])
    if (med.every((v) => v > 248)) return null // page background, not fabric
    return `#${med.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
  } catch {
    return null
  }
}

/** The artwork flattened onto the garment colour — white ink opens blank on a white previewer. */
export async function artworkPreview(buf: Buffer, garmentHex: string): Promise<Buffer | null> {
  try {
    return await sharp(buf, { density: 300 }).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).flatten({ background: garmentHex }).png().toBuffer()
  } catch {
    return null // PDFs/AI files sharp can't read — DSP opens those in Illustrator anyway
  }
}

/**
 * The artwork file sized to print: an SVG gets mm width/height (Illustrator
 * opens it at print size), a PNG/JPEG is trimmed and its DPI set so it
 * measures the print width. Anything else (PDF, AI) goes as-is.
 */
export async function artworkAtPrintSize(buf: Buffer, ext: string, printSize: { widthMm: number } | null): Promise<Buffer> {
  if (!printSize) return buf
  try {
    if (ext === "svg") {
      const svg = buf.toString("utf8")
      const open = svg.match(/<svg\b[^>]*>/i)?.[0]
      const vb = open?.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
      if (!open || !vb) return buf
      const h = (printSize.widthMm * Number(vb[2])) / Number(vb[1])
      const sized = open.replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, "").replace(/^<svg\b/i, `<svg width="${printSize.widthMm}mm" height="${h.toFixed(1)}mm"`)
      return Buffer.from(svg.replace(open, sized), "utf8")
    }
    if (ext === "png" || ext === "jpg" || ext === "jpeg") {
      const trimmed = await sharp(buf).trim().toBuffer({ resolveWithObject: true })
      const dpi = trimmed.info.width / (printSize.widthMm / 25.4)
      const out = sharp(trimmed.data).withMetadata({ density: Math.round(dpi * 100) / 100 })
      return await (ext === "png" ? out.png() : out.jpeg({ quality: 95 })).toBuffer()
    }
  } catch {
    /* fall through to the original file */
  }
  return buf
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

  // Artwork band (template: black, px y 212–775), filled with the garment colour
  // so DSP sees the ink on the fabric. No colour sampled → black/light by darkness.
  const band = { x: 0, y: Y(775), w: X(1222), h: Y(212) - Y(775) }
  const garment = pg.garmentHex ? [1, 3, 5].map((i) => Number.parseInt(pg.garmentHex!.slice(i, i + 2), 16) / 255) : null
  if (garment) page.drawRectangle({ x: band.x, y: band.y, width: band.w, height: band.h, color: rgb(garment[0], garment[1], garment[2]) })
  else if (!pg.dark) page.drawRectangle({ x: band.x, y: band.y, width: band.w, height: band.h, color: rgb(0.93, 0.93, 0.93) })
  const darkBand = garment ? 0.299 * garment[0] + 0.587 * garment[1] + 0.114 * garment[2] < 0.5 : pg.dark
  // At print size when it fits the band (page is 1 pt = 1/72", so 100% print = true mm), else scaled.
  const mm = (v: number) => (v * 72) / 25.4
  const actual = ctx.art && pg.printSize && mm(pg.printSize.widthMm) <= band.w - 20 && mm(pg.printSize.heightMm) <= band.h - 20
  if (ctx.art && actual) {
    const w = mm(pg.printSize!.widthMm)
    const h = (w * ctx.art.height) / ctx.art.width // the artwork's own proportions; width is the print spec
    drawFitted(page, ctx.art, { x: band.x + (band.w - w) / 2, y: band.y + (band.h - h) / 2, w, h })
  } else if (ctx.art) drawFitted(page, ctx.art, { x: band.x + 40, y: band.y + 30, w: band.w - 80, h: band.h - 60 })
  else text(page, "ARTWORK TO FOLLOW", X(420), Y(500), bold, 28, darkBand ? WHITE : BLACK)
  text(page, actual ? "ARTWORK SHOWN AT ACTUAL SIZE" : "SCALED TO FIT THIS PAGE.", X(actual ? 885 : 940), Y(806), bold, 10, RED)
  text(page, actual ? "WHEN THIS PAGE PRINTS AT 100%" : "PRINT WILL BE AS PER SIZE BELOW", X(actual ? 880 : 905), Y(826), bold, 10, RED)

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
  const image = (url: string | null, trim = false) => {
    if (!url) return Promise.resolve(null)
    const key = `${trim}:${url}`
    if (!cache.has(key)) cache.set(key, fetchPng(url, trim).then((b) => (b ? doc.embedPng(b) : null)))
    return cache.get(key)!
  }

  for (const pack of packs) {
    for (const pg of pack.pages) {
      const [page] = await doc.copyPages(template, [0])
      doc.addPage(page)
      stampPage(page, pg, { bold, reg, po: meta.po, customer: meta.customer, due, art: await image(pg.artworkUrl, true), garment: await image(pg.garmentImageUrl) })
    }
  }
  return Buffer.from(await doc.save())
}
