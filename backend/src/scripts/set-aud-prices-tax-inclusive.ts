import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * HOLD-price GST cutover: mark all AUD prices as TAX-INCLUSIVE.
 *
 * Business decision 2026-07-31 (see Docs/GST_INC_PRICING_SCOPE.md §1): the
 * displayed sticker becomes the inc-GST price — SC Prints absorbs the GST
 * rather than grossing every price up 10%. NO stored amount changes anywhere;
 * this flips the price preference so Medusa treats every AUD amount as
 * GST-inclusive and backs the 10% out for tax lines (total ÷ 11), instead of
 * adding 10% on top.
 *
 * The 10% AU tax rate and `automatic_taxes` stay exactly as `setup-au-gst.ts`
 * left them — inclusive pricing still needs the rate to compute the embedded
 * GST for tax invoices.
 *
 * Idempotent: safe to re-run; a second run is a no-op.
 * DRY_RUN=1 prints what would change without writing.
 *
 * Usage (local):
 *   npx medusa exec ./src/scripts/set-aud-prices-tax-inclusive.ts
 * Fly (prod), at cutover:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec ./src/scripts/set-aud-prices-tax-inclusive.js
 *
 * ROLLBACK: run again with ROLLBACK=1 — flips the preference back to
 * tax-exclusive. Amounts were never touched, so rollback is complete.
 *
 * After running (either direction): purge the storefront cache
 * (POST {storefront}/api/revalidate-products with Bearer $REVALIDATE_SECRET)
 * so cached carts/PDPs re-fetch under the new preference.
 */

export default async function setAudPricesTaxInclusive({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pricing = container.resolve(Modules.PRICING) as any

  const dryRun = process.env.DRY_RUN === "1"
  const rollback = process.env.ROLLBACK === "1"
  const target = !rollback // true = inclusive (cutover), false = exclusive (rollback)
  const tag = "[set-aud-prices-tax-inclusive]"

  logger.info(
    `${tag} starting — target is_tax_inclusive=${target}${dryRun ? " (DRY RUN)" : ""}`
  )

  const prefs = await pricing.listPricePreferences({})
  logger.info(
    `${tag} existing preferences: ${
      prefs.length
        ? prefs
            .map(
              (p: any) =>
                `${p.attribute}=${p.value} inc=${p.is_tax_inclusive} (${p.id})`
            )
            .join("; ")
        : "(none)"
    }`
  )

  const audPref = prefs.find(
    (p: any) =>
      p.attribute === "currency_code" &&
      String(p.value).toLowerCase() === "aud"
  )

  if (audPref && audPref.is_tax_inclusive === target) {
    logger.info(`${tag} already is_tax_inclusive=${target} — nothing to do`)
    return
  }

  if (dryRun) {
    logger.info(
      audPref
        ? `${tag} DRY RUN: would update ${audPref.id} → is_tax_inclusive=${target}`
        : `${tag} DRY RUN: would create currency_code=aud preference with is_tax_inclusive=${target}`
    )
    return
  }

  if (audPref) {
    await pricing.updatePricePreferences(
      { id: audPref.id },
      { is_tax_inclusive: target }
    )
    logger.info(`${tag} updated ${audPref.id} → is_tax_inclusive=${target}`)
  } else {
    const created = await pricing.createPricePreferences([
      { attribute: "currency_code", value: "aud", is_tax_inclusive: target },
    ])
    const row = Array.isArray(created) ? created[0] : created
    logger.info(`${tag} created ${row.id} (currency_code=aud, inc=${target})`)
  }

  logger.info(
    `${tag} done. Next: deploy the storefront label changes, purge the product cache, place a verification order (Docs/GST_INC_PRICING_SCOPE.md §7).`
  )
}
