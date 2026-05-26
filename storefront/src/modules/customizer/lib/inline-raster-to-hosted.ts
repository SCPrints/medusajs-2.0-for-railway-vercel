/**
 * Fabric.js `staticCanvas.toSVG()` re-embeds every raster object as an inline
 * `data:image/...;base64,...` href. For multi-MB customer uploads this bloats
 * the SVG past Vercel's serverless body limit (~4.5 MB on Hobby), so the
 * render-print / render-mockup proxy returns 413 before reaching Fly. We
 * already store the original raster on R2 (see upload-customer-original.ts);
 * this helper swaps every inline data URL in the SVG for its hosted
 * counterpart. The result is typically <100 KB and the render payload stays
 * comfortably under every limit in the chain.
 *
 * Strategy:
 *   1. Build a `data: → hosted` map from `sessionUploads` (already populated
 *      when the customer picked the file).
 *   2. For any data URL with no mapping (re-orders, pasted images, etc.),
 *      upload it on the fly via the existing helper.
 *   3. If the upload fails, leave the data URL in place — same behaviour as
 *      today (the request will still fail at the render endpoint with a clear
 *      error, but we won't have made anything worse).
 */
import { uploadCustomerOriginalUnchanged } from "./upload-customer-original"

const DATA_URL_PATTERN = /(xlink:href|href)="(data:image\/[a-zA-Z0-9.+-]+;base64,[^"]+)"/g

type Mime = "image/png" | "image/jpeg" | "image/svg+xml"

function mimeFromDataUrl(dataUrl: string): Mime {
  const head = dataUrl.slice(0, 40).toLowerCase()
  if (head.startsWith("data:image/jpeg") || head.startsWith("data:image/jpg")) {
    return "image/jpeg"
  }
  if (head.startsWith("data:image/svg")) {
    return "image/svg+xml"
  }
  return "image/png"
}

function dataUrlToFile(dataUrl: string, name: string): File | null {
  const commaIdx = dataUrl.indexOf(",")
  if (commaIdx < 0) {
    return null
  }
  const base64 = dataUrl.slice(commaIdx + 1)
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new File([bytes], name, { type: mimeFromDataUrl(dataUrl) })
  } catch {
    return null
  }
}

/**
 * Rewrite every inline raster href in `svg` to a hosted R2 URL.
 *
 * `knownHostedByDataUrl` is the dataUrl→hosted map you've already collected
 * from sessionUploads. Anything not in the map gets uploaded on the fly.
 */
export async function replaceInlineRasterWithHostedUrls(
  svg: string,
  knownHostedByDataUrl: Record<string, string>
): Promise<string> {
  if (!svg.includes("data:image/")) {
    return svg
  }

  // Collect unique data URLs first so we don't kick off N parallel uploads
  // for N references to the same image.
  const uniqueDataUrls: string[] = []
  const seen = new Set<string>()
  DATA_URL_PATTERN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DATA_URL_PATTERN.exec(svg)) !== null) {
    const dataUrl = m[2]
    if (!seen.has(dataUrl)) {
      seen.add(dataUrl)
      uniqueDataUrls.push(dataUrl)
    }
  }

  const resolved: Record<string, string> = {}
  for (let i = 0; i < uniqueDataUrls.length; i++) {
    const dataUrl = uniqueDataUrls[i]
    const known = knownHostedByDataUrl[dataUrl]
    if (known) {
      resolved[dataUrl] = known
      continue
    }
    const file = dataUrlToFile(dataUrl, `inline_${Date.now()}_${i}`)
    if (!file) {
      continue
    }
    const hosted = await uploadCustomerOriginalUnchanged(file)
    if (hosted) {
      resolved[dataUrl] = hosted
    }
  }

  if (Object.keys(resolved).length === 0) {
    return svg
  }

  return svg.replace(DATA_URL_PATTERN, (whole, attr: string, dataUrl: string) => {
    const hosted = resolved[dataUrl]
    return hosted ? `${attr}="${hosted}"` : whole
  })
}
