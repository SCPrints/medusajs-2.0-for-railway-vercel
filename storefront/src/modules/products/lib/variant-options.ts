import type { HttpTypes } from "@medusajs/types"

/** Normalizes option titles and colour labels for stable matching across UI and API. */
export const toTitleSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

export const normalizeImageUrl = (url: string) => url.split("?")[0].trim()

export const optionsAsKeymap = (variantOptions: unknown[] | undefined) => {
  return (variantOptions ?? []).reduce(
    (acc: Record<string, string | undefined>, varopt: any) => {
      if (varopt.option?.title && varopt.value !== null && varopt.value !== undefined) {
        acc[varopt.option.title] = varopt.value
      }
      return acc
    },
    {}
  )
}

export const getVariantOptionValue = (
  variant: HttpTypes.StoreProductVariant,
  optionTitle: string
) => {
  const normalizedTitle = toTitleSlug(optionTitle)

  return (
    (variant.options ?? []).find((variantOption: any) => {
      const title = variantOption?.option?.title
      return typeof title === "string" && toTitleSlug(title) === normalizedTitle
    })?.value ?? undefined
  )
}

const parseGarmentImagesObject = (garmentImages: unknown): { front?: string; urls: string[] } => {
  if (!garmentImages) {
    return { urls: [] }
  }

  if (typeof garmentImages === "string") {
    try {
      const parsed = JSON.parse(garmentImages) as Record<string, unknown>
      const all = Array.isArray(parsed.all) ? parsed.all : []
      const raw = [parsed.front, parsed.back, ...all].filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
      return {
        front: typeof parsed.front === "string" && parsed.front.length ? parsed.front : undefined,
        urls: dedupeImageUrls(raw),
      }
    } catch {
      return { urls: [] }
    }
  }

  if (typeof garmentImages !== "object" || garmentImages === null) {
    return { urls: [] }
  }

  const obj = garmentImages as Record<string, unknown>
  const all = Array.isArray(obj.all) ? obj.all : []
  const raw = [obj.front, obj.back, ...all].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  )

  return {
    front: typeof obj.front === "string" && obj.front.length ? obj.front : undefined,
    urls: dedupeImageUrls(raw),
  }
}

function dedupeImageUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    const key = normalizeImageUrl(url)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(url)
  }
  return out
}

/** All garment image URLs for gallery (front, back, unique extras). */
export const getGarmentImageUrlsFromMetadata = (
  metadata: Record<string, unknown> | undefined
): string[] => {
  const garmentImages = metadata?.garment_images
  const { urls } = parseGarmentImagesObject(garmentImages)
  return urls
}

/** Single URL for swatches: prefer explicit front, else first gallery URL. */
export const getGarmentSwatchImageUrlFromMetadata = (
  metadata: Record<string, unknown> | undefined
): string | undefined => {
  const garmentImages = metadata?.garment_images
  const { front, urls } = parseGarmentImagesObject(garmentImages)
  if (front) {
    return front
  }
  return urls[0]
}

export const findProductImageByUrl = (
  url: string,
  validImages: Array<{ id: string; url: string }>
): { id: string; url: string } | undefined => {
  const target = normalizeImageUrl(url)
  return validImages.find(
    (image) => image.url === url || normalizeImageUrl(image.url) === target
  )
}

/** Match product option by title (slug-safe). */
export const findProductOptionByTitle = (
  product: HttpTypes.StoreProduct,
  optionTitle: string
) => {
  const want = toTitleSlug(optionTitle)
  return product.options?.find((o) => o.title && toTitleSlug(o.title) === want)
}
