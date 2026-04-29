/**
 * Delete every product via deleteProductsWorkflow (Admin API–parity; handles variants, links, etc.).
 *
 * Usage (from `backend/`):
 *   pnpm run delete-all-products           # dry run: count only
 *   pnpm run delete-all-products -- --apply
 *
 * Env: DELETE_PRODUCTS_APPLY=1 also enables apply.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

const PAGE_SIZE = 200
const DELETE_BATCH_SIZE = 50

type ProductRow = { id: string }

const chunk = <T>(values: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size))
  }
  return out
}

export default async function deleteAllProducts({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (args: Record<string, unknown>) => Promise<{ data?: ProductRow[] }>
  }

  const apply =
    args.includes("--apply") ||
    process.argv.includes("--apply") ||
    process.env.DELETE_PRODUCTS_APPLY === "1" ||
    process.env.DELETE_PRODUCTS_APPLY === "true"

  let total = 0
  let offset = 0
  while (true) {
    const { data: page } = await query.graph({
      entity: "product",
      fields: ["id"],
      pagination: { take: PAGE_SIZE, skip: offset },
    })
    const batch = page ?? []
    if (!batch.length) {
      break
    }
    total += batch.length
    offset += PAGE_SIZE
  }

  if (!apply) {
    logger.info(
      `delete-all-products (dry run): ${total} product(s) would be deleted. Re-run with --apply.`
    )
    return
  }

  if (!total) {
    logger.info("delete-all-products: no products to delete.")
    return
  }

  let deleted = 0
  while (true) {
    const { data: page } = await query.graph({
      entity: "product",
      fields: ["id"],
      pagination: { take: PAGE_SIZE, skip: 0 },
    })
    const batch = page ?? []
    if (!batch.length) {
      break
    }

    const ids = batch.map((p) => p.id)
    const idChunks = chunk(ids, DELETE_BATCH_SIZE)
    for (const idsChunk of idChunks) {
      await deleteProductsWorkflow(container).run({ input: { ids: idsChunk } })
      deleted += idsChunk.length
      logger.info(`delete-all-products: deleted ${deleted} / ${total} …`)
    }
  }

  logger.info(`delete-all-products: finished; deleted ${deleted} product(s).`)
}
