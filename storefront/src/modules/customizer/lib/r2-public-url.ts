/**
 * Rewrite a PRIVATE Cloudflare R2 S3-endpoint URL to our PUBLIC bucket host.
 *
 * Some saved customizer designs stored their artwork `src` as the private S3
 * endpoint (`https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`). That
 * host requires AWS-signed auth, so an anonymous browser GET returns HTTP 400 —
 * Fabric can't load the image and the side renders blank (confirmed on order #4).
 * The SAME object is served publicly at `<publicBase>/<key>` (the bucket segment
 * is dropped) and returns 200. This normalizer swaps the host so saved artwork
 * actually loads on the canvas (and in the Save-Proof SVG).
 *
 * Public base resolution: env first, then the known public dev URL (the same
 * host hardcoded as a preconnect in app/layout.tsx) so the rewrite works even
 * when the env var isn't present (local dev / a Vercel project missing it).
 */
const PUBLIC_R2_BASE = (
  process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_MINIO_ENDPOINT ||
  "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev"
).replace(/\/+$/, "")

/**
 * Returns the public, browser-loadable form of an artwork URL. Already-public
 * URLs, supplier CDNs, `data:` URIs, and the `[omitted-image-data]` placeholder
 * pass through untouched — only the private R2 S3 endpoint is rewritten.
 */
export const toPublicArtworkUrl = (raw: string | null | undefined): string => {
  if (!raw || typeof raw !== "string") return raw ?? ""
  if (raw.startsWith("data:") || raw.includes("[omitted-image-data]")) return raw
  try {
    const u = new URL(raw)
    if (!u.hostname.toLowerCase().endsWith(".r2.cloudflarestorage.com")) return raw
    // pathname = /<bucket>/<key...> — drop the leading bucket segment.
    const segs = u.pathname.replace(/^\/+/, "").split("/")
    if (segs.length < 2) return raw
    const key = segs.slice(1).join("/")
    return `${PUBLIC_R2_BASE}/${key}${u.search}`
  } catch {
    return raw
  }
}

const isR2Host = (hostname: string) => {
  const h = hostname.toLowerCase()
  return h.endsWith(".r2.dev") || h.endsWith(".r2.cloudflarestorage.com")
}

/**
 * Fabric objects safe to draw on a canvas that is read back with `toDataURL`.
 *
 * The editor canvas loads hosted artwork WITHOUT crossOrigin on purpose (so
 * toSVG embeds the URL), and saved layouts keep that `crossOrigin: null`. R2's
 * public URL sends no `Access-Control-Allow-Origin`, so re-creating those
 * objects on another canvas taints it and `toDataURL` throws SecurityError
 * (the "Preview design" popover, Nov 2026). R2 srcs go through the same-origin
 * `/api/proxy-image`; every remote src asks for CORS. Groups are walked.
 */
export const toPixelSafeObjects = <T extends Record<string, unknown>>(objects: T[]): T[] =>
  objects.map((o) => {
    if (!o || typeof o !== "object") return o
    let next: Record<string, unknown> = o
    if (Array.isArray(o.objects)) {
      next = { ...next, objects: toPixelSafeObjects(o.objects as Record<string, unknown>[]) }
    }
    if (typeof o.src === "string" && /^https?:\/\//i.test(o.src)) {
      const src = toPublicArtworkUrl(o.src)
      let host = ""
      try {
        host = new URL(src).hostname
      } catch {
        // unparseable — leave the src alone
      }
      next = {
        ...next,
        src: isR2Host(host) ? `/api/proxy-image?url=${encodeURIComponent(src)}` : src,
        crossOrigin: "anonymous",
      }
    }
    return next as T
  })

/**
 * Map over a saved Fabric objects array, rewriting each image object's `src` to
 * its public form. Returns a new array (objects with a rewritten src are shallow
 * copied; others are passed through by reference).
 */
export const rewriteArtworkSrcs = <T extends { src?: unknown }>(objects: T[]): T[] =>
  objects.map((o) => {
    if (o && typeof (o as { src?: unknown }).src === "string") {
      const src = (o as { src: string }).src
      const next = toPublicArtworkUrl(src)
      if (next !== src) return { ...o, src: next }
    }
    return o
  })
