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

/** Tokens derived from a colour label for matching inside image URLs/filenames. */
export const buildColorNeedles = (colorValue: string): string[] => {
  const normalized = toTitleSlug(colorValue)
  if (!normalized) {
    return []
  }
  const words = normalized.split(" ").filter(Boolean)
  const compact = words.join("")
  const joinedWithDash = words.join("-")
  const joinedWithUnderscore = words.join("_")
  return Array.from(new Set([normalized, compact, joinedWithDash, joinedWithUnderscore, ...words]))
}

export const urlMatchesColorNeedles = (url: string, needles: string[]): boolean => {
  if (!needles.length) {
    return true
  }
  const normalizedUrl = toTitleSlug(url)
  return needles.some((needle) => normalizedUrl.includes(needle))
}

function variantIsPurchasable(variant: HttpTypes.StoreProductVariant): boolean {
  if (!variant.manage_inventory) {
    return true
  }
  if (variant.allow_backorder) {
    return true
  }
  return (variant.inventory_quantity ?? 0) > 0
}

/** True for plain "Black" or colours that start with "Black " (e.g. Black Marle). */
function isBlackGarmentColor(colorValue: string): boolean {
  const n = toTitleSlug(colorValue)
  if (!n) {
    return false
  }
  return n === "black" || n.startsWith("black ")
}

function pickDefinedStringOptions(
  map: Record<string, string | undefined>
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "string") {
      out[k] = v
    }
  }
  return out
}

/**
 * Initial option values for the PDP: full variant selection so the gallery can resolve one colour.
 * Prefers an in-stock Black garment when a Colour option exists; otherwise first purchasable variant.
 */
export function getDefaultProductOptions(
  product: HttpTypes.StoreProduct
): Record<string, string | undefined> {
  const variants = product.variants ?? []
  if (variants.length === 0) {
    return {}
  }

  if (variants.length === 1) {
    return pickDefinedStringOptions(optionsAsKeymap(variants[0].options ?? undefined))
  }

  const colorOption = product.options?.find((o) => /color|colour/i.test(o.title ?? ""))
  const colorTitle = colorOption?.title

  let chosen: HttpTypes.StoreProductVariant

  if (colorTitle) {
    const blackVariants = variants.filter((v) => {
      const c = getVariantOptionValue(v, colorTitle)
      return typeof c === "string" && isBlackGarmentColor(c)
    })
    chosen =
      blackVariants.find(variantIsPurchasable) ??
      blackVariants[0] ??
      variants.find(variantIsPurchasable) ??
      variants[0]
  } else {
    chosen = variants.find(variantIsPurchasable) ?? variants[0]
  }

  return pickDefinedStringOptions(optionsAsKeymap(chosen.options ?? undefined))
}

/** Match product option by title (slug-safe). */
export const findProductOptionByTitle = (
  product: HttpTypes.StoreProduct,
  optionTitle: string
) => {
  const want = toTitleSlug(optionTitle)
  return product.options?.find((o) => o.title && toTitleSlug(o.title) === want)
}
