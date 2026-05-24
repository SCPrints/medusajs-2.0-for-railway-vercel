/**
 * Merges AS Colour ProductImage-V1.csv (styleCode + colour description → URLs) into a Medusa
 * products-import-template CSV by matching Product Handle (as-colour-{style}) and the variant
 * **colour** value (Variant Option 1 when that option is Colour, else Variant Option 2 for Size × Colour).
 *
 * Image 1: url_standard for (styleCode, Colour)
 * Image 2: url_standard for (styleCode, "{Colour} - BACK") when present
 *
 * Rows without a match leave existing Product Image 1/2 Url cells unchanged.
 *
 * Usage:
 *   node -r ts-node/register/transpile-only ./src/scripts/merge-ascolour-variant-images-into-template.ts \
 *     --images "/path/to/ProductImage-V1.csv" \
 *     --template "/path/to/products-import-template.csv" \
 *     --out "/path/to/output.csv"
 */

import * as fs from "fs"
import * as path from "path"

import { resolveVariantColourFromCsvRow } from "../admin/lib/as-colour-csv-variant-colour"
import { parseCsv, parseCsvLine, splitCsvRecords } from "../admin/lib/csv-import"

function escapeCsvCell(val: string): string {
  if (/[",\r\n]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

function normalizeKeyPart(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase()
}

function parseArgs(argv: string[]): { images: string; template: string; out: string } {
  let images = ""
  let template = ""
  let out = ""
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--images") {
      images = argv[++i] ?? ""
    } else if (a === "--template") {
      template = argv[++i] ?? ""
    } else if (a === "--out") {
      out = argv[++i] ?? ""
    }
  }
  if (!images || !template || !out) {
    console.error(
      "Usage: ... --images <ProductImage-V1.csv> --template <products-import-template.csv> --out <output.csv>"
    )
    process.exit(1)
  }
  return { images, template, out }
}

function extractStyleFromHandle(handle: string): string | undefined {
  const m = handle.trim().toLowerCase().match(/^as-colour-(.+)$/i)
  return m?.[1]?.trim() ? m[1].trim().toUpperCase() : undefined
}

type UrlPick = { url: string; sort: number }

function main(): void {
  const { images: imagesPath, template: templatePath, out: outPath } = parseArgs(process.argv)

  const imgText = fs.readFileSync(imagesPath, "utf8")
  const imgParsed = parseCsv(imgText)
  if (!imgParsed.headers.includes("stylecode") || !imgParsed.headers.includes("description")) {
    throw new Error(`Images CSV missing styleCode or description column. Got: ${imgParsed.headers.slice(0, 15).join(", ")}`)
  }
  if (!imgParsed.headers.includes("url_standard")) {
    throw new Error("Images CSV missing url_standard column.")
  }

  /** Composite key: STYLE|DESCRIPTION (normalized) → best URL by sort_order */
  const urlByKey = new Map<string, UrlPick>()
  for (const row of imgParsed.rows) {
    const style = normalizeKeyPart(row["stylecode"] ?? "")
    const desc = normalizeKeyPart(row["description"] ?? "")
    const url = (row["url_standard"] ?? "").trim()
    if (!style || !desc || !url) {
      continue
    }
    const key = `${style}|${desc}`
    const sortRaw = (row["sort_order"] ?? "").trim()
    const sort = parseInt(sortRaw, 10)
    const sortOrder = Number.isFinite(sort) ? sort : 0
    const prev = urlByKey.get(key)
    if (!prev || sortOrder < prev.sort) {
      urlByKey.set(key, { url, sort: sortOrder })
    }
  }

  console.error(`Loaded ${urlByKey.size} unique style|description image URLs from ${path.basename(imagesPath)}`)

  const tplText = fs.readFileSync(templatePath, "utf8")
  const tplParsed = parseCsv(tplText)
  if (!tplParsed.headers.includes("product handle")) {
    throw new Error("Template CSV missing Product Handle column.")
  }
  if (!tplParsed.headers.includes("variant option 1 value")) {
    throw new Error("Template CSV missing Variant Option 1 Value column.")
  }
  const i1 = tplParsed.headers.indexOf("product image 1 url")
  const i2 = tplParsed.headers.indexOf("product image 2 url")
  if (i1 < 0 || i2 < 0) {
    throw new Error("Template CSV missing Product Image 1 Url / Product Image 2 Url columns.")
  }

  let matched1 = 0
  let matched2 = 0
  let skippedNoStyle = 0
  let skippedNoColour = 0

  const outLines: string[] = []
  const rawRecords = splitCsvRecords(tplText.replace(/^\ufeff/, ""))
  if (!rawRecords.length) {
    throw new Error("Template is empty.")
  }
  const headerCells = parseCsvLine(rawRecords[0].replace(/^\ufeff/, ""))

  const headerLower = headerCells.map((h) => h.trim().toLowerCase())
  const idxHandle = headerLower.indexOf("product handle")
  const idxImg1 = headerLower.indexOf("product image 1 url")
  const idxImg2 = headerLower.indexOf("product image 2 url")

  outLines.push(headerCells.map(escapeCsvCell).join(","))

  for (let r = 1; r < rawRecords.length; r++) {
    const cells = parseCsvLine(rawRecords[r])
    while (cells.length < headerCells.length) {
      cells.push("")
    }

    const handle = (cells[idxHandle] ?? "").trim()
    const rowObj: Record<string, string> = {}
    for (let i = 0; i < headerLower.length; i++) {
      rowObj[headerLower[i]] = cells[i] ?? ""
    }
    const colour = resolveVariantColourFromCsvRow(rowObj)
    const style = extractStyleFromHandle(handle)

    if (!style) {
      skippedNoStyle++
      outLines.push(cells.map(escapeCsvCell).join(","))
      continue
    }
    if (!colour?.trim()) {
      skippedNoColour++
      outLines.push(cells.map(escapeCsvCell).join(","))
      continue
    }

    const colourNorm = normalizeKeyPart(colour)
    const keyFront = `${style}|${colourNorm}`
    const keyBack = `${style}|${colourNorm} - BACK`

    const front = urlByKey.get(keyFront)?.url
    const back = urlByKey.get(keyBack)?.url

    if (front) {
      cells[idxImg1] = front
      matched1++
    }
    if (back) {
      cells[idxImg2] = back
      matched2++
    }

    outLines.push(cells.map(escapeCsvCell).join(","))
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, outLines.join("\n") + "\n", "utf8")

  console.error(`Wrote ${outPath}`)
  console.error(
    `Updated Product Image 1 Url on ${matched1} rows (had a colour match); Image 2 on ${matched2} rows (had \"COLOUR - BACK\" match).`
  )
  console.error(
    `Skipped ${skippedNoStyle} rows (handle not as-colour-*), ${skippedNoColour} rows (no Variant Option 1 Value).`
  )
}

main()
