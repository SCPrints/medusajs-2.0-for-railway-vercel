import { sdk } from "@lib/config"
import { cache } from "react"

export type HomeSection = {
  id: string
  handle: string
  title: string
  subtitle: string | null
  product_handles: string[]
}

const HOME_SECTIONS_TAG = "home-sections"

const cacheInit = {
  // 5 minutes — staff curate these occasionally; live reads on every home
  // load would be wasteful. Backend writes can revalidate the tag faster.
  next: { tags: [HOME_SECTIONS_TAG] as string[], revalidate: 300 },
}

/**
 * Published, weight-ordered home sections (just metadata + ordered product
 * handles). The home page hydrates each section's handles into region-priced
 * products itself. Returns [] on any error so the home page falls back to its
 * default product logic rather than breaking.
 */
export const getHomeSections = cache(async function (): Promise<HomeSection[]> {
  try {
    const data = (await sdk.client.fetch("/store/home-sections", {
      headers: { ...cacheInit },
    })) as { sections?: HomeSection[] }
    return data.sections ?? []
  } catch {
    return []
  }
})
