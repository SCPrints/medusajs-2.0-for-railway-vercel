import { HttpTypes } from "@medusajs/types"
import { Text } from "@medusajs/ui"

type Parcel = {
  tracking_number: string
  tracking_url: string
  label_id?: string
  carrier_id?: string | null
  carrier_code?: string | null
  service_code?: string | null
  shipped_at?: string | null
}

type TrackingListProps = {
  order: HttpTypes.StoreOrder
  /** Visual variant: full-width section vs compact list. */
  variant?: "default" | "compact"
}

const formatCarrier = (parcel: Parcel): string => {
  if (parcel.carrier_code) {
    return parcel.carrier_code
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }
  if (parcel.carrier_id) {
    return parcel.carrier_id
  }
  return "Carrier"
}

const collectParcels = (order: HttpTypes.StoreOrder): Parcel[] => {
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

/**
 * Renders one row per parcel for an order. Reads `fulfillments[].metadata.parcels`
 * (set by the ShipStation webhook) and falls back to native fulfillment labels.
 */
const TrackingList = ({ order, variant = "default" }: TrackingListProps) => {
  const parcels = collectParcels(order)
  const isCompact = variant === "compact"

  return (
    <div data-testid="tracking-list">
      {!isCompact && (
        <h2 className="text-2xl font-semibold text-[var(--brand-primary)] border-l-4 border-[var(--brand-secondary)] pl-4 mb-5">
          Tracking
        </h2>
      )}

      {parcels.length === 0 ? (
        <div className="bg-ui-bg-subtle rounded-lg p-4">
          <Text className="text-sm text-ui-fg-subtle">
            Tracking will appear here once your order ships.
          </Text>
        </div>
      ) : (
        <ul className="flex flex-col gap-y-3">
          {parcels.map((parcel, idx) => (
            <li
              key={parcel.label_id || parcel.tracking_number || idx}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 gap-x-4 border border-ui-border-base rounded-rounded p-4"
            >
              <div className="flex flex-col">
                <Text className="txt-medium-plus text-ui-fg-base">
                  Parcel {idx + 1} of {parcels.length} · {formatCarrier(parcel)}
                </Text>
                <Text className="txt-small text-ui-fg-subtle">
                  Tracking: {parcel.tracking_number || "—"}
                </Text>
              </div>
              {parcel.tracking_url ? (
                <a
                  href={parcel.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start sm:self-auto inline-flex items-center justify-center rounded-rounded bg-ui-button-inverted px-4 py-2 text-ui-fg-on-inverted text-small-regular hover:bg-ui-button-inverted-hover"
                >
                  Track parcel
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}

    </div>
  )
}

export default TrackingList
