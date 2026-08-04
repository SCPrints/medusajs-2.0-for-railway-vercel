import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { ASCOLOUR_MODULE } from "../../../../modules/ascolour"
import type AsColourService from "../../../../modules/ascolour/service"

const LOOKBACK_DAYS = 90

function isAsColourItem(li: any): boolean {
  const sku: string | undefined = li.variant_sku ?? li.metadata?.ascolour?.sku
  if (!sku) return false
  const meta = li.metadata ?? {}
  return !!(meta?.ascolour || meta?.source === "ascolour" || /^\d{3,5}-/.test(sku))
}

function formatItem(
  li: any
): { line_item_id: string; sku: string; quantity: number; title: string } {
  return {
    // Stable per-line identifier so the dropship UI can select/deselect
    // individual lines before sending (robust against two lines sharing a SKU).
    line_item_id: li.id ?? "",
    sku: li.variant_sku ?? li.metadata?.ascolour?.sku ?? "—",
    quantity: Number(li.quantity ?? 0),
    title: li.title ?? "",
  }
}

/**
 * GET /admin/dropship/ascolour
 *
 * Returns all recent orders (last 90 days) that contain AS Colour line items,
 * split into "pending" (not yet sent) and "sent" (ascolour_order_id present).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
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
  // Fulfilled from SC Prints' own stock — never submitted to AS Colour, but
  // kept visible (and reversible) rather than silently disappearing.
  const in_house: any[] = []

  for (const order of orders) {
    // Only last 90 days
    const createdAt = order.created_at as string | undefined
    if (createdAt) {
      const t = Date.parse(createdAt)
      if (!Number.isFinite(t) || t < Date.parse(since)) continue
    }

    // Skip cancelled orders
    if (order.status === "canceled" || order.status === "cancelled") continue

    const items: any[] = order.items ?? []
    const ascolourItems = items.filter(isAsColourItem)
    if (!ascolourItems.length) continue

    const meta = (order.metadata ?? {}) as Record<string, any>
    const addr = order.shipping_address ?? {}
    const customerName = [addr.first_name, addr.last_name].filter(Boolean).join(" ") || order.email || ""

    const base = {
      order_id: order.id,
      display_id: order.display_id,
      created_at: order.created_at,
      customer: customerName,
      email: order.email ?? "",
      items: ascolourItems.map(formatItem),
      // Surface the last failed-send reason so a stuck pending order explains
      // itself in the queue (previously only the "sent" bucket carried this).
      ascolour_last_error: meta.ascolour_last_error ?? null,
    }

    if (meta.ascolour_order_id) {
      sent.push({
        ...base,
        ascolour_order_id: meta.ascolour_order_id,
        ascolour_status: meta.ascolour_status ?? null,
        ascolour_sent_at: meta.ascolour_sent_at ?? null,
        ascolour_shipments: Array.isArray(meta.ascolour_shipments) ? meta.ascolour_shipments : [],
        ascolour_last_synced_at: meta.ascolour_last_synced_at ?? null,
        ascolour_last_error: meta.ascolour_last_error ?? null,
      })
    } else if (meta.ascolour_in_house_at) {
      in_house.push({
        ...base,
        ascolour_in_house_at: meta.ascolour_in_house_at,
        ascolour_in_house_note: meta.ascolour_in_house_note ?? null,
      })
    } else {
      pending.push(base)
    }
  }

  // Surface the configured default shipping method so the bulk page can
  // pre-fill it (matching the per-order widget) — a send with no method set
  // anywhere hard-fails before it ever reaches AS Colour.
  let default_shipping_method: string | null = null
  try {
    const ascolour = req.scope.resolve(ASCOLOUR_MODULE) as AsColourService
    default_shipping_method = ascolour.getOptions().default_shipping_method ?? null
  } catch {
    // AS Colour module not configured — leave null.
  }

  return res.json({ pending, sent, in_house, default_shipping_method })
}
