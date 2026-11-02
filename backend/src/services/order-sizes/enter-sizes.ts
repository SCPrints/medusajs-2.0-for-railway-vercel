import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  beginOrderEditOrderWorkflow,
  cancelBeginOrderEditWorkflow,
  confirmOrderEditRequestWorkflow,
  orderEditAddNewItemWorkflow,
  orderEditUpdateItemQuantityWorkflow,
  requestOrderEditRequestWorkflow,
} from "@medusajs/medusa/core-flows"

import { writeAudit } from "../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../lib/audit-entities"
import { garmentMajorWithTier } from "../../lib/garment-ladder"
import { rekeyLineScopedMetadata } from "../../lib/order-edit-design-carryover"
import { mergeOrderMetadata } from "../../lib/order-metadata"
import {
  isSizesPendingLine,
  shortSizes,
  sizeChoices,
  sizeSplitError,
  type SizeEntry,
  type SizesPending,
} from "../../lib/sizes-pending"

/**
 * Staff enter the sizes for an order line that was quoted without them
 * (lib/sizes-pending.ts). One Medusa order edit replaces the waiting line with
 * a real line per size: same artwork and job details, the quoted price unless
 * staff change it for a size. After that the lines are ordinary SKUs, so
 * Dropship can send them and production can start.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** `available` = stock left to reserve; null when the variant isn't stock-tracked. */
export type SizeOption = { variant_id: string; size: string; unit_price: number; available: number | null }

type Loaded = {
  order: any
  line: any
  pending: SizesPending
  options: SizeOption[]
}

async function load(container: MedusaContainer, orderId: string, lineItemId: string): Promise<Loaded> {
  const orderModule = container.resolve(Modules.ORDER) as any
  const order = await orderModule.retrieveOrder(orderId, { relations: ["items"] })
  const line = (order.items ?? []).find((i: any) => i.id === lineItemId)
  if (!line) throw new MedusaError(MedusaError.Types.NOT_FOUND, "That line isn't on this order.")
  if (!isSizesPendingLine(line)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This line already has its sizes.")
  const pending = line.metadata.sizes_pending as SizesPending

  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const filters = pending.product_id ? { id: pending.product_id } : pending.product_handle ? { handle: pending.product_handle } : null
  if (!filters) throw new MedusaError(MedusaError.Types.INVALID_DATA, "This line doesn't say which garment it is.")
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id", "variants.id", "variants.title", "variants.variant_rank", "variants.metadata",
      "variants.manage_inventory", "variants.allow_backorder", "variants.inventory_items.required_quantity",
      "variants.inventory_items.inventory.location_levels.location_id",
      "variants.inventory_items.inventory.location_levels.stocked_quantity",
      "variants.inventory_items.inventory.location_levels.reserved_quantity",
    ],
    filters,
  })
  const variants = [...((data as any[])?.[0]?.variants ?? [])].sort(
    (a: any, b: any) => (a?.variant_rank ?? 0) - (b?.variant_rank ?? 0)
  )

  // Stock the order edit will reserve from: the order's sales-channel locations.
  // Medusa refuses the edit when a size is short, so check first and say which.
  const { data: channels } = order.sales_channel_id
    ? await query.graph({ entity: "sales_channel", fields: ["stock_locations.id"], filters: { id: order.sales_channel_id } })
    : { data: [] }
  const locations = new Set(((channels as any[])?.[0]?.stock_locations ?? []).map((l: any) => l.id))
  const available = new Map<string, number | null>(
    variants.map((v: any) => {
      const item = v.inventory_items?.[0]
      if (!v.manage_inventory || v.allow_backorder || !item) return [v.id, null]
      const per = Number(item.required_quantity ?? 1) || 1
      const levels = (item.inventory?.location_levels ?? []).filter((l: any) => locations.has(l.location_id))
      const best = Math.max(0, ...levels.map((l: any) => Number(l.stocked_quantity ?? 0) - Number(l.reserved_quantity ?? 0)))
      return [v.id, Math.floor(best / per)]
    })
  )

  // Bigger sizes cost more: suggest the quoted price plus the garment's
  // ladder difference over its cheapest size, at the order's garment count.
  // ponytail: ladder from variant metadata (same source as the Job pricer); staff can change any price.
  const garmentQty = (order.items ?? []).reduce(
    (n: number, i: any) => (i.variant_id || isSizesPendingLine(i) ? n + Number(i.quantity ?? 0) : n),
    0
  )
  const choices = sizeChoices(variants, pending.colour)
  const ladder = choices.map((c) => garmentMajorWithTier(variants.find((v: any) => v.id === c.variant_id)?.metadata, Math.max(1, garmentQty)))
  const known = ladder.filter((p): p is number => p != null)
  const base = known.length ? Math.min(...known) : 0
  const quoted = Number(line.unit_price ?? 0)
  const options = choices.map((c, i) => ({
    ...c,
    unit_price: round2(quoted + Math.max(0, (ladder[i] ?? base) - base)),
    available: available.get(c.variant_id) ?? null,
  }))
  return { order, line, pending, options }
}

export async function sizeOptionsForLine(container: MedusaContainer, orderId: string, lineItemId: string) {
  const { line, pending, options } = await load(container, orderId, lineItemId)
  return {
    line: { id: line.id, title: line.title, quantity: Number(line.quantity ?? 0), unit_price: Number(line.unit_price ?? 0), colour: pending.colour },
    sizes: options,
  }
}

export async function enterLineSizes(
  container: MedusaContainer,
  input: { orderId: string; lineItemId: string; sizes: SizeEntry[]; actorId?: string | null }
): Promise<{ line_item_ids: string[] }> {
  const { order, line, options } = await load(container, input.orderId, input.lineItemId)
  if (!options.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "No sizes found for this garment and colour.")
  }
  const error = sizeSplitError(Number(line.quantity ?? 0), input.sizes, new Set(options.map((o) => o.variant_id)))
  if (error) throw new MedusaError(MedusaError.Types.INVALID_DATA, error)

  const used = input.sizes.filter((s) => s.quantity > 0)
  const { sizes_pending: _p, quote_custom_line: _c, ...details } = (line.metadata ?? {}) as Record<string, any>
  const design = details.customizerDesign && typeof details.customizerDesign === "object" ? details.customizerDesign : null
  const sizeList = used.map((s) => ({ size: options.find((o) => o.variant_id === s.variant_id)!.size, quantity: s.quantity }))
  const short = shortSizes(
    used.map((s, i) => ({ variant_id: s.variant_id, size: sizeList[i].size, quantity: s.quantity })),
    new Map(options.map((o) => [o.variant_id, o.available]))
  )
  if (short.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Not enough stock: ${short.map((s) => `${s.size} has ${s.available}`).join(", ")}. Pick another size, or check the supplier.`
    )
  }
  const before = new Set((order.items ?? []).map((i: any) => i.id))

  await beginOrderEditOrderWorkflow(container).run({ input: { order_id: order.id, created_by: input.actorId ?? undefined } })
  try {
    await orderEditAddNewItemWorkflow(container).run({
      input: {
        order_id: order.id,
        items: used.map((s) => ({
          variant_id: s.variant_id,
          quantity: s.quantity,
          unit_price: s.unit_price,
          // Inc-GST pricing, as on the quoted line.
          is_tax_inclusive: true,
          metadata: {
            ...details,
            ...(design ? { customizerDesign: { ...design, variantId: s.variant_id, sizes: sizeList } } : {}),
          },
          internal_note: `Sizes entered for "${line.title}"`,
        })) as any,
      },
    })
    await orderEditUpdateItemQuantityWorkflow(container).run({
      input: { order_id: order.id, items: [{ id: line.id, quantity: 0 }] },
    })
    await requestOrderEditRequestWorkflow(container).run({
      input: { order_id: order.id, requested_by: input.actorId ?? undefined },
    })
    await confirmOrderEditRequestWorkflow(container).run({
      input: { order_id: order.id, confirmed_by: input.actorId ?? undefined },
    })
  } catch (err) {
    try {
      await cancelBeginOrderEditWorkflow(container).run({ input: { order_id: order.id } })
    } catch {
      /* already confirmed or nothing to cancel */
    }
    throw err
  }

  const orderModule = container.resolve(Modules.ORDER) as any
  const after = await orderModule.retrieveOrder(order.id, { relations: ["items"] })
  const added: string[] = (after.items ?? []).map((i: any) => i.id).filter((id: string) => !before.has(id))

  // Proofs and print notes made on the waiting line move to the first size line
  // (the proof PDF and DSP pack group a design's lines and read the first).
  if (added[0]) {
    const patch = rekeyLineScopedMetadata(order.metadata, line.id, added[0])
    if (Object.keys(patch).length) await mergeOrderMetadata(container, order.id, patch)
  }

  await writeAudit({
    container,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: order.id,
    action: AUDIT_ACTION.SIZES_ENTERED,
    actor_id: input.actorId ?? undefined,
    details: { line_item_id: line.id, title: line.title, sizes: sizeList, new_line_item_ids: added },
  })

  return { line_item_ids: added }
}
