import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const PAGE_SIZE = 500

type VariantRecord = {
  id: string
  manage_inventory?: boolean | null
}

export default async function disableInventoryTracking({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (args: Record<string, unknown>) => Promise<{ data?: VariantRecord[] }>
  }
  const productModuleService = container.resolve(Modules.PRODUCT) as {
    updateProductVariants?: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }

  if (typeof productModuleService.updateProductVariants !== "function") {
    throw new Error("Product module method updateProductVariants is unavailable")
  }

  const apply = process.env.APPLY === "1"
  let offset = 0

  const variantIdsToUpdate: string[] = []
  let totalVariants = 0

  while (true) {
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "manage_inventory"],
      pagination: {
        take: PAGE_SIZE,
        skip: offset,
      },
    })

    const page = variants ?? []
    if (!page.length) {
      break
    }

    totalVariants += page.length
    for (const variant of page) {
      if (variant.manage_inventory === false) {
        continue
      }
      variantIdsToUpdate.push(variant.id)
    }

    offset += PAGE_SIZE
  }

  logger.info(
    `Inventory tracking update (${apply ? "APPLY" : "DRY RUN"}): total variants=${totalVariants}, to_disable=${variantIdsToUpdate.length}`
  )

  if (!apply) {
    logger.info("Dry run only. Re-run with APPLY=1 to apply changes.")
    return
  }

  for (const id of variantIdsToUpdate) {
    await productModuleService.updateProductVariants(id, {
      manage_inventory: false,
    })
  }

  logger.info(`Done. Disabled inventory tracking on ${variantIdsToUpdate.length} variants.`)
}
