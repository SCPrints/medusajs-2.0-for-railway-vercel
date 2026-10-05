/**
 * Create the hidden "Custom service line" product — a $0 variant whose price
 * is always set by the line that carries it. The Job pricer puts it on quote
 * lines that have no catalogue product (decoration on customer-supplied
 * garments, UV DTF gang sheets, extras like colour changes or freight) so
 * those lines carry a variant id and survive quote → cart / order; a line
 * without a variant is skipped by both the accept and convert-to-order paths.
 *
 * Same conventions as the setup-fee products: digital (no shipping /
 * inventory), excluded from bulk aggregation so the cart recompute never
 * re-tiers it, `internal_service` so search + listings drop it. Run
 * hide-internal-service-products.ts afterwards to park it in the Internal
 * Services channel.
 *
 * Idempotent: skips creation if the handle already exists.
 *
 * Usage: npx medusa exec src/scripts/seed-service-line-product.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

export const SERVICE_LINE_HANDLE = "custom-service-line"

export default async function seedServiceLineProduct({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "variants.id"],
    filters: { handle: SERVICE_LINE_HANDLE },
  })
  if (existing?.length) {
    logger.info(`[seed-service-line] Product already exists (${SERVICE_LINE_HANDLE}), variant ${(existing[0] as any)?.variants?.[0]?.id}`)
    return
  }

  const { result } = await createProductsWorkflow(container as any).run({
    input: {
      products: [
        {
          title: "Custom service / decoration line",
          handle: SERVICE_LINE_HANDLE,
          status: "published" as const,
          description:
            "Internal service line — carries a quoted price for decoration on customer-supplied garments, UV DTF sheets, and extras. Price is set per line by the Job pricer.",
          options: [{ title: "Type", values: ["Standard"] }],
          variants: [
            {
              title: "Standard",
              sku: "SERVICE-LINE",
              options: { Type: "Standard" },
              manage_inventory: false,
              allow_backorder: true,
              prices: [{ amount: 0, currency_code: "aud" }],
              metadata: { exclude_from_bulk_aggregation: true, service_line: "custom_service" },
            },
          ],
          metadata: { internal_service: true, service_line: "custom_service" },
        },
      ],
    },
  })

  const created = (result as any)?.[0]
  logger.info(`[seed-service-line] Created product ${created?.id}, variant ${created?.variants?.[0]?.id}. Run hide-internal-service-products.ts to park it in the Internal Services channel.`)
}
