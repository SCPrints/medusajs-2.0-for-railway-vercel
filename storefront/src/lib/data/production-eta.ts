import { sdk } from "@lib/config"
import { cacheLife, cacheTag } from "next/cache"

export type ProductionEta = {
  low_days: number
  high_days: number
  baseline_days: number
  queue_days: number
  congested_stages: string[]
}

const ETA_TAG = "production-eta"

/**
 * Cached fetch, no error handling — errors must THROW here so a transient
 * backend failure is never stored in the cache for the whole revalidate
 * window. The public wrapper below catches.
 */
async function fetchProductionEta(): Promise<ProductionEta> {
  "use cache"
  cacheTag(ETA_TAG)
  // 15 minutes — ETA changes slowly and live reads on every PDP load
  // would hammer the order table for no real freshness gain.
  cacheLife({ revalidate: 900, stale: 86400, expire: 86400 })
  return (await sdk.client.fetch("/store/production-eta")) as ProductionEta
}

export async function getProductionEta(): Promise<ProductionEta | null> {
  try {
    return await fetchProductionEta()
  } catch {
    return null
  }
}
