import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  NON_TRACKED_VARIANT_DEFAULTS,
  withNonTrackedInventoryDefaults,
} from "./utils/variant-inventory-defaults"

const PAGE_SIZE = 500
const UPDATE_BATCH_SIZE = 200

type VariantRecord = {
  id: string
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
}

const chunk = <T>(values: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size))
  }
  return out
}

export default async function disableInventoryTracking({ container, args }: ExecArgs) {
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

  const apply =
    args.includes("--apply") ||
    process.argv.includes("--apply") ||
    process.env.APPLY === "1" ||
    process.env.APPLY === "true"
  let offset = 0

  const variantIdsToUpdate: string[] = []
  let totalVariants = 0
  let scannedPages = 0

  while (true) {
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "manage_inventory", "allow_backorder"],
      pagination: {
        take: PAGE_SIZE,
        skip: offset,
      },
    })

    const page = variants ?? []
    if (!page.length) {
      break
    }

    scannedPages++
    totalVariants += page.length
    for (const variant of page) {
      if (
        variant.manage_inventory === NON_TRACKED_VARIANT_DEFAULTS.manage_inventory &&
        variant.allow_backorder === NON_TRACKED_VARIANT_DEFAULTS.allow_backorder
      ) {
        continue
      }
      variantIdsToUpdate.push(variant.id)
    }

    offset += PAGE_SIZE

    logger.info(
      `Scanned page ${scannedPages}: page_size=${page.length}, queued_updates=${variantIdsToUpdate.length}`
    )
  }

  logger.info(
    `Inventory tracking normalization (${apply ? "APPLY" : "DRY RUN"}): total variants=${totalVariants}, to_update=${variantIdsToUpdate.length}`
  )

  if (!apply) {
    logger.info("Dry run only. Re-run with -- --apply (or APPLY=1) to apply changes.")
    return
  }

  const batches = chunk(variantIdsToUpdate, UPDATE_BATCH_SIZE)
  for (const [index, batch] of batches.entries()) {
    for (const id of batch) {
      await productModuleService.updateProductVariants(
        id,
        withNonTrackedInventoryDefaults({})
      )
    }
    logger.info(
      `Applied batch ${index + 1}/${batches.length}: updated=${Math.min(
        (index + 1) * UPDATE_BATCH_SIZE,
        variantIdsToUpdate.length
      )}/${variantIdsToUpdate.length}`
    )
  }

  logger.info(
    `Done. Normalized inventory flags on ${variantIdsToUpdate.length} variants (manage_inventory=false, allow_backorder=true).`
  )
}
