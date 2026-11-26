/**
 * Generic garment BACK photos for the Studio, used when a supplier has no back
 * photo for a colour (Legend Life has none; some DNC / Aussie Pacific lines).
 *
 * Source: white AS Colour back flat-lays, cut out and stored as greyscale
 * "shading" maps (L + alpha, 4:5, fabric tone normalised to 0.94) in
 * src/assets/garment-backs/. `recolourShading` paints a garment colour in:
 * light colours multiply into the shading; dark colours add it back as
 * light/dark so folds stay visible on black and navy.
 */

export const GARMENT_BACK_KINDS = ["tee", "polo", "crew", "hood", "singlet", "shirt", "jacket"] as const
export type GarmentBackKind = (typeof GARMENT_BACK_KINDS)[number]

export const isGarmentBackKind = (v: unknown): v is GarmentBackKind =>
  typeof v === "string" && (GARMENT_BACK_KINDS as readonly string[]).includes(v)

/** "1f2a44" / "#1F2A44" → [r, g, b]; anything else → near-white. */
export function parseGarmentHex(raw: unknown): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(raw ?? "").trim())
  if (!m) return [244, 244, 244]
  const v = Number.parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/**
 * `px` is raw pixels with `channels` per pixel (grey in the first, alpha in the
 * last — sharp hands the grey+alpha PNG back as RGBA); returns RGBA.
 * Fabric at tone 0.94 comes out exactly the requested colour.
 */
export function recolourShading(px: Uint8Array, channels: number, rgb: [number, number, number]): Buffer {
  const [r, g, b] = rgb
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const w = Math.min(1, Math.max(0, (lum - 0.15) / 0.35)) // 0 = dark colour, 1 = light
  const out = Buffer.alloc((px.length / channels) * 4)
  for (let i = 0, o = 0; i < px.length; i += channels, o += 4) {
    const s = px[i] / 255 / 0.94
    const add = (s - 1) * 255 * 0.55
    out[o] = clamp(r * s * w + (r + add) * (1 - w))
    out[o + 1] = clamp(g * s * w + (g + add) * (1 - w))
    out[o + 2] = clamp(b * s * w + (b + add) * (1 - w))
    out[o + 3] = channels === 2 || channels === 4 ? px[i + channels - 1] : 255
  }
  return out
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))
