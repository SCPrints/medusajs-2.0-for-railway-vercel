/**
 * One-off backfill: extract fabric/composition from Aussie Pacific product
 * descriptions and write it to the native `material` column.
 *
 * AP descriptions contain a paragraph like:
 *   <p>Fabric:<br>160gm 100%<img ...> Polyester</p>
 *
 * The AP importer now extracts this at import time, but existing products were
 * imported before the extractor existed. This script patches them in bulk.
 *
 * Usage:
 *   DRY_RUN=1 pnpm --filter backend medusa exec src/scripts/backfill-aussiepacific-material.ts
 *   # or on Fly:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/backfill-aussiepacific-material.js
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { extractFabricFromHtml } from "./import-aussie-pacific-from-api"

const BATCH = 200

export default async function backfillAussiePacificMaterial({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT)

  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"
  logger.info(`[backfill-ap-material] Starting (dry_run=${dryRun})`)

  let offset = 0
  let updated = 0
  let skipped = 0
  let noFabric = 0

  while (true) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "title", "material", "description", "metadata"],
      pagination: { take: BATCH, skip: offset },
      filters: { status: "published" },
    })

    if (!products.length) break

    for (const product of products as any[]) {
      // Only process AP products
      if ((product.metadata as any)?.source !== "aussiepacific") continue

      // Already has material — skip
      if (product.material && typeof product.material === "string" && product.material.trim()) {
        skipped++
        continue
      }

      const fabric = extractFabricFromHtml(product.description)
      if (!fabric) {
        noFabric++
        logger.warn(`[backfill-ap-material] No fabric found: ${product.handle}`)
        continue
      }

      logger.info(`[backfill-ap-material] ${product.handle}: "${fabric}"`)

      if (!dryRun) {
        await productModule.updateProducts(product.id, { material: fabric })
      }
      updated++
    }

    offset += products.length
    if (products.length < BATCH) break
  }

  logger.info(
    `[backfill-ap-material] Done — updated=${updated}, already_had_material=${skipped}, no_fabric_in_desc=${noFabric} (dry_run=${dryRun})`
  )
}
