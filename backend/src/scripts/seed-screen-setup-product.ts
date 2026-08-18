/**
 * Create the hidden "Screen Printing Setup" service product — one variant at
 * $99 inc GST per screen. The customizer adds this variant as a separate cart
 * line with quantity = number of screens (colours incl. underbase × screen
 * positions). Copy the printed VARIANT id into the storefront env:
 *
 *   NEXT_PUBLIC_SCREEN_SETUP_VARIANT_ID=<variant id>
 *
 * Mirrors the vectorization-service product conventions: digital (no
 * shipping/inventory), excluded from bulk aggregation so the cart recompute
 * never re-tiers its price, not listed in the catalog.
 *
 * Idempotent: skips creation if the handle already exists (prints the
 * existing variant id instead).
 *
 * Usage: npx medusa exec src/scripts/seed-screen-setup-product.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

const HANDLE = "screen-printing-setup-fee"
const SETUP_PER_SCREEN_MAJOR = 99 // inc GST — keep in sync with scp-screen-print-pricing.ts

export default async function seedScreenSetupProduct({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "variants.id"],
    filters: { handle: HANDLE },
  })
  if (existing?.length) {
    const variantId = (existing[0] as any)?.variants?.[0]?.id
    logger.info(
      `[seed-screen-setup] Product already exists (${HANDLE}). NEXT_PUBLIC_SCREEN_SETUP_VARIANT_ID=${variantId}`
    )
    return
  }

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
    filters: {},
  })
  const channelIds = (channels as Array<{ id: string }>).map((c) => c.id)

  const { result } = await createProductsWorkflow(container as any).run({
    input: {
      products: [
        {
          title: "Screen Printing Setup (per screen)",
          handle: HANDLE,
          status: "published" as const,
          // Internal service line: reachable by variant id only. Not tagged
          // into any category/collection so it never renders in listings.
          description:
            "Screen setup fee — one screen per ink colour per print position. Added automatically when a design uses screen printing.",
          options: [{ title: "Type", values: ["Standard"] }],
          sales_channels: channelIds.map((id) => ({ id })),
          variants: [
            {
              title: "Standard",
              sku: "SCREEN-SETUP",
              options: { Type: "Standard" },
              manage_inventory: false,
              allow_backorder: true,
              prices: [{ amount: SETUP_PER_SCREEN_MAJOR, currency_code: "aud" }],
              metadata: {
                // The cart-wide SCP recompute must never re-tier this line.
                exclude_from_bulk_aggregation: true,
                service_line: "screen_setup",
              },
            },
          ],
          metadata: { internal_service: true, service_line: "screen_setup" },
        },
      ],
    },
  })

  const created = (result as any)?.[0]
  const variantId = created?.variants?.[0]?.id
  logger.info(
    `[seed-screen-setup] Created product ${created?.id}. Set NEXT_PUBLIC_SCREEN_SETUP_VARIANT_ID=${variantId} on the storefront (Vercel env) and redeploy.`
  )
}
