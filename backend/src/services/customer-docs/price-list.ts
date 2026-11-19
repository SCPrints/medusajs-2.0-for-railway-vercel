import { ContainerRegistrationKeys, QueryContext } from "@medusajs/framework/utils"

import { listCustomerOrgs } from "../../lib/customer-org-sharing"
import {
  GARMENT_BREAKS,
  embroideryPriceTable,
  garmentBreakPrices,
  printPriceTable,
  type PriceList,
  type PriceListGarment,
  type PriceRange,
} from "../../lib/price-list"
import { bnLikeToMajorAmount, resolveTierForCartCustomer } from "../../lib/scp-resolve-garment-unit-price"
import { longDate, money, type DocSpec } from "./pdf"

const MAX_GARMENTS = 80

/**
 * Builds the customer's price list: every garment they have ordered (newest
 * first) plus the garments in designs shared with their organisations, priced
 * the way the cart prices them (tier flat price, else the quantity ladder).
 */
export async function buildPriceList(container: any, customerId: string): Promise<PriceList> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  const ordered: Array<{ product_id: string }> = await knex("order as o")
    .join("order_item as oi", function (this: any) {
      this.on("oi.order_id", "o.id").andOnNull("oi.deleted_at")
    })
    .join("order_line_item as li", function (this: any) {
      this.on("li.id", "oi.item_id").andOnNull("li.deleted_at")
    })
    .where("o.customer_id", customerId)
    .whereNull("o.deleted_at")
    .whereNull("o.canceled_at")
    .whereNotNull("li.product_id")
    .groupBy("li.product_id")
    .orderByRaw("max(o.created_at) desc")
    .limit(MAX_GARMENTS)
    .select("li.product_id")

  const orgs = await listCustomerOrgs(container, customerId).catch(() => [])
  const shared: Array<{ base_product_id: string }> = orgs.length
    ? await knex("design")
        .whereIn("organisation_id", orgs.map((o) => o.organisation_id))
        .whereNull("deleted_at")
        .whereNotNull("base_product_id")
        .distinct("base_product_id")
        .limit(MAX_GARMENTS)
    : []

  const source = new Map<string, "ordered" | "shared">()
  for (const r of ordered) source.set(r.product_id, "ordered")
  for (const r of shared) if (!source.has(r.base_product_id)) source.set(r.base_product_id, "shared")
  const ids = Array.from(source.keys()).slice(0, MAX_GARMENTS)

  const tier = await resolveTierForCartCustomer(query, customerId)
  let garments: PriceListGarment[] = []
  if (ids.length) {
    // Raw SQL on purpose: a style can have 200+ variants, but only a handful
    // of distinct price ladders, so only those come back.
    const products: any[] = await knex("product")
      .whereIn("id", ids)
      .where("status", "published")
      .whereNull("deleted_at")
      .whereRaw("coalesce(metadata->>'internal_service', '') <> 'true'")
      .select("id", "title", "handle", "thumbnail")
    const ladders: any[] = await knex("product_variant as pv")
      .whereIn("pv.product_id", ids)
      .whereNull("pv.deleted_at")
      .whereRaw("pv.metadata->'bulk_pricing' is not null")
      .distinct(
        "pv.product_id",
        knex.raw("pv.metadata->'bulk_pricing' as bulk_pricing"),
        knex.raw("pv.metadata->>'cost_price_ex_gst_minor' as cost_price_ex_gst_minor")
      )
    // Variants with no ladder sell at their plain catalog price.
    const bare: any[] = await knex("product_variant as pv")
      .whereIn("pv.product_id", ids)
      .whereNull("pv.deleted_at")
      .whereRaw("pv.metadata->'bulk_pricing' is null")
      .limit(2000)
      .select("pv.id", "pv.product_id")
    const fallback = new Map<string, number>()
    if (bare.length) {
      try {
        const { data: priced } = await query.graph({
          entity: "variants",
          filters: { id: bare.map((v) => v.id) },
          fields: ["id", "calculated_price.calculated_amount"],
          context: { calculated_price: QueryContext({ currency_code: "aud" }) },
        })
        for (const v of (priced ?? []) as any[]) {
          const major = bnLikeToMajorAmount(v?.calculated_price?.calculated_amount)
          if (major != null && major > 0) fallback.set(v.id, major)
        }
      } catch {
        /* those garments are left off the list */
      }
    }

    const byId = new Map(products.map((p) => [p.id as string, p]))
    garments = ids
      .map((id): PriceListGarment | null => {
        const p = byId.get(id)
        if (!p) return null
        const prices: PriceRange[] = garmentBreakPrices(
          [
            ...ladders.filter((l) => l.product_id === id).map((l) => ({ metadata: l as Record<string, unknown> })),
            ...bare.filter((v) => v.product_id === id).map((v) => ({ fallbackMajor: fallback.get(v.id) ?? null })),
          ],
          tier
        )
        if (prices.every((r) => r == null)) return null
        return { product_id: id, title: p.title, handle: p.handle ?? null, thumbnail: p.thumbnail ?? null, source: source.get(id)!, prices }
      })
      .filter((g): g is PriceListGarment => g != null)
  }

  return {
    generated_at: new Date().toISOString(),
    currency_code: "aud",
    tier: tier ? tier.name.replace(/^Tier:\s*/i, "") : null,
    breaks: GARMENT_BREAKS,
    garments,
    decoration: [printPriceTable(), embroideryPriceTable()],
  }
}

const range = (r: PriceRange): string =>
  r == null ? "—" : r.max > r.min ? `${money(r.min)} – ${money(r.max)}` : money(r.min)

export function priceListDoc(list: PriceList, forLines: string[]): DocSpec {
  const first = 0.3
  const rest = (n: number) => (1 - first) / n
  return {
    title: "Price list",
    subtitle: longDate(list.generated_at),
    to: forLines,
    facts: list.tier ? [["Your pricing", list.tier]] : [],
    tables: [
      {
        heading: "Garments",
        note: "Blank garment, each. A range means bigger sizes cost more.",
        columns: [
          { label: "Garment", width: first },
          ...list.breaks.map((b) => ({ label: `Qty ${b.label}`, width: rest(list.breaks.length), align: "right" as const })),
        ],
        rows: list.garments.map((g) => [g.title, ...g.prices.map(range)]),
      },
      ...list.decoration.map((t) => ({
        heading: t.title,
        note: t.note,
        columns: [
          { label: "Size", width: first },
          ...t.columns.map((c) => ({ label: `Qty ${c}`, width: rest(t.columns.length), align: "right" as const })),
        ],
        rows: t.rows.map((r) => [r.label, ...r.prices.map((p) => money(p))]),
      })),
    ],
    notes: [
      "All prices are in Australian dollars and include GST.",
      `Prices as at ${longDate(list.generated_at)}. Prices can change. Your cart always shows the current price.`,
      "Screen printing and anything unusual is quoted per job.",
    ],
  }
}
