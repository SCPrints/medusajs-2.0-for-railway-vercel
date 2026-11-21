// Shared by the tracking list and the account home.
export type Parcel = {
  tracking_number: string
  tracking_url: string
  label_id?: string
  carrier_id?: string | null
  carrier_code?: string | null
  service_code?: string | null
  shipped_at?: string | null
}

export const collectParcels = (order: { fulfillments?: unknown }): Parcel[] => {
  const fulfillments = ((order as any).fulfillments ?? []) as any[]
  const parcels: Parcel[] = []
  const seen = new Set<string>()

  for (const f of fulfillments) {
    const md = (f?.metadata || {}) as Record<string, unknown>
    const fromMd = Array.isArray((md as any).parcels)
      ? ((md as any).parcels as Parcel[])
      : []
    for (const p of fromMd) {
      const key = p.label_id || p.tracking_number
      if (!key || seen.has(key)) continue
      seen.add(key)
      parcels.push(p)
    }

    const labels = Array.isArray(f?.labels) ? f.labels : []
    for (const l of labels) {
      const trackingNumber = l?.tracking_number
      if (!trackingNumber || seen.has(trackingNumber)) continue
      seen.add(trackingNumber)
      parcels.push({
        tracking_number: trackingNumber,
        tracking_url: l?.tracking_url || "",
      })
    }
  }

  return parcels
}

