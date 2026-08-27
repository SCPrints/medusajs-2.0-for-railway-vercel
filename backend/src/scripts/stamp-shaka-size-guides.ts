/**
 * One-off: stamp `metadata.size_guide = { images, tips }` on the 6 Shaka Wear
 * products. Charts are Prime Example's per-cut size charts (self-hosted on R2
 * under shaka-wear/size-charts/, uploaded 2026-08-27); tips are Prime
 * Example's own fit guidance, which they asked us to copy (supplier feedback,
 * Sam @ Prime Example, 2026-08-27).
 *
 * The storefront renders this via the SizeGuide component in ProductInfo —
 * the shape is generic, any supplier can adopt it.
 *
 * Usage:
 *   # Prod:  cd /app/.medusa/server && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/stamp-shaka-size-guides.js
 *            (re-run without IMPORT_DRY_RUN to write)
 *
 * Idempotent: rewrites the same block; safe to re-run.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { revalidateStorefrontTags } from "../lib/storefront-revalidate"

const R2 = "https://pub-4b98c1b8d55d4d9597ff5cfac6aa611a.r2.dev/shaka-wear/size-charts"

const GUIDES: Record<string, { images: string[]; tips: string[] }> = {
  "shaka-wear-max-heavyweight-tee": {
    images: [`${R2}/10M-001_SizeChart.png`],
    tips: [
      "Fits true to size — take your normal size for a tighter fit.",
      "For an oversized look we recommend going one size up.",
      "Standard width and length.",
    ],
  },
  "shaka-wear-max-heavyweight-garment-dye-tee": {
    images: [`${R2}/10M-002_SizeChart.jpg`],
    tips: [
      "Fits slightly oversized on the chest and length — take your normal size for a slightly looser fit.",
      "Slightly oversized sleeves.",
    ],
  },
  "shaka-wear-garment-dye-drop-shoulder-tee": {
    images: [`${R2}/10M-003_SizeChart.jpg`],
    tips: [
      "Oversized width and shoulders with a shorter length.",
      "We recommend sizing down for the ideal oversized look.",
    ],
  },
  "shaka-wear-max-heavyweight-oversized-tee": {
    images: [`${R2}/10M-005_SizeChart.jpg`, `${R2}/10M-005_FitGuide.jpg`],
    tips: [
      "Take your usual size for a relaxed oversized fit.",
      "Prefer a slightly cleaner shape? Size down for a trimmer body while keeping the signature wide sleeves.",
      "Oversized width, shorter length.",
    ],
  },
  "shaka-wear-max-heavyweight-cropped-tee": {
    images: [`${R2}/10M-006_SizeChart.jpg`],
    tips: [
      "True to size for a relaxed, cropped and boxy fit — size up for a more oversized look.",
      "Redesigned in August 2026 with a more relaxed, boxy silhouette than previous releases.",
    ],
  },
  "shaka-wear-max-heavyweight-long-sleeve-tee": {
    images: [`${R2}/10M-104_SizeChart.jpg`],
    tips: [
      "Keep it true to size for a tailored feel, or size up for a slightly oversized look.",
    ],
  },
}

export default async function run({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as any
  const dryRun = process.env.IMPORT_DRY_RUN === "1"

  let wrote = false
  for (const [handle, size_guide] of Object.entries(GUIDES)) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "metadata"],
      filters: { handle },
    })
    const product = (data ?? [])[0]
    if (!product) {
      logger.warn(`shaka-size-guides: product not found for handle ${handle} — skipped`)
      continue
    }
    const meta = ((product as any).metadata ?? {}) as Record<string, unknown>
    if (JSON.stringify(meta.size_guide) === JSON.stringify(size_guide)) {
      logger.info(`shaka-size-guides ${handle}: already stamped — no change`)
      continue
    }
    if (!dryRun) {
      // read-modify-write: Medusa metadata updates REPLACE the whole jsonb
      await productModule.updateProducts(product.id, {
        metadata: { ...meta, size_guide },
      })
      wrote = true
    }
    logger.info(
      `shaka-size-guides ${handle}${dryRun ? " (dry-run)" : ""}: stamped ${size_guide.images.length} chart(s) + ${size_guide.tips.length} tip(s)`
    )
  }

  if (wrote) {
    const purged = await revalidateStorefrontTags(["products"], logger)
    logger.info(`shaka-size-guides: storefront cache purge ${purged ? "ok" : "skipped/failed"}`)
  }
}
