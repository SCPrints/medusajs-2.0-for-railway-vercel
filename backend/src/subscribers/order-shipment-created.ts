import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import {
  INotificationModuleService,
  IOrderModuleService,
} from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { SUPPORT_REPLY_TO_EMAIL } from '../lib/constants'
import { EmailTemplates } from '../modules/email-notifications/templates'
import type { OrderShippedParcel } from '../modules/email-notifications/templates/order-shipped'
import { resolveOrderIdFromShipmentEvent } from '../lib/resolve-order-from-fulfillment'

/**
 * `shipment.created` (FulfillmentWorkflowEvents.SHIPMENT_CREATED) is emitted by
 * the core `createOrderShipmentWorkflow` — which both the ShipStation webhook and
 * the AusPost tracking job trigger once labels arrive. The event payload is
 * `{ id: <fulfillment_id>, no_notification }`, so we translate the fulfillment id
 * to its order, reload the order with its fulfillments + shipping address,
 * materialise the parcels array, and dispatch the ORDER_SHIPPED email.
 */
export default async function orderShipmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id?: string; order_id?: string; no_notification?: boolean }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  // Respect the core-supplied suppression flag — when staff create the shipment
  // with "do not notify the customer", skip the ORDER_SHIPPED email.
  if (data?.no_notification) {
    return
  }

  const orderId = await resolveOrderIdFromShipmentEvent(container, data)
  if (!orderId) {
    logger.warn(
      `shipment.created: could not resolve order from fulfillment ${data?.id}; skipping ORDER_SHIPPED email.`
    )
    return
  }
  // The event's `id` is the fulfillment that was just shipped — use it to
  // prefer that fulfillment's parcels.
  const shippedFulfillmentId = data?.id
  const notificationModuleService: INotificationModuleService = container.resolve(
    Modules.NOTIFICATION
  )
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  let order
  try {
    order = await orderModuleService.retrieveOrder(orderId, {
      relations: ['items', 'shipping_address'],
    })
  } catch (error) {
    logger.error(
      `shipment.created: failed to retrieve order ${orderId}: ${
        (error as Error).message
      }`
    )
    return
  }

  const shippingAddress = order.shipping_address
  if (!shippingAddress) {
    logger.warn(
      `shipment.created: order ${orderId} has no shipping_address; skipping ORDER_SHIPPED email.`
    )
    return
  }

  const { data: orders } = await query.graph({
    entity: 'order',
    filters: { id: orderId },
    fields: [
      'id',
      'fulfillments.id',
      'fulfillments.metadata',
      'fulfillments.created_at',
      'fulfillments.labels.tracking_number',
      'fulfillments.labels.tracking_url',
    ],
  })

  const fulfillments = orders?.[0]?.fulfillments || []
  let parcels: OrderShippedParcel[] = []

  // Prefer the shipstation-managed parcels metadata; fall back to native labels.
  if (shippedFulfillmentId) {
    const matched = fulfillments.find((f: any) => f.id === shippedFulfillmentId)
    if (matched) {
      parcels = parcelsFromFulfillment(matched)
    }
  }

  if (!parcels.length) {
    for (const f of fulfillments) {
      const fParcels = parcelsFromFulfillment(f)
      if (fParcels.length) {
        parcels = fParcels
        break
      }
    }
  }

  if (!parcels.length) {
    logger.warn(
      `shipment.created: order ${orderId} has no resolvable tracking parcels; skipping ORDER_SHIPPED email.`
    )
    return
  }

  try {
    await notificationModuleService.createNotifications({
      to: order.email!,
      channel: 'email',
      template: EmailTemplates.ORDER_SHIPPED,
      data: {
        emailOptions: {
          replyTo: SUPPORT_REPLY_TO_EMAIL,
          subject: `Your order ${(order as any).display_id ?? orderId} has shipped`,
        },
        order,
        shippingAddress,
        parcels,
        preview: `Tracking for ${parcels.length} ${
          parcels.length === 1 ? 'parcel' : 'parcels'
        } is now available`,
      },
    })
  } catch (error) {
    logger.error(
      `shipment.created: failed to send ORDER_SHIPPED email for order ${orderId}: ${
        (error as Error).message
      }`
    )
  }
}

const parcelsFromFulfillment = (fulfillment: any): OrderShippedParcel[] => {
  const md = (fulfillment?.metadata || {}) as Record<string, unknown>
  const fromMd = Array.isArray((md as any).parcels)
    ? ((md as any).parcels as OrderShippedParcel[])
    : []
  if (fromMd.length) return fromMd

  const labels = Array.isArray(fulfillment?.labels) ? fulfillment.labels : []
  return labels
    .filter((l: any) => l?.tracking_number)
    .map((l: any) => ({
      tracking_number: l.tracking_number,
      tracking_url: l.tracking_url || '',
    }))
}

export const config: SubscriberConfig = {
  event: 'shipment.created',
}
