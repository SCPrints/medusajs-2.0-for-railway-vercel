import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { computeScpLineDescriptor } from "../../lib/scp-line-descriptor"
import { costExGstMinorFromMetadata } from "../../lib/safe-tier-pricing"
import { printSizeIdForDesign } from "../../lib/group-order-lines"
import { itemVariants, variantColour, type VariantLike } from "../../lib/team-store"
import { TEAM_STORE_MODULE } from "../../modules/team-store"

export type CatalogProduct = {
  id: string
  handle: string
  title: string
  thumbnail: string | null
  variants: Array<VariantLike & { metadata?: Record<string, unknown> | null }>
}

/** Products by handle with variants + options (handle pointer, like bundles). */
export async function loadProductsByHandle(
  container: MedusaContainer,
  handles: string[]
): Promise<Map<string, CatalogProduct>> {
  const unique = [...new Set(handles.filter(Boolean))]
  if (!unique.length) return new Map()
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "product",
    filters: { handle: unique },
    fields: [
      "id",
      "handle",
      "title",
      "thumbnail",
      "variants.id",
      "variants.title",
      "variants.metadata",
      "variants.options.value",
      "variants.options.option.title",
    ],
  })
  const map = new Map<string, CatalogProduct>()
  for (const p of (data ?? []) as any[]) {
    map.set(p.handle, {
      id: p.id,
      handle: p.handle,
      title: p.title,
      thumbnail: p.thumbnail ?? null,
      variants: (p.variants ?? []).map((v: any) => ({ ...v, product: { handle: p.handle } })),
    })
  }
  return map
}

/** Colour names a garment comes in (for the admin colour picker). */
export const productColours = (p: CatalogProduct): string[] =>
  [...new Set(p.variants.map((v) => variantColour(v)).filter((c): c is string => !!c))]

/**
 * The pricing engine's price for one item at the store's expected quantity
 * (garment + decoration, same descriptor the Studio uses), plus the garment's
 * cash cost. Decoration cost isn't modelled, so margin here is over garment
 * cost only — staff can type a fuller cost on the item.
 */
export async function suggestItemPrice(
  container: MedusaContainer,
  itemId: string
): Promise<{ suggested_price: number; garment_cost: number | null; quantity: number; variant_id: string }> {
  const service = container.resolve(TEAM_STORE_MODULE) as any
  const item = await service.retrieveTeamStoreItem(itemId)
  const store = await service.retrieveTeamStore(item.team_store_id)
  const product = (await loadProductsByHandle(container, [item.product_handle])).get(item.product_handle)
  if (!product) throw new MedusaError(MedusaError.Types.NOT_FOUND, `No product with handle "${item.product_handle}".`)
  const variant = itemVariants(item, product.variants)[0]
  if (!variant) throw new MedusaError(MedusaError.Types.INVALID_DATA, `No ${item.colour} variants on ${product.title}.`)
  const design = (item.customizer_design ?? null) as Record<string, unknown> | null
  if (!design) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Design the item in the Studio first.")

  const quantity = Math.max(1, Number(store.expected_quantity) || 1)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const descriptor = await computeScpLineDescriptor({
    variantId: variant.id,
    quantity,
    metadata: { customizerDesign: { ...design, variantId: variant.id } },
    printSizeIdRaw: printSizeIdForDesign(design),
    cart: { currency_code: "aud" },
    query,
    tier: null,
  })
  const costMinor = costExGstMinorFromMetadata((variant.metadata ?? null) as any)
  return {
    suggested_price: descriptor.unitPriceMajor,
    // Supplier cost is ex GST; the cash SC Prints pays includes it (×1.1).
    garment_cost: costMinor === null ? null : Math.round(costMinor * 1.1) / 100,
    quantity,
    variant_id: variant.id,
  }
}
