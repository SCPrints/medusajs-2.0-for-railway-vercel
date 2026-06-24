import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Configure Australian GST (10%) on the existing prod DB.
 *
 * The original `seed.ts` created the AU tax region with NO default rate, so
 * Medusa produced zero tax lines and every order collected $0 GST despite the
 * storefront's "ex GST" labels (which imply GST is added on top). This script
 * back-fills the missing config on a live database:
 *
 *   1. Ensure an AU tax region exists (provider `tp_system`).
 *   2. Ensure it has a DEFAULT tax rate of 10% named "GST".
 *   3. Ensure the AUD region calculates taxes automatically.
 *
 * Tax-EXCLUSIVE model (prices stay ex-GST, 10% is added at checkout) — matches
 * the storefront labels and the `is_tax_inclusive: false` on existing lines.
 *
 * Idempotent + safe to re-run: it only writes when something is missing or
 * drifted. Re-running once GST is correct is a no-op.
 *
 * Usage (local):
 *   npx medusa exec ./src/scripts/setup-au-gst.ts
 * Fly (prod), after `cd backend && fly deploy`:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec ./src/scripts/setup-au-gst.js
 *
 * After running, purge the storefront cache so cart/checkout re-fetch with tax:
 *   POST {storefront}/api/revalidate-products  (Bearer $REVALIDATE_SECRET)
 *   — or just place a fresh test order; new carts compute GST immediately.
 */

const GST_RATE = 10
const GST_NAME = "GST"
const GST_CODE = "GST"

export default async function setupAuGst({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const tax = container.resolve(Modules.TAX) as any
  const region = container.resolve(Modules.REGION) as any

  logger.info("[setup-au-gst] starting")

  // 1) AU tax region ----------------------------------------------------------
  let taxRegions = await tax.listTaxRegions({ country_code: "au" })
  if (!taxRegions?.length) {
    const created = await tax.createTaxRegions([
      { country_code: "au", provider_id: "tp_system" },
    ])
    taxRegions = Array.isArray(created) ? created : [created]
    logger.info("[setup-au-gst] created AU tax region")
  }
  const auTax = taxRegions[0]

  // 2) Default GST rate -------------------------------------------------------
  const rates = await tax.listTaxRates({ tax_region_id: auTax.id })
  const existingDefault = (rates ?? []).find((r: any) => r.is_default)

  if (!existingDefault) {
    await tax.createTaxRates([
      {
        tax_region_id: auTax.id,
        name: GST_NAME,
        code: GST_CODE,
        rate: GST_RATE,
        is_default: true,
      },
    ])
    logger.info(`[setup-au-gst] created default GST rate ${GST_RATE}%`)
  } else if (Number(existingDefault.rate) !== GST_RATE) {
    await tax.updateTaxRates(existingDefault.id, {
      rate: GST_RATE,
      name: GST_NAME,
      code: GST_CODE,
    })
    logger.info(
      `[setup-au-gst] updated default rate ${existingDefault.rate}% → ${GST_RATE}%`
    )
  } else {
    logger.info(
      `[setup-au-gst] default GST rate already ${GST_RATE}% — no change`
    )
  }

  // 3) Automatic taxes on the AUD region -------------------------------------
  const regions = await region.listRegions({ currency_code: "aud" })
  for (const r of regions ?? []) {
    if (r.automatic_taxes !== true) {
      await region.updateRegions(r.id, { automatic_taxes: true })
      logger.info(`[setup-au-gst] set automatic_taxes=true on "${r.name}"`)
    } else {
      logger.info(`[setup-au-gst] automatic_taxes already on for "${r.name}"`)
    }
  }

  logger.info("[setup-au-gst] done")
}
