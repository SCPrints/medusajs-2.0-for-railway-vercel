import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  beginOrderEditOrderWorkflow,
  confirmOrderEditRequestWorkflow,
  orderEditUpdateItemQuantityWorkflow,
  requestOrderEditRequestWorkflow,
} from "@medusajs/medusa/core-flows"
import { z } from "zod"

import {
  SCREEN_MAX_COLOURS,
  screenUnitMajor,
} from "../../../../../lib/scp-screen-print-pricing"
import { writeAudit } from "../../../../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"

/**
 * Staff correction for screen orders where the customer's declared colour
 * count doesn't match the artwork: recompute the line's unit price with the
 * ACTUAL colour counts and run a Medusa order edit (line price + setup-line
 * quantity) in one shot. The invoice-correction back-and-forth becomes one
 * click on the order-detail widget.
 */

const paramsSchema = z.object({ id: z.string().min(1) })

const bodySchema = z.object({
  /** The customizer garment line to reprice. */
  line_item_id: z.string().min(1),
  /** Corrected colour count per screen-printed side, e.g. { front: 4 }. */
  colours_by_side: z.record(
    z.string(),
    z.coerce.number().int().min(1).max(SCREEN_MAX_COLOURS)
  ),
})

type ServerBlock = {
  garment_unit_major?: number
  print_total_major_per_garment?: number
  embroidery_total_major_per_garment?: number
  screen_side_keys?: string[]
  screen_breakdown?: Array<{
    side: string
    colours: number
    effectiveColours: number
    darkGarment: boolean
    heavyGarment: boolean
    unitPriceMajor: number
  }>
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id: orderId } = paramsSchema.parse(req.params ?? {})
  const body = bodySchema.parse(req.body ?? {})

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "items.id",
      "items.quantity",
      "items.metadata",
    ],
    filters: { id: orderId },
  })
  const order = orders?.[0] as
    | {
        id: string
        display_id?: number
        items?: Array<{ id: string; quantity: number; metadata?: Record<string, any> | null }>
      }
    | null
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order "${orderId}" not found.`)
  }

  const line = order.items?.find((i) => i.id === body.line_item_id)
  if (!line) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Line item "${body.line_item_id}" not found on this order.`
    )
  }

  const design = (line.metadata as any)?.customizerDesign as
    | Record<string, any>
    | undefined
  const server = design?.pricing?.server as ServerBlock | undefined
  const breakdown = server?.screen_breakdown
  if (!server || !Array.isArray(breakdown) || breakdown.length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This line has no screen-print pricing block — nothing to reprice."
    )
  }

  // Rebuild the screen portion with the corrected colour counts; every other
  // component (garment, DTF print, embroidery) keeps its stamped value.
  const quantity = Math.max(1, Math.floor(line.quantity || 1))
  let newScreenTotal = 0
  let oldScreenTotal = 0
  const newBreakdown = breakdown.map((entry) => {
    oldScreenTotal = round2(oldScreenTotal + (entry.unitPriceMajor || 0))
    const corrected = body.colours_by_side[entry.side]
    const colours = corrected ?? entry.colours
    const result = screenUnitMajor({
      quantity,
      colours,
      darkGarment: entry.darkGarment === true,
      heavyGarment: entry.heavyGarment === true,
    })
    newScreenTotal = round2(newScreenTotal + result.unitMajor)
    return {
      ...entry,
      colours,
      effectiveColours: result.effectiveColours,
      unitPriceMajor: result.unitMajor,
      repriced_by_staff: corrected !== undefined && corrected !== entry.colours,
    }
  })

  const newUnitPrice = round2(
    Math.max(0, server.garment_unit_major ?? 0) +
      Math.max(0, server.print_total_major_per_garment ?? 0) +
      Math.max(0, server.embroidery_total_major_per_garment ?? 0) +
      newScreenTotal
  )
  const newScreens = newBreakdown.reduce((sum, e) => sum + e.effectiveColours, 0)

  // Setup-fee line for the same design group (stamped by the customizer).
  const groupId = design?.group_id as string | undefined
  const setupLine = groupId
    ? order.items?.find(
        (i) => (i.metadata as any)?.screen_setup_for_group === groupId
      )
    : undefined

  const internal_note = `Screen reprice: colour counts corrected to ${Object.entries(
    body.colours_by_side
  )
    .map(([side, n]) => `${side}=${n}`)
    .join(", ")} (was ${breakdown.map((e) => `${e.side}=${e.colours}`).join(", ")}).`

  // Order edit: begin → update item(s) → request → confirm.
  await beginOrderEditOrderWorkflow(req.scope).run({
    input: { order_id: orderId },
  })
  try {
    const items: Array<{
      id: string
      quantity: number
      unit_price?: number
      internal_note?: string
    }> = [
      {
        id: line.id,
        quantity,
        unit_price: newUnitPrice,
        internal_note,
      },
    ]
    if (setupLine && setupLine.quantity !== newScreens && newScreens > 0) {
      items.push({
        id: setupLine.id,
        quantity: newScreens,
        internal_note: `Screen setup corrected to ${newScreens} screens.`,
      })
    }
    await orderEditUpdateItemQuantityWorkflow(req.scope).run({
      input: { order_id: orderId, items },
    })
    await requestOrderEditRequestWorkflow(req.scope).run({
      input: { order_id: orderId, requested_by: (req as any).auth_context?.actor_id },
    })
    await confirmOrderEditRequestWorkflow(req.scope).run({
      input: { order_id: orderId, confirmed_by: (req as any).auth_context?.actor_id },
    })
  } catch (err) {
    // Best-effort rollback of the pending edit so the order isn't stuck with
    // an open change if any step failed.
    try {
      const { cancelBeginOrderEditWorkflow } = await import("@medusajs/medusa/core-flows")
      await cancelBeginOrderEditWorkflow(req.scope).run({ input: { order_id: orderId } })
    } catch {
      /* already confirmed or nothing to cancel */
    }
    throw err
  }

  // Persist the corrected breakdown into the line metadata so admin widgets +
  // any later recompute see the staff-corrected colour counts.
  try {
    const orderModule = req.scope.resolve("order") as {
      updateOrderLineItems: (
        selector: Record<string, unknown>,
        data: Record<string, unknown>
      ) => Promise<unknown>
    }
    const updatedDesign = {
      ...design,
      sideScreenConfigs: Object.fromEntries(
        newBreakdown.map((e) => [
          e.side,
          {
            side: e.side,
            colours: e.colours,
            darkGarment: e.darkGarment,
            detectedColours: e.colours,
            mismatchConfirmed: false,
          },
        ])
      ),
      pricing: {
        ...(design?.pricing ?? {}),
        server: {
          ...server,
          screen_breakdown: newBreakdown,
          screen_total_major_per_garment: newScreenTotal,
          unit_price_major: newUnitPrice,
          screen_repriced_at: new Date().toISOString(),
        },
      },
    }
    await orderModule.updateOrderLineItems(
      { id: line.id },
      { metadata: { ...(line.metadata ?? {}), customizerDesign: updatedDesign } }
    )
  } catch (err) {
    // Metadata stamp is best-effort — the money change already landed.
    console.warn("[screen-reprice] metadata update failed", err)
  }

  await writeAudit({
    container: req.scope,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: orderId,
    action: AUDIT_ACTION.SCREEN_REPRICED,
    actor_id: (req as any).auth_context?.actor_id,
    details: {
      line_item_id: line.id,
      colours_by_side: body.colours_by_side,
      old_screen_total: oldScreenTotal,
      new_screen_total: newScreenTotal,
      new_unit_price: newUnitPrice,
      setup_screens: newScreens,
    },
  })

  res.json({
    order_id: orderId,
    line_item_id: line.id,
    new_unit_price: newUnitPrice,
    screen_total_per_garment: newScreenTotal,
    setup_screens: newScreens,
    setup_line_updated: Boolean(setupLine && setupLine.quantity !== newScreens),
  })
}
