import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"

import type { AllowancePick } from "../../lib/allowance"
import { SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS, SHIPPING_PACKAGING_OVERHEAD_GRAMS } from "../../lib/constants"
import { parcelGrams, parcelsFromLines, type HomeAddress, type HomeDelivery } from "../../lib/home-delivery"
import { resolveShippingRate } from "../../lib/shippit-quote"
import { SERVICE_LINE_HANDLE } from "../../lib/sizes-pending"
import { variantForSize, type DesignChoice } from "./index"

const round2 = (n: number) => Math.round(n * 100) / 100

/** The hidden $0 service product's variant (names lines, postage lines). */
export async function serviceLineVariantId(scope: MedusaContainer): Promise<string> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", filters: { handle: SERVICE_LINE_HANDLE }, fields: ["variants.id"] })
  const id = (data?.[0] as { variants?: Array<{ id: string }> } | undefined)?.variants?.[0]?.id
  if (!id) throw new Error("service line product missing")
  return id
}

/**
 * One postage line for everyone's parcels (each priced like a web order to
 * that address), plus the addresses on `cart.metadata.home_delivery` for the
 * job window. Returns the total charged.
 */
export async function addHomeDeliveryPostage(
  scope: MedusaContainer,
  cartId: string,
  people: Array<{ name: string; address: HomeAddress; picks: AllowancePick[] }>,
  choices: Map<string, DesignChoice>
): Promise<number> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const variantIds = new Set<string>()
  for (const p of people) for (const pick of p.picks) {
    const v = variantForSize(choices.get(pick.design_id), pick.size)
    if (v) variantIds.add(v)
  }
  const { data: variants } = variantIds.size
    ? await query.graph({ entity: "variant", filters: { id: [...variantIds] }, fields: ["id", "weight", "product.weight"] })
    : { data: [] }
  const gramsOf = new Map<string, number>()
  for (const v of (variants ?? []) as any[]) {
    gramsOf.set(v.id, Number(v.weight) > 0 ? Number(v.weight) : Number(v.product?.weight) > 0 ? Number(v.product.weight) : SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS)
  }

  const parcels: HomeDelivery[] = []
  for (const p of people) {
    const units: number[] = []
    const items: HomeDelivery["items"] = []
    for (const pick of p.picks) {
      if (pick.quantity <= 0) continue
      const c = choices.get(pick.design_id)
      const v = variantForSize(c, pick.size)
      for (let i = 0; i < pick.quantity; i++) units.push(v ? gramsOf.get(v) ?? SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS : SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS)
      const title =
        c?.product_title && !c.name.toLowerCase().includes(c.product_title.toLowerCase()) ? `${c.name} (${c.product_title})` : c?.name ?? "Item"
      items.push({ title, size: pick.size, quantity: pick.quantity })
    }
    if (!items.length) continue
    const rate = await resolveShippingRate(parcelGrams(units, SHIPPING_PACKAGING_OVERHEAD_GRAMS), {
      postal_code: p.address.postal_code,
      city: p.address.city,
      province: p.address.province,
      country_code: "au",
    } as never)
    parcels.push({ name: p.name, address: p.address, items, postage: round2(rate.amount) })
  }
  if (!parcels.length) return 0

  const total = round2(parcels.reduce((n, p) => n + p.postage, 0))
  const label = `Delivery to ${parcels.length} ${parcels.length === 1 ? "address" : "addresses"}`
  await addToCartWorkflow(scope).run({
    input: {
      cart_id: cartId,
      items: [
        {
          variant_id: await serviceLineVariantId(scope),
          quantity: 1,
          unit_price: total,
          title: label,
          product_title: "Home delivery",
          variant_title: label,
          metadata: {
            home_delivery: true,
            home_delivery_postage: true,
            home_delivery_parcels: parcels,
            // Server-priced per parcel; the checkout check leaves it be.
            price_override: { source: "home_delivery", parcels: parcels.length },
          },
        } as any,
      ],
    },
  })

  const cartModule = scope.resolve(Modules.CART) as any
  const cart = await cartModule.retrieveCart(cartId, { select: ["id", "metadata"], relations: ["items"] })
  const existing = Array.isArray(cart?.metadata?.home_delivery) ? (cart.metadata.home_delivery as HomeDelivery[]) : []
  // Rebuilt from the postage lines still in the cart, so removed parcels don't linger.
  const home_delivery = parcelsFromLines(cart?.items) ?? [...existing, ...parcels]
  // updateCarts replaces metadata: merge first.
  await cartModule.updateCarts([{ id: cartId, metadata: { ...(cart?.metadata ?? {}), home_delivery } }])
  return total
}
