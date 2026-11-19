import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

import { SYSTEM_PAYMENT_PROVIDER } from "../lib/org-account"

/**
 * Pay on account needs Medusa's manual payment provider (pp_system_default)
 * enabled on the AUD region: createPaymentSessionsWorkflow refuses a provider
 * the region doesn't list. This adds it, keeping every provider already there.
 * Idempotent. `DRY_RUN=1` only prints.
 *
 * Safe to enable: the store API refuses that provider for everyone except an
 * owner/purchaser of an organisation with account terms switched on
 * (api/middlewares/org-checkout-guard.ts), and the storefront never lists it.
 *
 *   cd /app/.medusa/server && DRY_RUN=1 npx medusa exec src/scripts/enable-account-terms-payment.js
 */
export default async function enableAccountTermsPayment({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const dryRun = process.env.DRY_RUN === "1"

  const { data: providers } = await query.graph({
    entity: "payment_provider",
    fields: ["id", "is_enabled"],
  })
  const provider = (providers as any[]).find((p) => p.id === SYSTEM_PAYMENT_PROVIDER)
  if (!provider || provider.is_enabled === false) {
    logger.error(`${SYSTEM_PAYMENT_PROVIDER} is not registered / enabled in the payment module. Nothing changed.`)
    return
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "payment_providers.id"],
  })
  for (const region of (regions as any[]).filter((r) => String(r.currency_code).toLowerCase() === "aud")) {
    const current: string[] = (region.payment_providers ?? []).map((p: any) => p.id)
    if (current.includes(SYSTEM_PAYMENT_PROVIDER)) {
      logger.info(`Region "${region.name}": already has ${SYSTEM_PAYMENT_PROVIDER} (${current.join(", ")}).`)
      continue
    }
    const next = [...current, SYSTEM_PAYMENT_PROVIDER]
    logger.info(`Region "${region.name}": ${current.join(", ") || "(none)"} → ${next.join(", ")}${dryRun ? "  [dry run]" : ""}`)
    if (dryRun) continue
    await updateRegionsWorkflow(container).run({
      input: { selector: { id: region.id }, update: { payment_providers: next } },
    })
  }
  logger.info(dryRun ? "Dry run: nothing written." : "Done.")
}
