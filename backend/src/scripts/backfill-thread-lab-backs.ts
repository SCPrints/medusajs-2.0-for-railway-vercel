/**
 * Backfill `variant.metadata.garment_images.back` for Thread Lab products.
 *
 * Their importer only knew a back when Shopify assigned a SECOND image to the
 * colour, but Shopify assigns only the front — the flat back is an unassigned
 * `<front stem>-1`. With no `back`, the Studio's back mockup used the first
 * other image in the gallery (a front-facing model photo). See
 * `findSiblingBack` in thread-lab-images.ts.
 *
 * Only variants with a front and no back are touched; metadata is merged
 * (never replaced); images themselves are not touched. Idempotent.
 *
 * DRY_RUN=1 previews. Fly: cd /app/.medusa/server &&
 *   DRY_RUN=1 npx medusa exec src/scripts/backfill-thread-lab-backs.js
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"

import { revalidateStorefrontTags } from "../lib/storefront-revalidate"
import { findSiblingBack } from "./thread-lab-images"

export default async function backfillThreadLabBacks({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "variants.id", "variants.title", "variants.metadata"],
    filters: { handle: { $like: "thread-lab-%" } },
  })

  const updates: Array<{ id: string; metadata: Record<string, unknown> }> = []
  for (const p of products) {
    for (const v of p.variants ?? []) {
      const gi = v.metadata?.garment_images
      if (!gi || typeof gi !== "object" || !gi.front || gi.back) continue
      const back = findSiblingBack(gi.front, Array.isArray(gi.all) ? gi.all : [])
      if (!back) {
        logger.warn(`${p.handle} / ${v.title}: no back sibling found`)
        continue
      }
      logger.info(`${p.handle} / ${v.title}: back = ${back.split("/").pop()}`)
      updates.push({ id: v.id, metadata: { ...v.metadata, garment_images: { ...gi, back } } })
    }
  }

  logger.info(`${updates.length} variants to update${dryRun ? " (DRY_RUN, nothing written)" : ""}`)
  if (dryRun || !updates.length) return

  for (let i = 0; i < updates.length; i += 25) {
    await updateProductVariantsWorkflow(container).run({
      input: { product_variants: updates.slice(i, i + 25) },
    })
  }
  await revalidateStorefrontTags(["products"], logger)
}
