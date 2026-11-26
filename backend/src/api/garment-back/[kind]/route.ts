import path from "path"
import sharp from "sharp"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { isGarmentBackKind, parseGarmentHex, recolourShading } from "../../../lib/garment-back"

const ASSETS_DIR = path.join(__dirname, "../../../assets/garment-backs")
// ~60 garment/colour pairs ≈ a few MB of PNGs; the CDN/browser cache does the rest.
const cache = new Map<string, Buffer>()

/**
 * GET /garment-back/:kind?c=1f2a44 — generic back photo (tee, polo, crew,
 * hood, singlet, shirt, jacket) in a garment colour, transparent PNG, 4:5.
 * Public (no key): the Studio shows it in an <img> and the mockup renderer
 * fetches it. Output depends only on the URL, so it is cached for a year.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const kind = req.params.kind
  if (!isGarmentBackKind(kind)) {
    res.status(404).json({ message: "Unknown garment" })
    return
  }
  const rgb = parseGarmentHex(req.query.c)
  const key = `${kind}:${rgb.join(",")}`
  let png = cache.get(key)
  if (!png) {
    const { data, info } = await sharp(path.join(ASSETS_DIR, `${kind}.png`))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    png = await sharp(recolourShading(data, info.channels, rgb), {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png({ compressionLevel: 8 })
      .toBuffer()
    if (cache.size >= 60) cache.delete(cache.keys().next().value as string)
    cache.set(key, png)
  }
  res.setHeader("Content-Type", "image/png")
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.status(200).send(png)
}
