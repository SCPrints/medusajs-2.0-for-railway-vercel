import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"

const AS_COLOUR_TAG = "as-colour"

/**
 * Removes every product currently identified as an AS Colour blank so the
 * API-driven import can become the source of truth.
 *
 * Identification strategy (any of these makes a product "AS Colour"):
 *   1. Has a tag named "as-colour".
 *   2. metadata.ascolour or metadata.source === "ascolour".
 *   3. Variant SKU pattern matches AS Colour style codes (e.g. "5001-WHITE-S",
 *      "1001-BLACK-OS"): leading 4-digit style code + "-" + colour + "-" + size.
 *
 * Run with `--confirm` to actually delete; otherwise it does a dry run.
 *   npx medusa exec ./src/scripts/wipe-as-colour-products.ts -- --confirm
 */
const SKU_PATTERN = /^\d{3,5}-[A-Z0-9]+(?:-[A-Z0-9]+)?(?:-[A-Z0-9]+)?$/

export default async function wipeAsColourProducts({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const confirm = (args ?? []).includes("--confirm")

  const { data: tagged } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "tags.value", "metadata"],
    filters: {} as any,
    pagination: { take: 5000 },
  })

  const matched = (tagged ?? []).filter((p: any) => {
    const tagValues: string[] = (p.tags ?? []).map((t: any) => t?.value).filter(Boolean)
    if (tagValues.includes(AS_COLOUR_TAG)) return true
    const meta = p.metadata ?? {}
    if (meta.ascolour) return true
    if (typeof meta.source === "string" && meta.source.toLowerCase() === "ascolour") return true
    return false
  })

  // SKU-pattern fallback: only used when tag/metadata didn't already match.
  const idsAlreadyMatched = new Set(matched.map((p: any) => p.id))
  const { data: maybeBySku } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "variants.sku"],
    filters: {} as any,
    pagination: { take: 5000 },
  })
  for (const p of maybeBySku ?? []) {
    if (idsAlreadyMatched.has(p.id)) continue
    const skus: string[] = (p.variants ?? []).map((v: any) => v?.sku).filter(Boolean)
    if (skus.some((sku) => SKU_PATTERN.test(sku))) {
      matched.push(p as any)
      idsAlreadyMatched.add(p.id)
    }
  }

  if (!matched.length) {
    logger.info("No AS Colour products found to wipe.")
    return
  }

  logger.info(
    `Found ${matched.length} AS Colour products to wipe:\n` +
      matched
        .slice(0, 50)
        .map((p: any) => `  - ${p.handle} (${p.title})`)
        .join("\n") +
      (matched.length > 50 ? `\n  ... +${matched.length - 50} more` : "")
  )

  if (!confirm) {
    logger.warn(
      "Dry run only — re-run with `-- --confirm` to actually delete these products."
    )
    return
  }

  const ids = matched.map((p: any) => p.id)
  await deleteProductsWorkflow(container).run({ input: { ids } })
  logger.info(`Deleted ${ids.length} AS Colour products.`)
}
