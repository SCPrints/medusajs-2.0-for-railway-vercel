/**
 * Samples the dominant non-background colour of an image URL by drawing it
 * into a tiny offscreen canvas and averaging the saturated pixels. Used to
 * tint the sleeve placeholder to the variant's garment colour without
 * maintaining a colour-name → hex lookup table.
 *
 * Returns `null` when the image fails to load (e.g. CORS-protected CDN that
 * doesn't serve `Access-Control-Allow-Origin: *`).
 */

const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0")

export async function sampleImageDominantColor(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  if (cache.has(url)) return cache.get(url) ?? null
  const existing = inflight.get(url)
  if (existing) return existing

  const promise: Promise<string | null> = new Promise<string | null>((resolve) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      resolve(null)
      return
    }
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i]
          const pg = data[i + 1]
          const pb = data[i + 2]
          const pa = data[i + 3]
          if (pa < 200) continue // skip transparent
          // Skip near-white background.
          if (pr > 235 && pg > 235 && pb > 235) continue
          // Skip near-black studio shadows that bias darks.
          if (pr < 12 && pg < 12 && pb < 12) continue
          r += pr
          g += pg
          b += pb
          n += 1
        }
        if (n === 0) {
          resolve(null)
          return
        }
        resolve(`#${toHex(r / n)}${toHex(g / n)}${toHex(b / n)}`)
      } catch {
        // Tainted canvas (CORS fallback) or any other read error.
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  }).then((hex) => {
    cache.set(url, hex)
    inflight.delete(url)
    return hex
  })

  inflight.set(url, promise)
  return promise
}
