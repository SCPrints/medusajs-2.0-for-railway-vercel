/**
 * Medusa `render-print` / `render-mockup` validate `garmentImageUrl` with `z.string().url()` and fetch it server-side.
 * Next.js public files (e.g. sleeve placeholders under `public/placeholders/...`) are served as root-relative paths
 * and must be turned into absolute HTTP(S) URLs before calling the API.
 */
export function resolveGarmentImageUrlForCustomizerRender(
  mockupGarmentUrl: string | null | undefined,
  defaultGarmentImage: string | null | undefined
): string | null {
  const raw =
    (typeof mockupGarmentUrl === "string" && mockupGarmentUrl.trim()
      ? mockupGarmentUrl.trim()
      : null) ??
    (typeof defaultGarmentImage === "string" && defaultGarmentImage.trim()
      ? defaultGarmentImage.trim()
      : null)

  if (!raw) {
    return null
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw
  }

  if (raw.startsWith("//")) {
    return `https:${raw}`
  }

  if (raw.startsWith("/")) {
    if (typeof window === "undefined") {
      return null
    }
    return `${window.location.origin}${raw}`
  }

  return raw
}
