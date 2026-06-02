/**
 * Thread Lab image fetching — shared by the importer (import-thread-lab.ts)
 * and the one-off repair (fix-thread-lab-images.ts).
 *
 * THE COLOUR-MAPPING RULE (load-bearing):
 *   Thread Lab's Shopify store assigns exactly ONE image per colour via
 *   `variant_ids` (the clean per-colour packshot/model shot). Every other
 *   image on the product (~20 lifestyle / flatlay / detail shots) has an
 *   EMPTY `variant_ids` — i.e. it is "shared", not tied to any colour.
 *
 *   So for each colour we build:
 *     specific = images whose variant_ids map to this colour  (correct colour)
 *     shared   = images with no variant_ids                   (colour-agnostic)
 *
 *   The per-colour `garment_images.front` MUST be `specific[0]` so the
 *   storefront swatch photo + the primary colour picture show the right
 *   colour. Shared images are appended AFTER (gallery context only) so they
 *   never become the front. The original importer naively prepended shared
 *   images to every colour, which made every colour's front the same shared
 *   image — that's the bug this rule fixes.
 *
 *   Note the variant_ids mapping is authoritative even when the filename
 *   lies: Thread Lab's "Vanilla" colour points at a `natural-superior-tee`
 *   file, so filename matching would mis-assign it — variant_ids do not.
 */

const BRAND_URL = "https://www.threadlab.com.au"

export type ColourImageSet = { specific: string[]; shared: string[] }

export type ThreadLabGarmentImages = {
  front: string
  back?: string
  model_image?: string
  all: string[]
}

type ShopifyProductJson = {
  product: {
    images: Array<{ id: number; src: string; variant_ids: number[] }>
    variants: Array<{ id: number; option1: string; option2: string }>
  }
}

type MinimalLogger = { warn: (m: string) => void }

const emptyFallback = (colours: string[]): Record<string, ColourImageSet> => {
  const out: Record<string, ColourImageSet> = {}
  for (const c of colours) out[c] = { specific: [], shared: [] }
  return out
}

/**
 * Fetch all images from Thread Lab's Shopify product JSON, split per colour
 * into `specific` (variant-assigned, correct colour) and `shared` (no
 * variant_ids). De-duplicates within each bucket; preserves Shopify order.
 */
export async function fetchThreadLabColourImages(
  slug: string,
  colours: string[],
  logger: MinimalLogger
): Promise<Record<string, ColourImageSet>> {
  const url = `${BRAND_URL}/products/${slug}.json`
  let data: ShopifyProductJson
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      logger.warn(`Image fetch failed for ${slug}: HTTP ${res.status}`)
      return emptyFallback(colours)
    }
    data = (await res.json()) as ShopifyProductJson
  } catch (err: any) {
    logger.warn(`Image fetch error for ${slug}: ${err?.message ?? err}`)
    return emptyFallback(colours)
  }

  const { images, variants } = data.product

  // variant ID → colour name (option1 is the Colour option on Thread Lab)
  const variantToColour = new Map<number, string>()
  for (const v of variants) {
    if (v.option1) variantToColour.set(v.id, v.option1)
  }

  const result = emptyFallback(colours)
  const seen: Record<string, Set<string>> = {}
  for (const c of colours) seen[c] = new Set()

  // Collect shared (no-variant) image URLs once, in order.
  const sharedUrls: string[] = []
  const sharedSeen = new Set<string>()

  for (const img of images) {
    const src = img.src
    if (!src) continue

    if (img.variant_ids.length === 0) {
      if (!sharedSeen.has(src)) {
        sharedSeen.add(src)
        sharedUrls.push(src)
      }
      continue
    }

    // Variant-assigned → push to the matching colour's `specific` bucket.
    const matchedColours = new Set<string>()
    for (const vid of img.variant_ids) {
      const c = variantToColour.get(vid)
      if (c && result[c]) matchedColours.add(c)
    }
    for (const c of matchedColours) {
      if (!seen[c].has(src)) {
        seen[c].add(src)
        result[c].specific.push(src)
      }
    }
  }

  // Shared images are the same for every colour (lifestyle context).
  for (const c of colours) {
    result[c].shared = sharedUrls.filter((u) => !seen[c].has(u))
  }

  return result
}

/**
 * Build the per-colour `garment_images` block the storefront PDP + swatch
 * picker reads. `front` is the colour-specific image (correct swatch + main
 * picture); shared lifestyle shots only ever land in `all`, never as front.
 */
export function buildThreadLabGarmentImages(
  set: ColourImageSet
): ThreadLabGarmentImages {
  const { specific, shared } = set
  const all = [...specific, ...shared].filter(Boolean)
  const front = specific[0] ?? shared[0] ?? ""
  // `back` only when a genuine SECOND colour-specific image exists — never a
  // shared image (which could be a different colour and would mislead the
  // customizer's back-side mockup).
  const back = specific[1]
  const model_image = specific[2]
  return {
    front,
    ...(back ? { back } : {}),
    ...(model_image ? { model_image } : {}),
    all,
  }
}
