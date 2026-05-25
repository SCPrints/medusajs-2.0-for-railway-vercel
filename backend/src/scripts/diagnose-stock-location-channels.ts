/**
 * Read-only diagnostic: prints every stock location and the sales channels
 * it's linked to. Used to confirm whether supplier warehouses (FashionBiz,
 * AS Colour, Aussie Pacific) are visible to the storefront's sales channel.
 *
 * If a location is NOT linked to the Default Sales Channel, the storefront
 * returns variant.inventory_quantity = 0 for variants whose stock lives at
 * that location — even though the admin's stock page shows positive counts.
 *
 * Usage:
 *   Local:  pnpm --filter backend medusa exec diagnose-stock-location-channels
 *   Fly:    fly ssh console --app sc-prints-backend
 *           cd /app/.medusa/server && npx medusa exec src/scripts/diagnose-stock-location-channels.js
 *
 * Pure read-only — never writes.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function diagnoseStockLocationChannels({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)

  const locations = (await stockLocationService.listStockLocations(
    {},
    { take: 500 }
  )) as Array<{ id: string; name: string }>

  const channels = (await salesChannelService.listSalesChannels(
    {},
    { take: 500 }
  )) as Array<{ id: string; name: string }>

  logger.info(`Found ${locations.length} stock location(s)`)
  logger.info(`Found ${channels.length} sales channel(s)`)
  logger.info("")

  // Pull every (location, sales_channel) edge in one query.
  const { data: edges } = (await query.graph({
    entity: "stock_location",
    fields: ["id", "name", "sales_channels.id", "sales_channels.name"],
  })) as {
    data: Array<{
      id: string
      name: string
      sales_channels?: Array<{ id: string; name: string }>
    }>
  }

  const channelsByLocation = new Map<string, Array<{ id: string; name: string }>>()
  for (const edge of edges) {
    channelsByLocation.set(edge.id, edge.sales_channels ?? [])
  }

  const defaultChannel = channels.find((c) => c.name === "Default Sales Channel")
  if (!defaultChannel) {
    logger.warn(`No sales channel named "Default Sales Channel" found.`)
  }

  let missingLinks = 0

  for (const loc of locations) {
    const linked = channelsByLocation.get(loc.id) ?? []
    const linkedNames = linked.map((c) => c.name).join(", ") || "(none)"
    const hasDefault = defaultChannel
      ? linked.some((c) => c.id === defaultChannel.id)
      : false

    const marker = defaultChannel && !hasDefault ? "  ⚠️  NOT LINKED to Default" : ""
    logger.info(`  ${loc.name}`)
    logger.info(`    id: ${loc.id}`)
    logger.info(`    linked sales channels: ${linkedNames}${marker}`)
    logger.info("")

    if (defaultChannel && !hasDefault) missingLinks += 1
  }

  if (defaultChannel) {
    logger.info("=== Summary ===")
    logger.info(`  Total locations: ${locations.length}`)
    logger.info(`  Linked to "Default Sales Channel": ${locations.length - missingLinks}`)
    logger.info(`  NOT linked to "Default Sales Channel": ${missingLinks}`)
    if (missingLinks > 0) {
      logger.info("")
      logger.info(
        `  Fix: run backfill-stock-location-channels to link all locations to all channels.`
      )
    }
  }
}
