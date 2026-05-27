import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  INotificationModuleService,
  IOrderModuleService,
} from "@medusajs/framework/types"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import {
  CONTACT_NOTIFICATION_EMAIL,
  FULFILLMENT_NOTIFICATION_EMAIL,
  ORDER_NOTIFICATION_EMAIL,
  SUPPORT_REPLY_TO_EMAIL,
} from "../lib/constants"
import { parseNotificationEmailList } from "../lib/notification-recipients"
import { getPostHog } from "../lib/posthog"
import { ORGANISATION_MODULE } from "../modules/organisation"
import type OrganisationModuleService from "../modules/organisation/service"
import { EmailTemplates } from "../modules/email-notifications/templates"

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const notificationModuleService: INotificationModuleService = container.resolve(
    Modules.NOTIFICATION
  )
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)

  const order = await orderModuleService.retrieveOrder(data.id, {
    relations: ["items", "summary", "shipping_address"],
  })

  const shippingAddress = order.shipping_address
  if (!shippingAddress) {
    logger.warn(
      `order.placed: order ${data.id} has no shipping_address; skipping order emails.`
    )
    return
  }

  // Identify the customer and track the order placement
  const distinctId = (order as any).customer_id ?? order.email ?? data.id
  const posthog = getPostHog()
  if (posthog && order.email) {
    posthog.identify({
      distinctId,
      properties: {
        email: order.email,
        $set: { email: order.email },
        $set_once: { first_order_id: data.id },
      },
    })
  }
  posthog?.capture({
    distinctId,
    event: "order placed",
    properties: {
      order_id: data.id,
      display_id: (order as any).display_id ?? null,
      item_count: (order.items ?? []).length,
      currency_code: order.currency_code ?? null,
      total: (order as any).summary?.current_order_total ?? null,
      email: order.email ?? null,
      country_code: shippingAddress.country_code ?? null,
      fulfillment_order: ((order as any).metadata?.fulfillment_order ?? false) === true,
    },
  })

  const displayId = (order as { display_id?: string | number }).display_id ?? data.id
  const replyToSupport = SUPPORT_REPLY_TO_EMAIL

  const meta = ((order as any).metadata ?? {}) as Record<string, unknown>
  const isFulfillmentOrder = meta.fulfillment_order === true

  // ────────────────────────────────────────────────────────────────────
  // FULFILLMENT ORDER BRANCH (Phase 2 customer portal restocks)
  // ────────────────────────────────────────────────────────────────────
  if (isFulfillmentOrder) {
    const orgId = meta.organisation_id as string | undefined
    const destinationId = meta.organisation_destination_id as string | undefined
    const placedById = meta.placed_by_customer_id as string | undefined
    const externalRef = (meta.external_ref ?? null) as string | null
    const requestedShipBy = (meta.requested_ship_by ?? null) as string | null

    // Hydrate org + destination + placed-by customer (best-effort, all
    // failures fall through to a degraded email — the customer still
    // gets something useful even if a side lookup fails).
    let organisationName = "Your organisation"
    let destinationName: string | null = null
    let destinationDeliveryNotes: string | null = null
    let placedByName: string | null = null
    try {
      const orgService =
        container.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
      if (orgId) {
        const org = (await orgService.retrieveOrganisation(orgId)) as any
        organisationName = org?.name ?? organisationName
      }
      if (destinationId) {
        const dest = (await orgService.retrieveOrganisationDestination(
          destinationId
        )) as any
        if (dest) {
          destinationName = dest.name ?? null
          destinationDeliveryNotes = dest.delivery_notes ?? null
        }
      }
    } catch (err) {
      logger.warn(
        `order.placed (fulfillment): could not hydrate org/destination on ${data.id}: ${(err as Error).message}`
      )
    }

    if (placedById) {
      try {
        const customerService = container.resolve(Modules.CUSTOMER)
        const placedBy = await customerService.retrieveCustomer(placedById)
        const parts = [
          (placedBy as any)?.first_name,
          (placedBy as any)?.last_name,
        ]
          .filter(Boolean)
          .join(" ")
        placedByName = parts.trim() || (placedBy as any)?.email || null
      } catch {
        /* placed_by may have been removed — leave null */
      }
    }

    // Customer-facing confirmation
    if (order.email) {
      try {
        await notificationModuleService.createNotifications({
          to: order.email,
          channel: "email",
          template: EmailTemplates.FULFILLMENT_ORDER_PLACED,
          data: {
            emailOptions: {
              replyTo: replyToSupport,
              subject: `Restock confirmed — order #${displayId}`,
            },
            order,
            shippingAddress,
            audience: "customer",
            organisationName,
            destinationName,
            destinationDeliveryNotes,
            externalRef,
            requestedShipBy,
            placedByName,
            preview: `Restock #${displayId} is in — we'll keep you posted on production.`,
          },
        })
      } catch (error) {
        logger.error(
          `order.placed (fulfillment): customer confirmation failed for ${data.id}: ${
            (error as Error).message
          }`
        )
      }
    } else {
      logger.warn(
        `order.placed (fulfillment): order ${data.id} has no customer email; skipping customer confirmation.`
      )
    }

    // Internal alert — uses FULFILLMENT_NOTIFICATION_EMAIL with fallback to ORDER_NOTIFICATION_EMAIL
    const internalInboxes = parseNotificationEmailList(
      FULFILLMENT_NOTIFICATION_EMAIL ||
        ORDER_NOTIFICATION_EMAIL ||
        CONTACT_NOTIFICATION_EMAIL
    )
    for (const inbox of internalInboxes) {
      try {
        await notificationModuleService.createNotifications({
          to: inbox,
          channel: "email",
          template: EmailTemplates.FULFILLMENT_ORDER_PLACED,
          data: {
            emailOptions: {
              replyTo: order.email ?? replyToSupport,
              subject: `New fulfillment order from ${organisationName} — #${displayId}`,
            },
            order,
            shippingAddress,
            audience: "merchant",
            organisationName,
            destinationName,
            destinationDeliveryNotes,
            externalRef,
            requestedShipBy,
            placedByName,
            preview: `New fulfillment order from ${organisationName} — #${displayId}`,
          },
        })
      } catch (error) {
        logger.error(
          `order.placed (fulfillment): internal notification to ${inbox} failed: ${(error as Error).message}`
        )
      }
    }

    return
  }

  // ────────────────────────────────────────────────────────────────────
  // STANDARD ORDER BRANCH (existing storefront orders)
  // ────────────────────────────────────────────────────────────────────
  const merchantInboxes = parseNotificationEmailList(
    ORDER_NOTIFICATION_EMAIL || CONTACT_NOTIFICATION_EMAIL
  )

  if (order.email) {
    try {
      await notificationModuleService.createNotifications({
        to: order.email,
        channel: "email",
        template: EmailTemplates.ORDER_PLACED,
        data: {
          emailOptions: {
            replyTo: replyToSupport,
            subject: "Your order has been placed",
          },
          order,
          shippingAddress,
          audience: "customer",
          preview: "Thank you for your order!",
        },
      })
    } catch (error) {
      logger.error(
        `order.placed: customer confirmation failed for order ${data.id}: ${
          (error as Error).message
        }`
      )
    }
  } else {
    logger.warn(
      `order.placed: order ${data.id} has no customer email; skipping customer confirmation.`
    )
  }

  for (const inbox of merchantInboxes) {
    try {
      await notificationModuleService.createNotifications({
        to: inbox,
        channel: "email",
        template: EmailTemplates.ORDER_PLACED,
        data: {
          emailOptions: {
            replyTo: order.email ?? replyToSupport,
            subject: `New order #${displayId}`,
          },
          order,
          shippingAddress,
          audience: "merchant",
          preview: `New order #${displayId}`,
        },
      })
    } catch (error) {
      logger.error(
        `order.placed: merchant notification to ${inbox} failed: ${(error as Error).message}`
      )
    }
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
