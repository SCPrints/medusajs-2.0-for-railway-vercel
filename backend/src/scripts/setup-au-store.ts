/**
 * Idempotent setup of an Australian region with GST.
 *
 * Run once before importing: npx medusa exec ./src/scripts/setup-au-store.ts
 *
 * Creates (only if missing):
 *  - AUD currency on the store
 *  - "Australia" region with country AU and AUD currency
 *  - Tax region for AU with 10% GST default rate
 *  - "Sydney Warehouse" stock location (rename below if you prefer)
 *
 * Safe to re-run.
 */
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

const STOCK_LOCATION_NAME = "Sydney Warehouse"
const STOCK_LOCATION_CITY = "Sydney"
const REGION_NAME = "Australia"

export default async function setupAuStore({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const storeService = container.resolve(Modules.STORE)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)

  const [store] = await storeService.listStores()
  if (!store) throw new Error("No store found")

  // 1. Ensure AUD is in the store's supported currencies
  const hasAud = store.supported_currencies?.some((c) => c.currency_code === "aud")
  if (!hasAud) {
    logger.info("Adding AUD to store currencies...")
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: [
            ...(store.supported_currencies || []).map((c) => ({
              currency_code: c.currency_code,
              is_default: c.is_default,
            })),
            { currency_code: "aud", is_default: true },
          ],
        },
      },
    })
  } else {
    logger.info("AUD already supported")
  }

  // 2. Ensure Australia region exists
  const { data: existingRegions } = await query.graph({
    entity: "region",
    fields: ["id", "name"],
    filters: { name: REGION_NAME },
  })
  let regionId: string
  if (existingRegions?.length) {
    regionId = existingRegions[0].id
    logger.info(`Region "${REGION_NAME}" already exists`)
  } else {
    logger.info("Creating Australia region...")
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: REGION_NAME,
            currency_code: "aud",
            countries: ["au"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
    regionId = result[0].id
  }

  // 3. Ensure tax region with 10% GST
  const { data: existingTaxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code"],
    filters: { country_code: "au" },
  })
  if (!existingTaxRegions?.length) {
    logger.info("Creating AU tax region with GST...")
    await createTaxRegionsWorkflow(container).run({
      input: [
        {
          country_code: "au",
          provider_id: "tp_system",
          default_tax_rate: {
            name: "GST",
            code: "GST",
            rate: 10,
          },
        },
      ],
    })
  } else {
    logger.info("AU tax region already exists")
  }

  // 4. Ensure stock location
  const { data: existingLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    filters: { name: STOCK_LOCATION_NAME },
  })
  let stockLocationId: string
  if (existingLocations?.length) {
    stockLocationId = existingLocations[0].id
    logger.info(`Stock location "${STOCK_LOCATION_NAME}" already exists`)
  } else {
    logger.info("Creating stock location...")
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: STOCK_LOCATION_NAME,
            address: {
              city: STOCK_LOCATION_CITY,
              country_code: "AU",
              address_1: "",
            },
          },
        ],
      },
    })
    stockLocationId = result[0].id

    // Link to fulfillment provider (manual)
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocationId },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    })

    // Link to default sales channel so inventory is reachable
    const [defaultChannel] = await salesChannelService.listSalesChannels({
      name: "Default Sales Channel",
    })
    if (defaultChannel) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: stockLocationId, add: [defaultChannel.id] },
      })
    }
  }

  logger.info("AU store setup complete.")
  logger.info(`  Region:         ${regionId}`)
  logger.info(`  Stock location: ${stockLocationId}`)
}
