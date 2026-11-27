// Portal e2e fixture (throwaway DB only). run.sh copies it into backend/src/scripts for the run, then removes it.
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { buildPriceLadder } from "../utils/bulk-price-ladder"
import { ladderToTierMinor, tierMinorToBulkPricingMetadata, tierMinorToPriceSetRows } from "../utils/bulk-tier-prices"

export default async function run({ container }: any) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: existing } = await query.graph({ entity: "product", filters: { handle: ["test-polo", "test-hoodie"] }, fields: ["id"] })
  if (existing.length) return
  const sc = (await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({}, { take: 1 }))[0]
  const sp = (await container.resolve(Modules.FULFILLMENT).listShippingProfiles({}, { take: 1 }))[0]
  const make = (handle: string, title: string, colours: string[], sizes: string[], cost: number, weight: number, type: string) => {
    const tierMinor = ladderToTierMinor(buildPriceLadder(cost))
    return {
      title, handle, status: ProductStatus.PUBLISHED, weight,
      thumbnail: `https://example.com/${handle}.jpg`,
      options: [{ title: "Colour", values: colours }, { title: "Size", values: sizes }],
      shipping_profile_id: sp.id,
      sales_channels: [{ id: sc.id }],
      metadata: { bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, "e2e"), garment_type: type },
      variants: colours.flatMap((c) => sizes.map((s) => ({
        title: `${c} / ${s}`, sku: `${handle}-${c}-${s}`.toUpperCase(), manage_inventory: false, allow_backorder: true,
        options: { Colour: c, Size: s },
        prices: tierMinorToPriceSetRows(tierMinor, "aud"),
        metadata: { bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, "e2e"), cost_price_ex_gst_minor: Math.round(cost * 100), garment_color: c },
      }))),
    }
  }
  await createProductsWorkflow(container).run({ input: { products: [
    make("test-polo", "Test Polo", ["Navy", "White"], ["S", "M", "L", "XL", "2XL"], 12, 250, "Polos"),
    make("test-hoodie", "Test Hoodie", ["Black"], ["S", "M", "L", "XL"], 25, 550, "Hoodies"),
  ] } })
  console.log("e2e fixture products created")
}
