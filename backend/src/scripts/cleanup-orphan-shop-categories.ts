/**
 * Cleanup orphan Shop categories.
 *
 * When the TREE in `shop-categories.ts` changes, the OLD audience-sub
 * categories aren't auto-removed — they just stop being assigned by
 * `assignCategoriesToProducts`. The result is a polluted mens / womens /
 * kids landing page where the storefront shows BOTH the new subs (Pocket
 * Tees, V-Necks, Softshell Jackets) AND the now-orphan old subs (Workwear,
 * Activewear, Pants & Shorts, Tanks & Singlets, Jackets).
 *
 * This script:
 *   1. Walks every category in the DB
 *   2. Computes the current expected handle set from TREE
 *   3. For each Shop category (handle starts with an audience prefix):
 *        - If the handle isn't in the expected set → deactivate it
 *        - If the handle IS in the expected set but the name has changed
 *          (e.g. "Hoodies & Sweatshirts" → "Hoodies") → update the name
 *   4. Logs a summary so staff can see what changed
 *
 * Idempotent — re-run any time. Set `DRY_RUN=1` to preview.
 *
 * Local:    cd backend && npx medusa exec src/scripts/cleanup-orphan-shop-categories.ts
 * Fly.io:   fly ssh console --app sc-prints-backend
 *           cd /app/.medusa/server && npx medusa exec src/scripts/cleanup-orphan-shop-categories.js
 */

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { TREE } from "../lib/shop-categories"

type CategoryRow = {
  id: string
  name: string
  handle: string
  is_active: boolean | null
  parent_category_id: string | null
}

export default async function cleanupOrphanShopCategories({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"

  if (dryRun) logger.info("DRY_RUN=1 — no writes will be performed")

  // Build expected handle/name maps from the live TREE.
  //   expectedNameByHandle: full handle → expected display name
  //   audienceHandles: top-level audience handles (mens, womens, …)
  const expectedNameByHandle = new Map<string, string>()
  const audienceHandles = new Set<string>()
  for (const audience of TREE) {
    expectedNameByHandle.set(audience.handle, audience.name)
    audienceHandles.add(audience.handle)
    for (const sub of audience.children) {
      const fullHandle = `${audience.handle}-${sub.handle}`
      expectedNameByHandle.set(fullHandle, sub.name)
    }
  }

  // Fetch every category.
  const { data } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "handle", "is_active", "parent_category_id"],
  })
  const rows = (data ?? []) as CategoryRow[]
  logger.info(`Found ${rows.length} categories in DB`)

  let orphanCount = 0
  let renamedCount = 0
  let alreadyInactive = 0
  let nonShop = 0
  let failures = 0
  const orphanSample: string[] = []
  const renameSample: string[] = []

  for (const cat of rows) {
    const handle = cat.handle ?? ""

    // Is this a Shop category (handle starts with an audience prefix, OR
    // is a top-level audience)?
    const isAudienceTopLevel = audienceHandles.has(handle)
    const audiencePrefix = [...audienceHandles].find((a) =>
      handle.startsWith(`${a}-`)
    )
    const isShopCategory = isAudienceTopLevel || !!audiencePrefix
    if (!isShopCategory) {
      nonShop++
      continue
    }

    const isExpected = expectedNameByHandle.has(handle)

    if (!isExpected) {
      // Orphan — deactivate it.
      if (cat.is_active === false) {
        alreadyInactive++
        continue
      }
      if (orphanSample.length < 20) {
        orphanSample.push(`  ${handle} (${cat.name})`)
      }
      if (!dryRun) {
        try {
          await productModule.updateProductCategories(cat.id, {
            is_active: false,
          })
          orphanCount++
        } catch (err: any) {
          failures++
          logger.warn(
            `Failed to deactivate ${handle}: ${err?.message ?? err}`
          )
        }
      } else {
        orphanCount++
      }
      continue
    }

    // In TREE — check if name needs refreshing.
    const expectedName = expectedNameByHandle.get(handle)!
    if (cat.name !== expectedName) {
      if (renameSample.length < 20) {
        renameSample.push(
          `  ${handle}: "${cat.name}" → "${expectedName}"`
        )
      }
      if (!dryRun) {
        try {
          await productModule.updateProductCategories(cat.id, {
            name: expectedName,
          })
          renamedCount++
        } catch (err: any) {
          failures++
          logger.warn(
            `Failed to rename ${handle}: ${err?.message ?? err}`
          )
        }
      } else {
        renamedCount++
      }
    }
  }

  logger.info("---")
  if (orphanSample.length > 0) {
    logger.info("Orphan categories deactivated:")
    for (const line of orphanSample) logger.info(line)
    if (orphanCount > orphanSample.length) {
      logger.info(`  …and ${orphanCount - orphanSample.length} more.`)
    }
  }
  if (renameSample.length > 0) {
    logger.info("Renamed categories:")
    for (const line of renameSample) logger.info(line)
    if (renamedCount > renameSample.length) {
      logger.info(`  …and ${renamedCount - renameSample.length} more.`)
    }
  }
  logger.info("---")
  logger.info(`Orphans deactivated:   ${orphanCount}${dryRun ? " (dry-run)" : ""}`)
  logger.info(`Already inactive:      ${alreadyInactive}`)
  logger.info(`Renamed:               ${renamedCount}${dryRun ? " (dry-run)" : ""}`)
  logger.info(`Non-shop (left alone): ${nonShop}`)
  if (failures > 0) logger.info(`Failures:              ${failures}`)
  logger.info("Done.")
}
