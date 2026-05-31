import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const LOOKBACK_DAYS = 90

function isAussiePacificItem(li: any): boolean {
  const meta = li.metadata ?? {}
  return Boolean(meta?.aussiepacific || meta?.source === "aussiepacific")
}

function formatItem(li: any): { sku: string; quantity: number; title: string } {
  return {
    sku: li.metadata?.aussiepacific?.sku ?? li.variant_sku ?? "—",
    quantity: Number(li.quantity ?? 0),
    title: li.title ?? "",
  }
}

/**
 * GET /admin/dropship/aussie-pacific
 *
 * Returns all recent orders (last 90 days) that contain Aussie Pacific line
 * items, split into "pending" (not yet sent) and "sent" (aussiepacific_order_id
 * present). Same response shape as /admin/dropship/ascolour so the shared
 * dashboard page can render either supplier.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const since = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()
  const sinceMs = Date.parse(since)

  // Paginate newest-first until we cross the 90-day cutoff. A single take:500
  // page silently dropped the oldest *unsent* orders once 90-day volume
  // exceeded 500 — they'd never appear in the pending queue.
  const PAGE = 500
  const orders: any[] = []
  let skip = 0
  while (true) {
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "created_at",
        "status",
        "metadata",
        "email",
        "shipping_address.first_name",
        "shipping_address.last_name",
        "items.id",
        "items.variant_sku",
        "items.title",
        "items.quantity",
        "items.metadata",
      ],
      pagination: { take: PAGE, skip, order: { created_at: "DESC" } },
    })
    const page = (data as any[]) ?? []
    orders.push(...page)
    const last = page[page.length - 1]
    const lastMs = last?.created_at ? Date.parse(last.created_at) : NaN
    // Ordered DESC — once a full page ends older than the cutoff, stop.
    if (page.length < PAGE || (Number.isFinite(lastMs) && lastMs < sinceMs)) break
    skip += PAGE
    if (skip >= 20000) break // safety cap
  }

  const pending: any[] = []
  const sent: any[] = []

  for (const order of orders) {
    const createdAt = order.created_at as string | undefined
    if (createdAt) {
      const t = Date.parse(createdAt)
      if (!Number.isFinite(t) || t < Date.parse(since)) continue
    }

    if (order.status === "canceled" || order.status === "cancelled") continue

    const items: any[] = order.items ?? []
    const apItems = items.filter(isAussiePacificItem)
    if (!apItems.length) continue

    const meta = (order.metadata ?? {}) as Record<string, any>
    const addr = order.shipping_address ?? {}
    const customerName =
      [addr.first_name, addr.last_name].filter(Boolean).join(" ") ||
      order.email ||
      ""

    const base = {
      order_id: order.id,
      display_id: order.display_id,
      created_at: order.created_at,
      customer: customerName,
      email: order.email ?? "",
      items: apItems.map(formatItem),
    }

    if (meta.aussiepacific_order_id) {
      sent.push({
        ...base,
        supplier_order_id: meta.aussiepacific_order_id,
        supplier_status: meta.aussiepacific_status ?? null,
        supplier_sent_at: meta.aussiepacific_sent_at ?? null,
        supplier_shipments: Array.isArray(meta.aussiepacific_shipments)
          ? meta.aussiepacific_shipments
          : [],
        supplier_last_synced_at: meta.aussiepacific_last_synced_at ?? null,
        supplier_last_error: meta.aussiepacific_last_error ?? null,
      })
    } else {
      pending.push(base)
    }
  }

  return res.json({ pending, sent })
}
