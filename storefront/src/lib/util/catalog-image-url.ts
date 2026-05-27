/**
 * Catalog image optimization helpers.
 *
 * Next.js 16 defaults `images.qualities` to `[75]` only — requests with other `q`
 * values return 400 INVALID_IMAGE_OPTIMIZE_REQUEST on Vercel. Listing cards use
 * `quality={50}` (declared in next.config.js `qualities`) and swatch backgrounds
 * use `q=75`.
 *
 * Optimization is ON by default everywhere. The previous Vercel-detection branch
 * was a Hobby-plan workaround for 402 responses from `/_next/image`; Vercel Pro
 * includes optimization and the workaround silently turned 12-card brand pages
 * into ~150 MB of raw supplier JPEGs (one full-res garment photo per swatch ×
 * up to 6 swatches × 12 cards). Set NEXT_PUBLIC_UNOPTIMIZED_IMAGES=true to opt
 * out for a quick fallback if the monthly optimization quota gets hit.
 */

export function catalogImagesUnoptimized(): boolean {
  return process.env.NEXT_PUBLIC_UNOPTIMIZED_IMAGES === "true"
}

/** Small swatch `background-image` URL for product listing cards. */
export function catalogSwatchBackgroundImageUrl(sourceUrl: string): string {
  if (catalogImagesUnoptimized()) {
    return sourceUrl
  }
  const encoded = encodeURIComponent(sourceUrl)
  return `/_next/image?url=${encoded}&w=80&q=75`
}
