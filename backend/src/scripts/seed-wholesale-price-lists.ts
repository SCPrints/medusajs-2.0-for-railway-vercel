/**
 * Seeds (or refreshes) Medusa Price Lists for wholesale customer groups.
 *
 * Wholesale garment price = (retail 100+ price / 1.5) × tier multiplier
 *
 * Customer groups and multipliers:
 *   wholesale_bronze   1.4×  (entry-level)
 *   wholesale_silver   1.3×
 *   wholesale_gold     1.2×
 *   wholesale_platinum 1.1×  (best / closest to cost)
 *
 * Run from backend/:
 *   npx medusa exec ./src/scripts/seed-wholesale-price-lists.ts
 *
 * Safe to re-run — upserts prices and idempotently creates groups/price-lists.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const WHOLESALE_TIERS = [
  { groupName: "wholesale_bronze",   multiplier: 1.4 },
  { groupName: "wholesale_silver",   multiplier: 1.3 },
  { groupName: "wholesale_gold",     multiplier: 1.2 },
  { groupName: "wholesale_platinum", multiplier: 1.1 },
]

const RETAIL_100_PLUS_INDEX = 4
const RETAIL_MARKUP = 1.5
const CURRENCY_CODE = "aud"

const round2 = (n: number) => Math.round(n * 100) / 100

function garmentMajorFromBulkTiers(
  metadata: Record<string, unknown> | null | undefined,
  tierIndex: number
): number | null {
  const bp = metadata?.bulk_pricing as { tiers?: Array<Record<string, unknown>> } | undefined
  if (!Array.isArray(bp?.tiers) || !bp!.tiers.length) return null
  const sorted = [...bp!.tiers].sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity))
  const tier = sorted[tierIndex] ?? sorted[sorted.length - 1]
  const amount = tier?.amount
  if (typeof amount === "number" && Number.isFinite(amount)) return amount
  if (typeof amount === "string") {
    const n = parseFloat(amount)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export default async function seedWholesalePriceLists({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (q: Record<string, unknown>) => Promise<{ data?: unknown[] }>
  }
  const customerGroupService = container.resolve(Modules.CUSTOMER)
  const pricingService = container.resolve(Modules.PRICING)

  logger.info("seed-wholesale-price-lists: starting")

  // 1. Ensure all customer groups exist
  const { data: existingGroupsRaw } = await query.graph({
    entity: "customer_group",
    fields: ["id", "name"],
  })
  const existingGroups = (existingGroupsRaw ?? []) as Array<{ id: string; name: string }>

  const groupMap: Record<string, string> = {} // name → id
  for (const tier of WHOLESALE_TIERS) {
    const existing = existingGroups.find((g) => g.name === tier.groupName)
    if (existing) {
      groupMap[tier.groupName] = existing.id
      logger.info(`  group exists: ${tier.groupName} (${existing.id})`)
    } else {
      const created = await (customerGroupService as any).createCustomerGroups({
        name: tier.groupName,
      })
      const createdGroup = Array.isArray(created) ? created[0] : created
      groupMap[tier.groupName] = createdGroup.id
      logger.info(`  created group: ${tier.groupName} (${createdGroup.id})`)
    }
  }

  // 2. Fetch all variants with metadata + at least one AUD price
  const { data: variantRows } = await query.graph({
    entity: "variants",
    fields: [
      "id",
      "metadata",
      "prices.id",
      "prices.amount",
      "prices.currency_code",
    ],
  })
  const variants = (variantRows ?? []) as Array<{
    id: string
    metadata: Record<string, unknown> | null
    prices: Array<{ id: string; amount: number; currency_code: string }>
  }>

  logger.info(`  found ${variants.length} variants`)

  // 3. Determine which variants have wholesale-priceable metadata
  type PriceTarget = { variantId: string; groupName: string; amountMajor: number }
  const priceTargets: PriceTarget[] = []
  let skipped = 0

  for (const variant of variants) {
    const retail100Plus = garmentMajorFromBulkTiers(variant.metadata, RETAIL_100_PLUS_INDEX)
    if (retail100Plus === null || retail100Plus <= 0) {
      skipped++
      continue
    }
    const costInclGst = round2(retail100Plus / RETAIL_MARKUP)
    for (const tier of WHOLESALE_TIERS) {
      const wholesalePrice = round2(costInclGst * tier.multiplier)
      priceTargets.push({ variantId: variant.id, groupName: tier.groupName, amountMajor: wholesalePrice })
    }
  }

  logger.info(`  ${skipped} variants skipped (no bulk_pricing tiers), ${variants.length - skipped} priceable`)
  logger.info(`  ${priceTargets.length} price targets to upsert across ${WHOLESALE_TIERS.length} tiers`)

  // 4. Ensure one Price List per customer group, then upsert prices
  const { data: existingPriceLists } = await query.graph({
    entity: "price_list",
    fields: ["id", "title"],
  })
  const listMap: Record<string, string> = {} // groupName → priceListId

  for (const tier of WHOLESALE_TIERS) {
    const listTitle = `Wholesale — ${tier.groupName}`
    const existing = (existingPriceLists ?? []).find(
      (pl: unknown) => (pl as { title?: string }).title === listTitle
    ) as { id: string } | undefined

    if (existing) {
      listMap[tier.groupName] = existing.id
      logger.info(`  price list exists: "${listTitle}" (${existing.id})`)
    } else {
      const created = await (pricingService as any).createPriceLists({
        title: listTitle,
        description: `Automatically managed wholesale garment prices for ${tier.groupName}`,
        type: "override",
        status: "active",
        rules: [{ attribute: "customer_group_id", value: groupMap[tier.groupName] }],
      })
      const createdList = Array.isArray(created) ? created[0] : created
      listMap[tier.groupName] = createdList.id
      logger.info(`  created price list: "${listTitle}" (${createdList.id})`)
    }
  }

  // 5. Upsert prices into each price list
  for (const tier of WHOLESALE_TIERS) {
    const priceListId = listMap[tier.groupName]
    const tierTargets = priceTargets.filter((t) => t.groupName === tier.groupName)
    if (!tierTargets.length) continue

    const prices = tierTargets.map((t) => ({
      variant_id: t.variantId,
      currency_code: CURRENCY_CODE,
      amount: t.amountMajor,
    }))

    await (pricingService as any).addPriceListPrices([
      { id: priceListId, prices },
    ])

    logger.info(`  upserted ${prices.length} prices into "${tier.groupName}" price list`)
  }

  logger.info("seed-wholesale-price-lists: done")
  logger.info(
    `  Summary: ${Object.values(listMap).length} price lists, ${priceTargets.length} prices total`
  )
  logger.info("  Re-run this script whenever AS Colour updates garment cost prices.")
}