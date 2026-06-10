import { sdk } from "@lib/config"
import { cacheLife, cacheTag } from "next/cache"

export type HomeSection = {
  id: string
  handle: string
  title: string
  subtitle: string | null
  product_handles: string[]
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
