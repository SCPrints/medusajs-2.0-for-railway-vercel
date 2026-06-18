import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { cacheLife, cacheTag } from "next/cache"
import { getProductsByHandle } from "./products"
import { listBundles, type Bundle } from "./bundles"

export type HomeSection = {
  id: string
  handle: string
  title: string
  subtitle: string | null
  product_handles: string[]
}

/**
 * A curated section entry is either a product or a bundle. Bundles are
 * referenced in the curated handle list with a `bundle:` prefix.
 */
export const HOME_SECTION_BUNDLE_PREFIX = "bundle:"

export type HomeSectionItem =
  | { kind: "product"; product: HttpTypes.StoreProduct }
  | { kind: "bundle"; bundle: Bundle }

/** A home section with its handles hydrated into region-priced products/bundles. */
export type HydratedHomeSection = {
  id: string
  /** null for the legacy fallback rail (no curated section behind it). */
  handle: string | null
  title: string
  subtitle: string | null
  items: HomeSectionItem[]
}

const HOME_SECTIONS_TAG = "home-sections"

/**
 * Cached fetch, no error handling — errors must THROW here so a transient
 * backend failure is never stored in the cache for the whole revalidate
 * window. The public wrapper below catches.
 */
async function fetchHomeSections(): Promise<HomeSection[]> {
  "use cache"
  cacheTag(HOME_SECTIONS_TAG)
  // 5 minutes — staff curate these occasionally; live reads on every home
  // load would be wasteful. Backend writes can revalidate the tag faster.
  cacheLife({ revalidate: 300, stale: 86400, expire: 86400 })
  const data = (await sdk.client.fetch("/store/home-sections")) as {
    sections?: HomeSection[]
  }
  return data.sections ?? []
}

/**
 * Published, weight-ordered home sections (just metadata + ordered product
 * handles). The home page hydrates each section's handles into region-priced
 * products itself. Returns [] on any error so the home page falls back to its
 * default product logic rather than breaking.
 */
export async function getHomeSections(): Promise<HomeSection[]> {
  try {
    return await fetchHomeSections()
  } catch {
    return []
  }
}

/**
 * A single published home section by its handle, or null if it doesn't exist
 * (or is unpublished — the cached list only contains published sections).
 * Reuses the already-cached full list rather than hitting a per-handle
 * endpoint: the list is capped at 50 sections, so a `.find()` is free.
 */
export async function getHomeSectionByHandle(
  handle: string
): Promise<HomeSection | null> {
  const normalized = handle.trim().toLowerCase()
  if (!normalized) return null
  const sections = await getHomeSections()
  return sections.find((s) => s.handle.toLowerCase() === normalized) ?? null
}

/**
 * Hydrate one or more home sections' ordered handle lists into region-priced
 * products + bundles, preserving the staff-curated order and silently dropping
 * handles that no longer resolve (deleted / draft / un-imported). Batches all
 * product handles into a single fetch and all bundles into one list call, so
 * rendering N sections costs at most two backend round-trips.
 *
 * Shared by the home page rails and the `/collections/[handle]` full-grid page
 * so a section shows the exact same items in both places.
 */
export async function hydrateHomeSections(
  sections: HomeSection[],
  regionId: string
): Promise<HydratedHomeSection[]> {
  if (!sections.length) return []

  const allHandles = Array.from(
    new Set(sections.flatMap((s) => s.product_handles))
  )
  const productHandles = allHandles.filter(
    (h) => !h.startsWith(HOME_SECTION_BUNDLE_PREFIX)
  )
  const hasBundles = allHandles.some((h) =>
    h.startsWith(HOME_SECTION_BUNDLE_PREFIX)
  )

  const pricedProducts = productHandles.length
    ? await getProductsByHandle({ handles: productHandles, regionId })
    : []
  const byHandle = new Map(
    pricedProducts
      .filter((p) => p.handle)
      .map((p) => [p.handle as string, p])
  )

  // Bundles carry no region pricing on the card (item count only), so one
  // unscoped listBundles() call hydrates every curated bundle.
  const bundlesByHandle = new Map<string, Bundle>()
  if (hasBundles) {
    const allBundles = await listBundles()
    for (const b of allBundles) bundlesByHandle.set(b.handle, b)
  }

  return sections
    .map((s) => ({
      id: s.id,
      handle: s.handle,
      title: s.title,
      subtitle: s.subtitle,
      // preserve the staff-curated order; skip handles that no longer resolve
      items: s.product_handles
        .map((h): HomeSectionItem | null => {
          if (h.startsWith(HOME_SECTION_BUNDLE_PREFIX)) {
            const bundle = bundlesByHandle.get(
              h.slice(HOME_SECTION_BUNDLE_PREFIX.length)
            )
            return bundle ? { kind: "bundle", bundle } : null
          }
          const product = byHandle.get(h)
          return product ? { kind: "product", product } : null
        })
        .filter((i): i is HomeSectionItem => Boolean(i)),
    }))
    .filter((s) => s.items.length > 0)
}
