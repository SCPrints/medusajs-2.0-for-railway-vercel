import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import { AUSPOST_API_KEY } from "../lib/constants"
import { buildAusPostTrackingUrl } from "../modules/auspost/mapping"
import type AusPostProviderService from "../modules/auspost/service"
import type { AusPostTrackingResult } from "../modules/auspost/types"

const TRACK_BATCH_SIZE = 10
const LOOKBACK_DAYS = 60
const TERMINAL_STATUSES = new Set(["Delivered", "Returned"])

type ParcelRecord = {
  tracking_number?: string | null
  tracking_url?: string | null
  label_id?: string | null
  shipment_id?: string | null
  carrier_id?: string | null
  carrier_code?: string | null
  service_code?: string | null
  label_url?: string | null
  weight_grams?: number | null
  voided_at?: string | null
  shipped_at?: string | null
  // AusPost-specific fields the order-auspost-parcels widget reads
  tracking_status?: string | null
  events?: Array<{
    description: string
    location?: string | null
    event_date_time: string
    signer_name?: string | null
  }>
}

type FulfillmentRow = {
  id: string
  provider_id?: string | null
  data?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

/**
 * Daily 04:30 UTC cron — AusPost has no webhook push, so we poll the
 * Track API every 4 hours and materialise events into
 * `fulfillment.metadata.parcels[]` (same shape the ShipStation webhook
 * writes, so the order-shipped email + tracking-list storefront component
 * read it without provider awareness).
 *
 * Cadence: 4h is enough for parcel transit — events cluster at lodgement,
 * sorting facility, and out-for-delivery, with ~30min between status flips.
 * Faster polling burns the (undocumented but ~60 req/min) AusPost rate
 * budget without buying meaningfully fresher data.
 *
 * Behaviour:
 *  - Walks all orders created in the last 60 days with auspost fulfillments
 *  - Skips fulfillments whose persisted tracking_status is already terminal
 *  - Batches tracking IDs in groups of 10 (AusPost's per-call max)
 *  - On first event detection (parcel handed over) emits `order.shipment_created`
 *    so the existing customer-shipped email fires
 *  - Persists tracking_status + events[] back to fulfillment.metadata.parcels
 *
 * No-ops silently if AUSPOST_API_KEY is unset (dev / pre-go-live state).
 */
export default async function syncAusPostTracking(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!AUSPOST_API_KEY) {
    logger.debug("AusPost tracking sync: AUSPOST_API_KEY unset, skipping.")
    return
  }

  let provider: AusPostProviderService
  try {
    provider = container.resolve(
      "auspost_auspost"
    ) as unknown as AusPostProviderService
  } catch {
    logger.debug("AusPost tracking sync: provider not registered, skipping.")
    return
  }

  const client = provider.getClient()
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentService = container.resolve(Modules.FULFILLMENT) as {
    updateFulfillment?: (
      id: string,
      data: { metadata?: Record<string, unknown> }
    ) => Promise<unknown>
  }
  const eventBus = container.resolve(Modules.EVENT_BUS) as {
    emit: (event: { name: string; data: unknown }) => Promise<unknown>
  }

  const since = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  // Pull every order in the lookback window with its fulfillments + metadata.
  // Filtering here on provider_id would force the query through a join we don't
  // need — cheaper to overfetch and filter in memory at this volume.
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "created_at",
      "metadata",
      "fulfillments.id",
      "fulfillments.provider_id",
      "fulfillments.data",
      "fulfillments.metadata",
    ],
    pagination: { take: 1000, skip: 0 },
  })

  const pending: Array<{
    order_id: string
    fulfillment: FulfillmentRow
    tracking_id: string
  }> = []

  for (const order of (orders as any[]) ?? []) {
    const createdAt = Date.parse(order?.created_at ?? "")
    if (!Number.isFinite(createdAt) || createdAt < Date.parse(since)) continue

    for (const f of (order.fulfillments ?? []) as FulfillmentRow[]) {
      const providerId = f.provider_id || ""
      if (!providerId.startsWith("auspost_")) continue

      const trackingId =
        ((f.data as Record<string, unknown> | null)?.tracking_id as string) || null
      if (!trackingId) continue

      const status =
        (((f.metadata as Record<string, unknown> | null)?.tracking_status as
          | string
          | undefined) ?? "") || ""
      if (status && TERMINAL_STATUSES.has(status)) continue

      pending.push({ order_id: order.id, fulfillment: f, tracking_id: trackingId })
    }
  }

  if (pending.length === 0) {
    logger.debug("AusPost tracking sync: nothing to poll.")
    return
  }

  logger.info(
    `AusPost tracking sync: polling ${pending.length} active fulfillment(s)`
  )

  // Batch into groups of 10 — AusPost's Track API hard cap.
  for (let i = 0; i < pending.length; i += TRACK_BATCH_SIZE) {
    const batch = pending.slice(i, i + TRACK_BATCH_SIZE)
    const ids = batch.map((p) => p.tracking_id)

    let resp
    try {
      resp = await client.getTracking(ids)
    } catch (err) {
      logger.warn(
        `AusPost tracking sync: batch ${i / TRACK_BATCH_SIZE + 1} failed: ${
          (err as Error).message
        }`
      )
      continue
    }

    const byId = new Map<string, AusPostTrackingResult>(
      (resp.tracking_results || []).map((r) => [r.tracking_id, r])
    )

    for (const row of batch) {
      const result = byId.get(row.tracking_id)
      if (!result) continue

      const events = (result.events || []).map((e) => ({
        description: e.description,
        location: e.location || null,
        event_date_time: e.event_date_time,
        signer_name: e.signer_name || null,
      }))

      const parcel: ParcelRecord = {
        tracking_number: row.tracking_id,
        tracking_url: buildAusPostTrackingUrl(row.tracking_id),
        shipment_id:
          ((row.fulfillment.data as Record<string, unknown> | null)
            ?.shipment_id as string) || null,
        carrier_code: "australia_post",
        carrier_id: "auspost",
        service_code:
          ((row.fulfillment.data as Record<string, unknown> | null)
            ?.product_id as string) || null,
        label_url:
          ((row.fulfillment.data as Record<string, unknown> | null)
            ?.label_url as string) || null,
        tracking_status: result.status || null,
        events,
        shipped_at:
          events.length > 0
            ? events[events.length - 1]?.event_date_time
            : null,
      }

      const existingMetadata =
        (row.fulfillment.metadata as Record<string, unknown> | null) || {}
      const isFirstScan = !existingMetadata.shipment_synced_at

      try {
        await fulfillmentService.updateFulfillment?.(row.fulfillment.id, {
          metadata: {
            ...existingMetadata,
            provider: "auspost",
            parcels: [parcel],
            tracking_status: result.status || null,
            shipment_synced_at:
              existingMetadata.shipment_synced_at ?? new Date().toISOString(),
            last_polled_at: new Date().toISOString(),
          },
        })
      } catch (err) {
        logger.warn(
          `AusPost tracking sync: failed to update fulfillment ${row.fulfillment.id}: ${
            (err as Error).message
          }`
        )
        continue
      }

      // On first detection of any tracking event, fire the same shipment
      // event the ShipStation webhook fires — kicks off the customer
      // ORDER_SHIPPED email without provider awareness in the subscriber.
      if (isFirstScan && events.length > 0) {
        try {
          await eventBus.emit({
            name: "order.shipment_created",
            data: {
              order_id: row.order_id,
              fulfillment_id: row.fulfillment.id,
              no_notification: false,
            },
          })
        } catch (err) {
          logger.warn(
            `AusPost tracking sync: failed to emit order.shipment_created for ${row.fulfillment.id}: ${
              (err as Error).message
            }`
          )
        }
      }
    }
  }
}

export const config = {
  name: "sync-auspost-tracking",
  // Every 4 hours; mid-day local time the first event of an overnight
  // dispatch is already visible. Cron field at 0,4,8,12,16,20 UTC.
  schedule: "0 */4 * * *",
}
