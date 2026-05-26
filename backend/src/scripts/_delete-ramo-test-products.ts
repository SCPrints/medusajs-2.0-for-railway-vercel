/**
 * Local-only cleanup for the 5-product Ramo dry-run test. Deletes every
 * product whose handle starts with "ramo-" so we can re-import after
 * fixing the classifier. Idempotent (no-op if nothing matches).
 *
 * Usage: npx medusa exec src/scripts/_delete-ramo-test-products.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

export default async function deleteRamoTestProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: { $like: "ramo-%" } },
    pagination: { take: 500 },
  })
  const rows = (data ?? []) as Array<{ id: string; handle: string }>

  if (!rows.length) {
    logger.info("No ramo-prefixed products to delete.")
    return
  }

  logger.info(`Deleting ${rows.length} ramo-prefixed product(s)...`)
  for (const r of rows) {
    logger.info(`  - ${r.handle}`)
  }

  await deleteProductsWorkflow(container).run({
    input: { ids: rows.map((r) => r.id) },
  })

  logger.info("Done.")
}
