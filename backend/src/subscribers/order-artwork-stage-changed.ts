import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  INotificationModuleService,
  IOrderModuleService,
} from "@medusajs/framework/types"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import { SUPPORT_REPLY_TO_EMAIL } from "../lib/constants"
import { tagUrl } from "../lib/email-utm"
import { EmailTemplates } from "../modules/email-notifications/templates"
import {
  ARTWORK_STAGE_EVENT,
  isArtworkStage,
  shouldEmailForArtworkTransition,
  type ArtworkStage,
  type ProductionStageChangedEvent,
} from "../lib/production-stage"
import { subjectForStage } from "../modules/email-notifications/templates/order-production-stage"
import {
  buildPortalUrl,
  sendProofEmail,
} from "../services/artwork-approval/proof-email"

/**
 * Fires a customer email when artwork transitions to a milestone in
 * `ARTWORK_STAGES_THAT_EMAIL` (currently just `awaiting_approval`). The
 * blanks track is internal-only — customers don't get notified about PO
 * state, so there's no sibling for it.
 */
export default async function orderArtworkStageChangedHandler({
  event: { data },
  container,
}: SubscriberArgs<ProductionStageChangedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!data?.order_id || !isArtworkStage(data.to_stage)) {
    logger.warn(
      `${ARTWORK_STAGE_EVENT}: malformed event payload, skipping (order_id=${data?.order_id})`
    )
    return
  }

  const fromStage = isArtworkStage(data.from_stage) ? (data.from_stage as ArtworkStage) : null
  const toStage = data.to_stage as ArtworkStage
  if (!shouldEmailForArtworkTransition(fromStage, toStage)) {
    return
  }

  const notificationModuleService: INotificationModuleService = container.resolve(
    Modules.NOTIFICATION
  )
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)

  let order: any
  try {
    order = await orderModuleService.retrieveOrder(data.order_id, {
      relations: toStage === "awaiting_approval"
        ? ["shipping_address", "items"]
        : ["shipping_address"],
    })
  } catch (error) {
    logger.error(
      `${ARTWORK_STAGE_EVENT}: failed to retrieve order ${data.order_id}: ${
        (error as Error).message
      }`
    )
    return
  }

  if (!order.email) {
    logger.warn(
      `${ARTWORK_STAGE_EVENT}: order ${data.order_id} has no customer email; skipping ${toStage} notification.`
    )
    return
  }

  const displayId = (order as { display_id?: string | number }).display_id ?? data.order_id
  const firstName = order.shipping_address?.first_name ?? null

  // Dedup via Medusa's built-in idempotency_key on the notification table.
  // A UNIQUE index on (idempotency_key WHERE deleted_at IS NULL) means two
  // parallel createNotifications calls race at the DB level — exactly one
  // INSERT wins, the other hits the unique constraint and the notification
  // module silently skips it. No locks, no metadata stamps, no race window.
  // Key includes the transition's changed_at so redelivery of the SAME event
  // dedupes, but a deliberate rewind → re-advance (revised proof re-send)
  // is a new transition with a new timestamp and emails again.
  const idempotencyKey = `artwork-email:${data.order_id}:${toStage}${
    data.changed_at ? `:${data.changed_at}` : ""
  }`

  // Inline helper for the generic stage-update fallback. Used directly for
  // non-approval stages, and as a backstop when the awaiting_approval flow
  // can't build a signed approval URL (e.g. STOREFRONT_URL unset on Railway).
  const sendGenericStageEmail = async () => {
    await notificationModuleService.createNotifications({
      to: order.email,
      channel: "email",
      template: EmailTemplates.ORDER_PRODUCTION_STAGE,
      idempotency_key: idempotencyKey,
      data: {
        emailOptions: {
          replyTo: SUPPORT_REPLY_TO_EMAIL,
          subject: subjectForStage(toStage, displayId),
        },
        order,
        stage: toStage,
        customerFirstName: firstName,
        portalUrl: tagUrl(buildPortalUrl(data.order_id), {
          medium: "transactional",
          campaign: `artwork_stage_${toStage}`,
          content: "view_order",
        }),
      },
    })
  }

  try {
    // Preferred path for awaiting_approval: the dedicated approval email with
    // a signed one-click "Approve" button and mockups. Falls back to the
    // generic stage email when no approval link can be built (e.g.
    // STOREFRONT_URL unset) so the customer still hears their proof is ready.
    const sent =
      toStage === "awaiting_approval" &&
      (await sendProofEmail(container, order, { idempotencyKey }))
    if (!sent) {
      if (toStage === "awaiting_approval") {
        logger.warn(
          `${ARTWORK_STAGE_EVENT}: cannot build approval URL (STOREFRONT_URL unset?); sending generic stage email for ${data.order_id} instead. Fix env to restore one-click approve.`
        )
      }
      await sendGenericStageEmail()
    }
  } catch (error) {
    logger.error(
      `${ARTWORK_STAGE_EVENT}: failed to send artwork email (${toStage}) for order ${data.order_id}: ${
        (error as Error).message
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: ARTWORK_STAGE_EVENT,
}
