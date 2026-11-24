import { Text } from "@medusajs/ui"

import { homeAddressLine, type HomeDelivery } from "../../../lib/home-delivery"
import { AppLink } from "../../lib/nav"

type OrderLike = { metadata?: Record<string, unknown> | null }

/** Delivery section: the buyer split this order across saved destinations. Nothing on other orders. */
export function SplitDeliveryNote({ order }: { order: OrderLike }) {
  const split = order.metadata?.split_delivery
  if (!Array.isArray(split) || split.length === 0) return null
  return (
    <div className="flex flex-col gap-y-2 border-t border-ui-border-base px-6 py-4">
      <Text size="small" weight="plus">Split delivery: {split.length} addresses (postage paid is for one; confirm the rest with the customer)</Text>
      {split.map((d: any) => (
        <div key={d.destination_id}>
          <Text size="small" weight="plus">{d.name}</Text>
          <Text size="small" className="text-ui-fg-subtle">{d.address}</Text>
          <Text size="small">{(d.lines ?? []).map((l: any) => `${l.quantity} × ${l.title}`).join(" · ")}</Text>
        </div>
      ))}
    </div>
  )
}

/** Delivery section: gift link / new-starter packs, one parcel per person, postage paid. */
export function HomeDeliveryNote({ order }: { order: OrderLike }) {
  const parcels = order.metadata?.home_delivery
  if (!Array.isArray(parcels) || parcels.length === 0) return null
  return (
    <div className="flex flex-col gap-y-2 border-t border-ui-border-base px-6 py-4">
      <Text size="small" weight="plus">
        Pack each person separately: {parcels.length} {parcels.length === 1 ? "parcel" : "parcels"} to home addresses (postage paid)
      </Text>
      {(parcels as HomeDelivery[]).map((p, i) => (
        <div key={i}>
          <Text size="small" weight="plus">{p.address?.name || p.name}{p.address?.phone ? ` · ${p.address.phone}` : ""}</Text>
          <Text size="small" className="text-ui-fg-subtle">{p.address ? homeAddressLine(p.address) : "No address"}</Text>
          <Text size="small">{(p.items ?? []).map((l) => `${l.quantity} × ${l.title} (${l.size})`).join(" · ")}</Text>
        </div>
      ))}
    </div>
  )
}

/** Artwork section: one line pointing at the organisation's brand kit. */
export function BrandKitLine({ order }: { order: OrderLike }) {
  const orgId = order.metadata?.organisation_id
  if (typeof orgId !== "string" || !orgId) return null
  return (
    <div className="px-6 py-3">
      <Text size="small">
        Organisation order. <AppLink href={`/app/organisations?org=${encodeURIComponent(orgId)}&tab=brand_kit`} className="text-ui-fg-interactive hover:underline">Brand kit</AppLink> has its approved colours, fonts and logos.
      </Text>
    </div>
  )
}
