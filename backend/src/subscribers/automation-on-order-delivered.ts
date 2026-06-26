import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { AUTOMATION_EXPANDED_TRIGGERS_ENABLED } from "../lib/constants"
import {
  PRODUCTION_STAGE_EVENT,
  type ProductionStageChangedEvent,
} from "../lib/production-stage"
import { runRulesForEvent } from "../services/automation-rules/evaluate"
import { getCustomerLtv } from "../services/customer-ltv/get-ltv"

/**
 * Phase 10 — listens on the existing PRODUCTION_STAGE_EVENT but only
 * fires for `to_stage === "delivered"`. Hydrates the same lifetime
 * value + order count fields as automation-on-order-placed so
 * conditions feel consistent between triggers.
 */
export default async function automationOnOrderDelivered({
  event: { data },
  container,
}: SubscriberArgs<ProductionStageChangedEvent>) {
  if (!AUTOMATION_EXPANDED_TRIGGERS_ENABLED) return
  if (data?.to_stage !== "delivered") return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orderId = data?.order_id
  if (!orderId) return

  let order: any = null
  try {
    const orderModule = container.resolve(Modules.ORDER) as any
    order = await orderModule.retrieveOrder(orderId)
  } catch (err: any) {
    logger.warn(
      `automation-on-order-delivered: retrieve failed for ${orderId}: ${err?.message ?? err}`
    )
    return
  }

  // Best-effort LTV + order count — shares getCustomerLtv with
  // automation-on-order-placed so both triggers compute it identically.
  let lifetimeValue = 0
  let orderCount = 0
  const customerId = order?.customer_id ?? null
  if (customerId) {
    try {
      const ltv = await getCustomerLtv(container, customerId)
      lifetimeValue = ltv.lifetime_value
      orderCount = ltv.order_count
    } catch {
      /* soft fail — conditions on these fields just won't match */
    }
  }

  const payload = {
    order_id: orderId,
    customer_id: customerId,
    total: Number.parseFloat(String(order?.total ?? "0")) || 0,
    currency_code: order?.currency_code ?? null,
    from_stage: data.from_stage,
    to_stage: data.to_stage,
    changed_at: data.changed_at,
    changed_by: data.changed_by,
    lifetime_value: lifetimeValue,
    order_count: orderCount,
  }

  await runRulesForEvent(container, "order.delivered", payload)
}

export const config: SubscriberConfig = {
  event: PRODUCTION_STAGE_EVENT,
}
