/**
 * Backfill `metadata.decoration_pricing_class` across the catalog from fabric
 * composition — rule in lib/decoration-pricing-class.ts (≥80% polyester →
 * "supacolour", technical fabrics → "quote_only", else standard DTF). Reads
 * material, title, type and the description. New products are classified by
 * subscribers/product-created-pricing-class.ts; this is for the back catalogue.
 *
 * Never overwrites an existing class (staff decisions win). Skips internal
 * service products. DRY_RUN=1 previews.
 *
 * Usage:
 *   DRY_RUN=1 npx medusa exec src/scripts/backfill-decoration-pricing-class.ts
 *   npx medusa exec src/scripts/backfill-decoration-pricing-class.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { classifyDecorationPricing } from "../lib/decoration-pricing-class"

export default async function backfillDecorationPricingClass({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }
  const dryRun = process.env.DRY_RUN === "1"

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "material", "description", "metadata", "type.value"],
    filters: { status: "published" },
    pagination: { take: 100000 },
  })

  let supa = 0
  let quoteOnly = 0
  let skippedExisting = 0
  const reviewList: string[] = []
  for (const product of products as Array<{
    id: string
    title: string | null
    handle: string | null
    material: string | null
    description: string | null
    metadata: Record<string, unknown> | null
    type?: { value?: string | null } | null
  }>) {
    const meta = (product.metadata ?? {}) as Record<string, unknown>
    if (meta.internal_service === true) continue
    if (meta.decoration_pricing_class !== undefined && meta.decoration_pricing_class !== null) {
      skippedExisting++
      continue
    }
    const { cls, reason } = classifyDecorationPricing({
      title: product.title,
      material: product.material,
      description: product.description,
      type: product.type?.value,
    })
    if (!cls) {
      if (reason === "no polyester % stated") reviewList.push(`${product.title} (${product.handle})`)
      continue
    }
    if (cls === "supacolour") supa++
    else quoteOnly++
    if (dryRun) {
      logger.info(`[backfill-pricing-class] DRY RUN ${cls}: ${product.title} — ${reason}`)
      continue
    }
    // Read-modify-write: bare metadata updates REPLACE the jsonb blob.
    await productModule.updateProducts(product.id, {
      metadata: { ...meta, decoration_pricing_class: cls },
    })
  }

  logger.info(
    `[backfill-pricing-class] ${dryRun ? "DRY RUN — " : ""}supacolour: ${supa}, quote_only: ${quoteOnly}, ` +
      `already-set skipped: ${skippedExisting}, scanned: ${products.length}.`
  )
  if (reviewList.length) {
    logger.info(
      `[backfill-pricing-class] REVIEW LIST (${reviewList.length} products, no fabric data — classify via the product widget):`
    )
    for (const item of reviewList) logger.info(`  - ${item}`)
  }
  if (!dryRun) {
    logger.info(
      "[backfill-pricing-class] Storefront product caches refresh within ~10 min; purge via revalidate-products for immediate effect."
    )
  }
}
