import type { HttpTypes } from "@medusajs/types"
import { isEqual } from "lodash"

/** Same values as customizer `GarmentSide`; kept local to avoid importing customizer from product lib. */
type PrintGarmentSide = "front" | "back" | "left_sleeve" | "right_sleeve"

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

const parseGarmentImagesObject = (
  garmentImages: unknown
): { front?: string; back?: string; urls: string[] } => {
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
        back: typeof parsed.back === "string" && parsed.back.length ? parsed.back : undefined,
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
    back: typeof obj.back === "string" && obj.back.length ? obj.back : undefined,
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

/**
 * Stricter than {@link urlMatchesColorNeedles}: for multi-word colours, every significant word
 * must appear in the URL/filename. Prevents e.g. "Marle" alone matching both "White Marle" and "Grey Marle".
 */
export const urlMatchesColorLabelStrict = (url: string, colorLabel: string): boolean => {
  const normalizedUrl = toTitleSlug(url).replace(/\s/g, "")
  const slug = toTitleSlug(colorLabel)
  if (!slug) {
    return true
  }

  const compact = slug.replace(/\s/g, "")
  if (compact && normalizedUrl.includes(compact)) {
    return true
  }

  const words = slug.split(/\s+/).filter((w) => w.length >= 2)
  if (words.length >= 2) {
    return words.every((w) => normalizedUrl.includes(w))
  }

  if (words.length === 1) {
    return normalizedUrl.includes(words[0])
  }

  return Boolean(compact && normalizedUrl.includes(compact))
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
 * Single source of truth for PDP: which Medusa variant matches the current option selection
 * (ProductActions, ImageGallery, EmbeddedProductCustomizer).
 */
export function resolveVariantFromOptions(
  product: HttpTypes.StoreProduct,
  options: Record<string, string | undefined>
): HttpTypes.StoreProductVariant | undefined {
  const variants = product.variants ?? []
  if (!variants.length) {
    return undefined
  }

  const exact = variants.find((v) => isEqual(optionsAsKeymap(v.options), options))
  if (exact) {
    return exact
  }

  const selectedEntries = Object.entries(options).filter(
    (e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0
  )

  if (!selectedEntries.length) {
    return variants[0]
  }

  const partial = variants.find((v) => {
    const vo = optionsAsKeymap(v.options)
    return selectedEntries.every(([title, value]) => value === vo[title])
  })
  if (partial) {
    return partial
  }

  const colorOption = product.options?.find((o) => /color|colour/i.test(o.title ?? ""))
  const colorTitle = colorOption?.title
  const selectedColor =
    typeof colorTitle === "string" ? options[colorTitle] : undefined
  const sizeOption = product.options?.find(
    (o) => /size/i.test(o.title ?? "") && !/color|colour/i.test(o.title ?? "")
  )
  const sizeTitle = sizeOption?.title
  const selectedSize =
    typeof sizeTitle === "string" ? options[sizeTitle] : undefined

  let pool = variants
  if (typeof selectedColor === "string" && colorTitle) {
    const want = toTitleSlug(selectedColor)
    const colorFiltered = variants.filter((v) => {
      const val = getVariantOptionValue(v, colorTitle)
      return typeof val === "string" && toTitleSlug(val) === want
    })
    if (colorFiltered.length) {
      pool = colorFiltered
    }
  }

  if (typeof selectedSize === "string" && sizeTitle) {
    const wantSize = toTitleSlug(selectedSize)
    const sizeMatch = pool.find((v) => {
      const val = getVariantOptionValue(v, sizeTitle)
      return typeof val === "string" && toTitleSlug(val) === wantSize
    })
    if (sizeMatch) {
      return sizeMatch
    }
  }

  return pool.find(variantIsPurchasable) ?? pool[0]
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

const COLOR_OPTION_MATCHER = /(color|colour)/i

/**
 * Primary garment mockup URL for the selected variant — same resolution rules as the PDP
 * image gallery (variant `garment_images` metadata, then colour-matched product images).
 */
export function getPrimaryGarmentImageUrl(
  product: HttpTypes.StoreProduct | undefined,
  variant: HttpTypes.StoreProductVariant | undefined
): string | null {
  if (!product) {
    return null
  }
  if (!variant) {
    return product.thumbnail ?? product.images?.find((i) => i.url)?.url ?? null
  }

  const validImages = (product.images ?? [])
    .filter((image) => Boolean(image.url))
    .map((image) => ({
      id: image.id,
      url: image.url as string,
    }))

  const colorOption = product.options?.find((o) => COLOR_OPTION_MATCHER.test(o.title ?? ""))
  const colorTitle = colorOption?.title
  const selectedColor = colorTitle ? getVariantOptionValue(variant, colorTitle) : undefined

  let mappedVariantImages = getGarmentImageUrlsFromMetadata(
    (variant.metadata ?? {}) as Record<string, unknown>
  )

  if (selectedColor && mappedVariantImages.length) {
    mappedVariantImages = mappedVariantImages.filter((url) =>
      urlMatchesColorLabelStrict(url, selectedColor)
    )
  }

  if (mappedVariantImages.length) {
    const firstUrl = mappedVariantImages[0]
    const fromProduct = findProductImageByUrl(firstUrl, validImages)
    return fromProduct?.url ?? firstUrl
  }

  if (!selectedColor || validImages.length <= 1) {
    return validImages[0]?.url ?? product.thumbnail ?? null
  }

  const matched = validImages.filter((image) =>
    urlMatchesColorLabelStrict(image.url, selectedColor)
  )

  if (matched.length) {
    return matched[0].url
  }

  return validImages[0]?.url ?? product.thumbnail ?? null
}

const garmentUrlLooksLikeBack = (url: string) => {
  const slug = toTitleSlug(url)
  const lower = url.toLowerCase()
  return (
    /\bback\b/.test(slug) ||
    /[-/_.]back[-/_.]/i.test(lower) ||
    lower.includes("back.") ||
    lower.includes("_back") ||
    lower.includes("-back")
  )
}

const garmentUrlLooksLikeFront = (url: string) => {
  const slug = toTitleSlug(url)
  const lower = url.toLowerCase()
  return (
    /\bfront\b/.test(slug) ||
    /[-/_.]front[-/_.]/i.test(lower) ||
    lower.includes("front.") ||
    lower.includes("_front") ||
    lower.includes("-front")
  )
}

/**
 * Garment mockup URL for the customizer canvas and mockup renders, matched to print side
 * (front vs back). Uses variant `garment_images` when present, then colour-matched product images,
 * then filename heuristics (e.g. `...-back.jpg`).
 */
export function getGarmentImageUrlForPrintSide(
  product: HttpTypes.StoreProduct | undefined,
  variant: HttpTypes.StoreProductVariant | undefined,
  side: PrintGarmentSide,
  defaultGarmentImage: string | null
): string | null {
  const primaryFallback = getPrimaryGarmentImageUrl(product, variant) ?? defaultGarmentImage

  if (!product) {
    return primaryFallback
  }

  const validImages = (product.images ?? [])
    .filter((image) => Boolean(image.url))
    .map((image) => ({
      id: image.id,
      url: image.url as string,
    }))

  const resolveToStoreUrl = (u: string | undefined | null): string | null => {
    if (!u?.trim()) {
      return null
    }
    const trimmed = u.trim()
    const fromProduct = findProductImageByUrl(trimmed, validImages)
    return fromProduct?.url ?? trimmed
  }

  const colorOption = product.options?.find((o) => COLOR_OPTION_MATCHER.test(o.title ?? ""))
  const colorTitle = colorOption?.title
  const selectedColor =
    variant && colorTitle ? getVariantOptionValue(variant, colorTitle) : undefined

  const matchesColor = (url: string) =>
    !selectedColor || urlMatchesColorLabelStrict(url, selectedColor)

  if (side === "left_sleeve" || side === "right_sleeve") {
    return primaryFallback
  }

  const meta = variant ? ((variant.metadata ?? {}) as Record<string, unknown>) : {}
  const parsed = parseGarmentImagesObject(meta.garment_images)

  if (side === "front") {
    const ordered = [parsed.front, ...parsed.urls].filter(
      (u): u is string => typeof u === "string" && u.length > 0
    )
    const colorFiltered = selectedColor ? ordered.filter(matchesColor) : ordered
    const pool =
      selectedColor && colorFiltered.length === 0 ? [] : colorFiltered.length ? colorFiltered : ordered
    if (selectedColor && !pool.length) {
      return primaryFallback
    }
    const preferred =
      pool.find((u) => garmentUrlLooksLikeFront(u)) ??
      pool[0] ??
      ordered.find((u) => garmentUrlLooksLikeFront(u)) ??
      ordered[0]
    return resolveToStoreUrl(preferred) ?? primaryFallback
  }

  const backOrdered = [
    parsed.back,
    ...parsed.urls.filter(garmentUrlLooksLikeBack),
    ...parsed.urls,
  ].filter((u): u is string => typeof u === "string" && u.length > 0)

  const colorFilteredBack = selectedColor ? backOrdered.filter(matchesColor) : backOrdered
  const poolBack =
    selectedColor && colorFilteredBack.length === 0
      ? []
      : colorFilteredBack.length
        ? colorFilteredBack
        : backOrdered
  const preferredBack =
    selectedColor && !poolBack.length
      ? undefined
      : poolBack.find((u) => garmentUrlLooksLikeBack(u)) ?? poolBack[0]

  if (preferredBack) {
    const resolved = resolveToStoreUrl(preferredBack)
    if (resolved) {
      return resolved
    }
  }

  const fromProductImages = validImages.map((i) => i.url).filter(matchesColor)
  const backFromGallery =
    fromProductImages.find(garmentUrlLooksLikeBack) ??
    (validImages.length >= 2 ? validImages[1]?.url : undefined)

  if (backFromGallery && garmentUrlLooksLikeBack(backFromGallery)) {
    return backFromGallery
  }

  if (validImages.length >= 2) {
    const second = validImages[1]?.url
    if (second && matchesColor(second)) {
      return second
    }
  }

  return primaryFallback
}
