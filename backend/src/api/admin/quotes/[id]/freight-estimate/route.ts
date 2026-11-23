import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

import { SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS, SHIPPING_PACKAGING_OVERHEAD_GRAMS } from "../../../../../lib/constants"
import { readStoredDeliveryAddress } from "../../../../../lib/delivery-address"
import { pickGarmentWeightGrams } from "../../../../../lib/garment-weights"
import { resolveShippingRate } from "../../../../../lib/shippit-quote"
import { QUOTE_MODULE } from "../../../../../modules/quote"

const bodySchema = z.object({
  /** The pricer's garments: product (null = customer-supplied with no stand-in) + units. */
  items: z.array(z.object({ product_id: z.string().nullable(), quantity: z.number().min(0) })).max(200),
})

/**
 * POST /admin/quotes/:id/freight-estimate { items }
 *
 * What the website would charge to post this job: the same Shippit / AusPost
 * quote checkout uses (resolveShippingRate), to the quote's delivery address,
 * for the garments' weight. A suggestion only — the pricer shows it and staff
 * choose whether to apply it.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: "items required" })

  const quotes = req.scope.resolve(QUOTE_MODULE) as any
  const quote = await quotes.retrieveQuote(req.params.id).catch(() => null)
  if (!quote) return res.status(404).json({ error: "not_found" })
  const address = readStoredDeliveryAddress(quote.metadata?.delivery_address)

  const ids = [...new Set(parsed.data.items.map((i) => i.product_id).filter((v): v is string => !!v))]
  const gramsById = new Map<string, number>()
  if (ids.length) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({ entity: "product", fields: ["id", "weight", "type.value"], filters: { id: ids } })
    for (const p of (data as any[]) ?? []) {
      const real = Number(p.weight)
      gramsById.set(p.id, real > 0 ? real : pickGarmentWeightGrams(p.type?.value) ?? SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS)
    }
  }
  const units = parsed.data.items.reduce((n, i) => n + i.quantity, 0)
  const itemsGrams = parsed.data.items.reduce(
    (g, i) => g + i.quantity * ((i.product_id && gramsById.get(i.product_id)) || SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS),
    0
  )
  const grams = itemsGrams + SHIPPING_PACKAGING_OVERHEAD_GRAMS
  const rate = await resolveShippingRate(grams, address, (m) => req.scope.resolve(ContainerRegistrationKeys.LOGGER).warn(`freight-estimate: ${m}`))
  const parcels = rate.shippit?.parcels ?? 1

  res.json({
    amount: rate.amount,
    // What we pay AusPost, ex GST (Shippit prices are inc GST). Ladder: unknown.
    cost_ex: rate.shippit ? Math.round(((rate.shippit.carrier_price * parcels) / 1.1) * 100) / 100 : null,
    rate_source: rate.rate_source,
    fallback_reason: rate.fallback_reason ?? null,
    units,
    grams,
    parcels,
    to: address ? [address.city, address.province, address.postal_code].filter(Boolean).join(" ") : null,
  })
}
