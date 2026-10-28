#!/usr/bin/env node
/**
 * Turns real order designs (pulled read-only from prod, kept OUT of the repo)
 * into public test fixtures that keep only geometry: the repo is public, so
 * no customer artwork, text, filenames, links or notes survive.
 *
 *   node e2e-studio/tools/anonymise-past-designs.mjs <raw.json> > e2e-studio/fixtures/past-designs.json
 *
 * raw.json = [{ id, created_at, handle, key, design: CustomizerMetadata }]
 *   - images  → `fixture:<w>x<h>` (the test draws a solid block that size)
 *   - text    → "SAMPLE"
 *   - vector groups / paths → one rectangle with the same bounding box
 */
import { readFileSync } from "node:fs"

const raw = JSON.parse(readFileSync(process.argv[2], "utf8"))
const ART = "#e11d48"

const scrubStrings = (value) => {
  if (typeof value === "string") return /https?:|data:|@/.test(value) ? "fixture-removed" : value
  if (Array.isArray(value)) return value.map(scrubStrings)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubStrings(v)]))
  return value
}

const anonymiseObject = (o, n) => {
  const out = { ...o }
  out.customizerLabel = `Artwork ${n}`
  if (out.customizerUploadId) out.customizerUploadId = `fixture-upload-${n}`
  if (out.customizerId) out.customizerId = `fixture-object-${n}`
  const t = String(o.type).toLowerCase()
  if (t === "image") {
    out.src = `fixture:${Math.round(o.width)}x${Math.round(o.height)}`
  } else if (t === "itext" || t === "i-text" || t === "text" || t === "textbox") {
    out.text = "SAMPLE"
    out.styles = Array.isArray(o.styles) ? [] : {}
    out.fill = ART
  } else if (t === "group") {
    const w = o.width
    const h = o.height
    out.objects = [{ type: "Rect", version: o.version, left: -w / 2, top: -h / 2, width: w, height: h, fill: ART, originX: "left", originY: "top" }]
  } else if (t === "path") {
    const cx = o.pathOffset?.x ?? o.width / 2
    const cy = o.pathOffset?.y ?? o.height / 2
    const [x0, y0, x1, y1] = [cx - o.width / 2, cy - o.height / 2, cx + o.width / 2, cy + o.height / 2]
    out.path = [["M", x0, y0], ["L", x1, y0], ["L", x1, y1], ["L", x0, y1], ["Z"]]
    out.fill = ART
  }
  return scrubStrings(out)
}

let n = 0
const fixtures = raw.map((row, i) => {
  const d = row.design
  return {
    name: `past-design-${String(i + 1).padStart(2, "0")} ${row.key}`,
    savedOn: String(row.created_at).slice(0, 10),
    design: {
      version: d.version,
      type: d.type,
      activeSide: d.activeSide,
      printArea: d.printArea,
      scpPrintSizeId: d.scpPrintSizeId,
      sizes: d.sizes,
      sideDecorationMethods: d.sideDecorationMethods,
      artifacts: (d.artifacts ?? []).map((a) => ({ side: a.side, printUrl: null, mockupUrl: null })),
      sideLayouts: d.sideLayouts.map((s) => ({ side: s.side, objects: (s.objects ?? []).map((o) => anonymiseObject(o, ++n)) })),
    },
  }
})

process.stdout.write(JSON.stringify(fixtures, null, 1) + "\n")
