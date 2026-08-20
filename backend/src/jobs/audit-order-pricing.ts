import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import auditOrderPricing from "../scripts/audit-order-pricing"

/**
 * Daily order-pricing audit (Phase 4 of pricing integrity). Read-only sweep
 * of the last 48h of orders comparing charged vs expected line prices via
 * the same evaluation the checkout invariant runs; stamps
 * `order.metadata.pricing_audit` and emits `order_pricing_audit_flagged`
 * PostHog events. Always-on housekeeping (no sends, no env gate) — same
 * policy as expire-pos-sessions.
 *
 * 07:00 UTC = 17:00 AEST, after the day's trading and the 06:00 tier regen.
 */
export default async function auditOrderPricingJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info("[audit-order-pricing] starting scheduled run")
  try {
    await auditOrderPricing({ container } as never)
  } catch (err: any) {
    logger.error(
      `[audit-order-pricing] failed — ${err?.message ?? err}\n${err?.stack ?? ""}`
    )
  }
}

export const config = {
  name: "audit-order-pricing",
  schedule: "0 7 * * *",
}
