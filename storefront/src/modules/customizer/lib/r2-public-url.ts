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
