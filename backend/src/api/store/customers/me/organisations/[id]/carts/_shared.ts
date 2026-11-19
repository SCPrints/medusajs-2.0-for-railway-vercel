import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { money } from "../../../../../../../lib/org-account"
import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"

/** The parked cart row for `:row_id`, only if it belongs to this organisation. */
export async function findOrgCart(container: MedusaContainer, orgId: string, rowId: string) {
  const service = container.resolve(ORGANISATION_MODULE) as any
  const [row] = (await service.listOrganisationCarts(
    { id: rowId, organisation_id: orgId },
    { take: 1 }
  )) as any[]
  return { service, row: row ?? null }
}

export type CartSummary = {
  id: string
  customer_id: string | null
  completed: boolean
  total: number | null
  item_count: number
  metadata: Record<string, unknown>
  has_delivery: boolean
  lines: Array<{
    id: string
    title: string
    subtitle: string | null
    quantity: number
    unit_price: number | null
    thumbnail: string | null
  }>
}

/** Totals + lines for a set of carts (no Fabric payloads: line metadata is not read). */
export async function summariseCarts(
  container: MedusaContainer,
  cartIds: string[]
): Promise<Record<string, CartSummary>> {
  const out: Record<string, CartSummary> = {}
  if (!cartIds.length) return out
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "cart",
    filters: { id: cartIds },
    fields: [
      "id",
      "customer_id",
      "completed_at",
      "total",
      "metadata",
      "shipping_address.address_1",
      "shipping_methods.id",
      "items.id",
      "items.title",
      "items.subtitle",
      "items.variant_title",
      "items.product_title",
      "items.quantity",
      "items.unit_price",
      "items.thumbnail",
    ],
  })
  for (const c of (data ?? []) as any[]) {
    const items = (c.items ?? []) as any[]
    out[c.id] = {
      id: c.id,
      customer_id: c.customer_id ?? null,
      completed: !!c.completed_at,
      total: money(c.total),
      item_count: items.reduce((n, it) => n + (Number(it.quantity) || 0), 0),
      metadata: (c.metadata ?? {}) as Record<string, unknown>,
      has_delivery: !!c.shipping_address?.address_1 && (c.shipping_methods ?? []).length > 0,
      lines: items.map((it) => ({
        id: it.id,
        title: it.product_title ?? it.title ?? "Item",
        subtitle: it.variant_title ?? it.subtitle ?? null,
        quantity: Number(it.quantity) || 0,
        unit_price: money(it.unit_price),
        thumbnail: it.thumbnail ?? null,
      })),
    }
  }
  return out
}
