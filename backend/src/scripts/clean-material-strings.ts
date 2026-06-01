/**
 * One-off cleanup: normalise every product's `material` column through
 * `cleanMaterialString`, stripping feature/spec prose that bled into the
 * fabric value during the supplier-description extraction (AP / Ramo / DNC).
 *
 * Symptom this fixes: the PDP "Material" line showed
 *   "160gm 100% Polyester Features: Mini waffle knit Dri-wear antibacterial ..."
 * instead of just "160gm 100% Polyester".
 *
 * Idempotent: only writes rows whose cleaned value differs from the stored
 * value. Re-running after the extractors were fixed is a no-op.
 *
 * Usage:
 *   DRY_RUN=1 npx medusa exec src/scripts/clean-material-strings.ts
 *   # then drop DRY_RUN to apply, and reindex Meili afterwards.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { cleanMaterialString } from "../lib/material-text"

const BATCH = 200

export default async function cleanMaterialStrings({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT)

  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"
  logger.info(`[clean-material] Starting (dry_run=${dryRun})`)

  let offset = 0
  let changed = 0
  let cleared = 0
  let unchanged = 0

  while (true) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "material"],
      pagination: { take: BATCH, skip: offset },
      filters: { status: "published" },
    })
    if (!products.length) break

    for (const product of products as any[]) {
      const current = product.material
      if (typeof current !== "string" || !current.trim()) continue

      const cleaned = cleanMaterialString(current)

      if (cleaned === current) {
        unchanged++
        continue
      }

      if (cleaned === null) {
        // The whole value was feature prose with no real composition — rare,
        // but blank it rather than keep junk on the PDP.
        cleared++
        logger.warn(`[clean-material] ${product.handle}: clearing junk material "${current.slice(0, 60)}"`)
        if (!dryRun) await productModule.updateProducts(product.id, { material: null })
        continue
      }

      changed++
      logger.info(`[clean-material] ${product.handle}: "${current.slice(0, 50)}..." -> "${cleaned}"`)
      if (!dryRun) await productModule.updateProducts(product.id, { material: cleaned })
    }

    offset += products.length
    if (products.length < BATCH) break
  }

  logger.info(
    `[clean-material] Done — cleaned=${changed}, cleared=${cleared}, unchanged=${unchanged} (dry_run=${dryRun})`
  )
}
