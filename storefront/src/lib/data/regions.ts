import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { cache } from "react"
import { HttpTypes } from "@medusajs/types"

export const listRegions = cache(async function () {
  return sdk.store.region
    .list({}, { next: { tags: ["regions"] } })
    .then(({ regions }) => regions)
    .catch(medusaError)
})

export const retrieveRegion = cache(async function (id: string) {
  return sdk.store.region
    .retrieve(id, {}, { next: { tags: ["regions"] } })
    .then(({ region }) => region)
    .catch(medusaError)
})

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
