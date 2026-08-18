/**
 * Backfill `metadata.screen_heavy = true` on products whose type indicates a
 * heavy garment (hoodies / sweats / fleece / poly) — the supplier charges
 * +$0.60/print to screen print these, passed through as +$1.00 retail.
 *
 * Type-based first pass only; staff refine per product via the "Heavy
 * garment" checkbox on the product print-profile widget. Never *clears* the
 * flag (staff decisions win), only adds it where missing.
 *
 * Usage:
 *   DRY_RUN=1 npx medusa exec src/scripts/backfill-screen-heavy-flag.ts
 *   npx medusa exec src/scripts/backfill-screen-heavy-flag.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const HEAVY_TYPE_VALUES = new Set(
  [
    "Hoodies",
    "Zip Up Hoodies",
    "Active Hoods",
    "Crewneck Sweatshirts",
    "Quarter Zips",
    "Track Pants",
  ].map((v) => v.toLowerCase())
)

// Title cues for products without a type match (poly sportswear etc.).
const HEAVY_TITLE_RE = /\bhood(ie|ed)?|fleece|sweat(shirt|er)?|crewneck|polyester|track ?pant/i

export default async function backfillScreenHeavyFlag({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }
  const dryRun = process.env.DRY_RUN === "1"

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "metadata", "type.value"],
    filters: {},
    pagination: { take: 100000 },
  })

  let flagged = 0
  let skippedAlready = 0
  for (const product of products as Array<{
    id: string
    title: string | null
    metadata: Record<string, unknown> | null
    type?: { value?: string | null } | null
  }>) {
    const meta = (product.metadata ?? {}) as Record<string, unknown>
    if (meta.screen_heavy === true) {
      skippedAlready++
      continue
    }
    const typeValue = product.type?.value?.toLowerCase() ?? ""
    const isHeavy =
      HEAVY_TYPE_VALUES.has(typeValue) || HEAVY_TITLE_RE.test(product.title ?? "")
    if (!isHeavy) continue

    flagged++
    if (dryRun) {
      logger.info(
        `[backfill-screen-heavy] DRY RUN would flag: ${product.title} (type: ${product.type?.value ?? "—"})`
      )
      continue
    }
    // Read-modify-write: bare metadata updates REPLACE the jsonb blob.
    await productModule.updateProducts(product.id, {
      metadata: { ...meta, screen_heavy: true },
    })
  }

  logger.info(
    `[backfill-screen-heavy] ${dryRun ? "DRY RUN — " : ""}flagged ${flagged} products (${skippedAlready} already flagged, ${products.length} scanned).`
  )
  if (!dryRun && flagged > 0) {
    logger.info(
      "[backfill-screen-heavy] Storefront caches refresh within 10 min (print-profiles tag TTL); or purge via revalidate-products."
    )
  }
}
