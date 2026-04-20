import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Ensures every sales channel is linked to every stock location.
 *
 * If the publishable API key is tied to a sales channel that was never linked to the
 * warehouse where inventory lives, add-to-cart fails with:
 * "Sales channel ... is not associated with any stock location for variant ..."
 *
 * Run (local): `npx medusa exec ./src/scripts/link-sales-channels-to-stock-locations.ts`
 * Run (Railway SSH): same from /app after deploy.
 */
export default async function linkSalesChannelsToStockLocations({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION) as {
    listStockLocations: (
      filters?: Record<string, unknown>,
      config?: { take?: number }
    ) => Promise<Array<{ id: string; name: string }>>
  }
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL) as {
    listSalesChannels: (
      filters?: Record<string, unknown>,
      config?: { take?: number }
    ) => Promise<Array<{ id: string; name: string }>>
  }

  const [locations, channels] = await Promise.all([
    stockLocationModule.listStockLocations({}, { take: 500 }),
    salesChannelModule.listSalesChannels({}, { take: 500 }),
  ])

  if (!locations.length) {
    throw new Error("No stock locations found. Create one in Admin or run seed.")
  }
  if (!channels.length) {
    throw new Error("No sales channels found.")
  }

  const channelIds = channels.map((c) => c.id)

  for (const loc of locations) {
    logger.info(
      `Linking ${channelIds.length} sales channel(s) to stock location "${loc.name}" (${loc.id})`
    )
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: loc.id,
        add: channelIds,
      },
    })
  }

  logger.info(
    `Done. Linked all sales channels to ${locations.length} stock location(s).`
  )
}
