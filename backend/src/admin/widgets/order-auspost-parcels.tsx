import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { withWidgetBoundary } from "../components/widget-error-boundary"
import type { DetailWidgetProps, AdminOrder } from "@medusajs/framework/types"
import {
  Badge,
  Container,
  Heading,
  Table,
  Text,
} from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState } from "react"

import { HelpTooltip } from "../components/reports/help-tooltip"

import { sdk } from "../lib/sdk"

type ParcelEvent = {
  description: string
  location?: string | null
  event_date_time: string
  signer_name?: string | null
}

type Parcel = {
  tracking_number?: string | null
  tracking_url?: string | null
  shipment_id?: string | null
  label_url?: string | null
  service_code?: string | null
  tracking_status?: string | null
  events?: ParcelEvent[]
  shipped_at?: string | null
}

type FulfillmentLike = {
  id: string
  shipped_at?: string | null
  metadata?: Record<string, unknown> | null
  data?: Record<string, unknown> | null
  provider_id?: string | null
}

const formatTimestamp = (iso: string | null | undefined): string | null => {
  if (!iso) return null
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return null
  return new Date(ts).toLocaleString()
}

const statusColor = (
  s: string | null | undefined
): "green" | "blue" | "grey" | "red" => {
  if (!s) return "grey"
  if (/delivered/i.test(s)) return "green"
  if (/returned|failed|exception/i.test(s)) return "red"
  if (/transit|out for delivery|lodged/i.test(s)) return "blue"
  return "grey"
}

const parcelsForFulfillment = (f: FulfillmentLike): Parcel[] => {
  const md = (f.metadata || {}) as Record<string, unknown>
  const fromMd = Array.isArray((md as any).parcels)
    ? ((md as any).parcels as Parcel[])
    : []

  if (fromMd.length) return fromMd

  // Pre-first-scan: surface a synthetic parcel from fulfillment.data so the
  // widget shows the tracking ID + label link immediately after createFulfillment,
  // before the polling cron has populated parcels[].
  const data = (f.data || {}) as Record<string, unknown>
  const trackingId = (data.tracking_id as string) || null
  const labelUrl = (data.label_url as string) || null
  const shipmentId = (data.shipment_id as string) || null
  const productId = (data.product_id as string) || null
  const trackingUrl = (data.tracking_url as string) || null
  if (!trackingId && !labelUrl) return []

  return [
    {
      tracking_number: trackingId,
      tracking_url: trackingUrl,
      shipment_id: shipmentId,
      label_url: labelUrl,
      service_code: productId,
      tracking_status: "Pending first scan",
      events: [],
    },
  ]
}

const OrderAusPostParcelsWidget = ({
  data,
}: DetailWidgetProps<AdminOrder>) => {
  const orderId = data?.id
  const [fulfillments, setFulfillments] = useState<FulfillmentLike[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError(null)
    try {
      const response = await sdk.admin.order.retrieve(orderId, {
        fields:
          "id,fulfillments.id,fulfillments.shipped_at,fulfillments.provider_id,+fulfillments.metadata,+fulfillments.data",
      })
      const fs = (response?.order as any)?.fulfillments ?? []
      setFulfillments(Array.isArray(fs) ? (fs as FulfillmentLike[]) : [])
    } catch (err) {
      setError((err as Error).message || "Failed to load fulfillments")
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Render nothing for orders that have no AusPost fulfillments — the
  // ShipStation widget already covers those, so the admin doesn't get a
  // empty AusPost panel on every legacy order.
  const ausPostFulfillments = useMemo(
    () =>
      fulfillments.filter(
        (f) =>
          typeof f.provider_id === "string" &&
          f.provider_id.startsWith("auspost_")
      ),
    [fulfillments]
  )

  if (!loading && ausPostFulfillments.length === 0) {
    return null
  }

  const totalParcels = ausPostFulfillments.reduce(
    (sum, f) => sum + parcelsForFulfillment(f).length,
    0
  )

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2" className="flex items-center">
          AusPost parcels
          <HelpTooltip
            text={{
              title: "Australia Post parcels",
              body: "Parcel records for this order's AusPost fulfillments — tracking numbers, label PDFs, and tracking events.",
              bullets: [
                "Events sync every 4h via the tracking-poll cron (AusPost has no webhook).",
                "Click Track to open the public AusPost tracking page.",
                "If the label URL has expired, regenerate via the order detail page.",
              ],
            }}
          />
        </Heading>
        {totalParcels > 0 ? (
          <Badge color="grey" size="2xsmall">
            {totalParcels} {totalParcels === 1 ? "parcel" : "parcels"}
          </Badge>
        ) : null}
      </div>

      {error ? (
        <div className="px-6 py-3">
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        </div>
      ) : null}

      <div className="px-6 py-4 flex flex-col gap-y-6">
        {loading && ausPostFulfillments.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Loading fulfillments…
          </Text>
        ) : (
          ausPostFulfillments.map((f) => {
            const parcels = parcelsForFulfillment(f)
            const shippedAt = formatTimestamp(f.shipped_at)
            return (
              <div key={f.id} className="flex flex-col gap-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <Text size="small" weight="plus">
                      Fulfillment {f.id}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {shippedAt ? `Shipped ${shippedAt}` : "Not yet shipped"} · Australia Post
                    </Text>
                  </div>
                </div>

                {parcels.length === 0 ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    No parcels yet — labels haven't been generated.
                  </Text>
                ) : (
                  parcels.map((parcel, idx) => (
                    <div
                      key={parcel.tracking_number || idx}
                      className="border rounded-md p-4 flex flex-col gap-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <Text size="small" weight="plus">
                            Parcel #{idx + 1}
                          </Text>
                          <Text size="xsmall" className="text-ui-fg-subtle font-mono">
                            {parcel.tracking_number || "no tracking yet"}
                          </Text>
                        </div>
                        <Badge color={statusColor(parcel.tracking_status)} size="2xsmall">
                          {parcel.tracking_status || "Unknown"}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {parcel.tracking_url ? (
                          <a
                            href={parcel.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ui-fg-interactive text-xs hover:underline"
                          >
                            Track →
                          </a>
                        ) : null}
                        {parcel.label_url ? (
                          <a
                            href={parcel.label_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ui-fg-interactive text-xs hover:underline"
                          >
                            Open label PDF →
                          </a>
                        ) : null}
                        {parcel.service_code ? (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            Service: {parcel.service_code}
                          </Text>
                        ) : null}
                      </div>

                      {parcel.events && parcel.events.length > 0 ? (
                        <Table>
                          <Table.Header>
                            <Table.Row>
                              <Table.HeaderCell>When</Table.HeaderCell>
                              <Table.HeaderCell>Location</Table.HeaderCell>
                              <Table.HeaderCell>Status</Table.HeaderCell>
                            </Table.Row>
                          </Table.Header>
                          <Table.Body>
                            {parcel.events
                              .slice()
                              .reverse()
                              .map((e, eidx) => (
                                <Table.Row key={`${e.event_date_time}-${eidx}`}>
                                  <Table.Cell>
                                    <Text size="small">
                                      {formatTimestamp(e.event_date_time) || e.event_date_time}
                                    </Text>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Text size="small" className="text-ui-fg-subtle">
                                      {e.location || "—"}
                                    </Text>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Text size="small">{e.description}</Text>
                                    {e.signer_name ? (
                                      <Text size="xsmall" className="text-ui-fg-subtle">
                                        Signed by {e.signer_name}
                                      </Text>
                                    ) : null}
                                  </Table.Cell>
                                </Table.Row>
                              ))}
                          </Table.Body>
                        </Table>
                      ) : (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          No tracking events yet — first scan from AusPost
                          can take a few hours after lodgement.
                        </Text>
                      )}
                    </div>
                  ))
                )}
              </div>
            )
          })
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default withWidgetBoundary(OrderAusPostParcelsWidget, "order-auspost-parcels")
