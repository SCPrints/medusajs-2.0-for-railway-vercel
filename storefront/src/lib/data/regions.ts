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

export const getRegion = cache(async function (countryCode: string) {
  try {
    if (regionMap.has(countryCode)) {
      return regionMap.get(countryCode)
    }

    const regions = await listRegions()

    if (!regions) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7514/ingest/d011aee9-9c02-46d7-8ea3-0d9f69f8eed0",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "b984c7",
          },
          body: JSON.stringify({
            sessionId: "b984c7",
            location: "regions.ts:getRegion",
            message: "listRegions empty or falsy",
            data: { countryCode },
            timestamp: Date.now(),
            hypothesisId: "H3",
          }),
        }
      ).catch(() => {})
      // #endregion
      return null
    }

    regions.forEach((region) => {
      region.countries?.forEach((c) => {
        regionMap.set(c?.iso_2 ?? "", region)
      })
    })

    const region = countryCode
      ? regionMap.get(countryCode)
      : regionMap.get("us")

    if (!region) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7514/ingest/d011aee9-9c02-46d7-8ea3-0d9f69f8eed0",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "b984c7",
          },
          body: JSON.stringify({
            sessionId: "b984c7",
            location: "regions.ts:getRegion",
            message: "no region for countryCode",
            data: {
              countryCode,
              listedRegions: regions.length,
              sampleKeys: Array.from(regionMap.keys()).slice(0, 8),
            },
            timestamp: Date.now(),
            hypothesisId: "H3",
          }),
        }
      ).catch(() => {})
      // #endregion
    }

    return region
  } catch (e: any) {
    return null
  }
})
