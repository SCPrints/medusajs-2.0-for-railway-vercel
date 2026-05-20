import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { cacheLife, cacheTag } from "next/cache"
import { HttpTypes } from "@medusajs/types"

export async function listRegions() {
  "use cache"
  cacheTag("regions")
  cacheLife({ revalidate: 3600, stale: 3600, expire: 86400 })
  return sdk.store.region
    .list()
    .then(({ regions }) => regions)
    .catch(medusaError)
}

export async function retrieveRegion(id: string) {
  "use cache"
  cacheTag("regions", `region-${id}`)
  cacheLife({ revalidate: 3600, stale: 3600, expire: 86400 })
  return sdk.store.region
    .retrieve(id)
    .then(({ region }) => region)
    .catch(medusaError)
}

const regionMap = new Map<string, HttpTypes.StoreRegion>()

export async function getRegion(countryCode: string) {
  try {
    const normalizedCountryCode = String(countryCode ?? "").trim().toLowerCase()

    if (!normalizedCountryCode) {
      return null
    }

    if (regionMap.has(normalizedCountryCode)) {
      return regionMap.get(normalizedCountryCode) ?? null
    }

    const regions = await listRegions()

    if (!regions) {
      return null
    }

    regions.forEach((region) => {
      region.countries?.forEach((c) => {
        const iso2 = String(c?.iso_2 ?? "").trim().toLowerCase()
        if (iso2) {
          regionMap.set(iso2, region)
        }
      })
    })

    return regionMap.get(normalizedCountryCode) ?? null
  } catch (e: any) {
    return null
  }
}
