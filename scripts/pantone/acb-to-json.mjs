// Adobe colour book (.acb) → JSON with sRGB hex. Same byte layout the Illustrator
// colour-swatch-book.jsx reads, done in Node so the storefront chart is built from the
// real book instead of hand-typed values.
//
//   node scripts/pantone/acb-to-json.mjs "<file.acb>" [...more.acb] > out.json
//
// Output: [{ name, lab: [L, a, b], hex }]. Lab in Adobe books is D50; converted via
// Bradford to D65 then to sRGB, clipped. Illustrator 2023+ dropped the Pantone books —
// an older install's still work: /Applications/Adobe Illustrator 2020/Presets.localized/en_US/Swatches/Color Books/
import { readFileSync } from "node:fs"

export function readAcb(buf) {
  if (buf.toString("latin1", 0, 4) !== "8BCB") throw new Error("not an .acb")
  let o = 4
  const u16 = () => { const n = buf.readUInt16BE(o); o += 2; return n }
  const str = () => {
    const n = u16() * 65536 + u16()
    let s = ""
    for (let i = 0; i < n; i++) s += String.fromCharCode(u16())
    return s.replace(/^"?\$\$\$\/[^=]*=/, "").replace(/\^[RC]/g, "")
  }
  u16(); u16()
  const title = str(), prefix = str(), postfix = str()
  str()
  const count = u16()
  u16(); u16()
  const kind = u16() // 0 RGB, 2 CMYK, 7 Lab
  const seen = new Set(), out = []
  for (let i = 0; i < count && o < buf.length; i++) {
    const name = str()
    o += 6
    const n = kind === 2 ? 4 : 3
    const c = [...buf.subarray(o, o + n)]
    o += n
    if (!name || seen.has(name)) continue // base inks are listed twice
    seen.add(name)
    let rgb, lab
    if (kind === 7) { lab = [c[0] / 2.55, c[1] - 128, c[2] - 128]; rgb = labToRgb(lab) }
    else if (kind === 0) rgb = c
    else rgb = [255 - c[0], 255 - c[1], 255 - c[2]].map((v) => Math.round(v * (c[3] / 255))) // crude, CMYK books unused here
    const full = `${prefix}${name}${postfix}`.replace(/\s+/g, " ").trim()
    out.push({ name: full, lab: lab?.map((v) => +v.toFixed(1)), hex: "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase() })
  }
  return { title, colours: out }
}

// Lab (D50) → XYZ → Bradford to D65 → linear sRGB → gamma, clipped to gamut.
export function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const inv = (t) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29))
  const X = 0.9642 * inv(fx), Y = 1.0 * inv(fy), Z = 0.8251 * inv(fz)
  const X2 = 0.9555766 * X - 0.0230393 * Y + 0.0631636 * Z
  const Y2 = -0.0282895 * X + 1.0099416 * Y + 0.0210077 * Z
  const Z2 = 0.0122982 * X - 0.020483 * Y + 1.3299098 * Z
  const lin = [
    3.2404542 * X2 - 1.5371385 * Y2 - 0.4985314 * Z2,
    -0.969266 * X2 + 1.8760108 * Y2 + 0.041556 * Z2,
    0.0556434 * X2 - 0.2040259 * Y2 + 1.0572252 * Z2,
  ]
  return lin.map((v) => {
    const c = Math.min(1, Math.max(0, v))
    const g = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.round(g * 255)
  })
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const all = process.argv.slice(2).flatMap((f) => readAcb(readFileSync(f)).colours)
  process.stdout.write(JSON.stringify(all, null, 1) + "\n")
}
