import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { buildDspPack, type DspGroupPack, type DspPricerState, type DspProduct } from "../../lib/dsp-job"
import { computeSidePlacements } from "../../lib/print-placement"
import { restoreSideLayouts } from "../../lib/side-layouts-archive"
import { QUOTE_MODULE } from "../../modules/quote"
import { resolveJobIds } from "../jobs/build"

export type DspPackResult = {
  po: string
  customer: string
  due_date: string | null
  packs: DspGroupPack[]
}

/**
 * Gathers a job's DSP pack: the job pricer state saved on the quote
 * (`metadata.job_pricer.state`), product brand/type, any print sizes measured
 * off Studio designs on the quote's lines, and the order's number + due date.
 */
export async function getDspPack(container: MedusaContainer, rawId: string): Promise<DspPackResult> {
  const { quoteId, orderId } = await resolveJobIds(container, rawId)
  if (!quoteId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "This job has no quote — price it in the job pricer first.")
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const quote: any = await (container.resolve(QUOTE_MODULE) as any).retrieveQuote(quoteId)
  const state = quote?.metadata?.job_pricer?.state as DspPricerState | undefined
  if (!state?.groups?.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "This job has no job pricer data — price it in the job pricer first.")
  }

  let order: any = null
  if (orderId) {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "metadata", "shipping_address.company", "shipping_address.first_name", "shipping_address.last_name"],
      filters: { id: orderId },
      pagination: { take: 1 },
    })
    order = (data as any[])?.[0] ?? null
  }

  // Products: brand + type for the stock-details line, Supacolour flag for "auto" print positions.
  const productIds = Array.from(new Set(state.groups.map((g) => g.product?.id).filter((id): id is string => Boolean(id))))
  const products: Record<string, DspProduct> = {}
  if (productIds.length) {
    const fields = ["id", "title", "metadata", "type.value"]
    const { data } = await query
      .graph({ entity: "product", fields: [...fields, "brand.name"], filters: { id: productIds } })
      .catch(() => query.graph({ entity: "product", fields, filters: { id: productIds } }))
    for (const p of (data as any[]) ?? []) {
      products[p.id] = {
        title: p.title,
        brand: p.brand?.name ?? null,
        type: p.type?.value ?? null,
        supacolour: p.metadata?.decoration_pricing_class === "supacolour",
      }
    }
  }

  // Print sizes the Studio measured, for positions staff didn't size by hand.
  const placements: Record<string, Record<string, { widthMm: number; heightMm: number }>> = {}
  for (const li of ((quote.line_items as any)?.items ?? []) as any[]) {
    const gid = li?.group_id
    if (!gid || placements[gid] || !li.customizerDesign || typeof li.customizerDesign !== "object") continue
    const design = await restoreSideLayouts(li.customizerDesign)
    const bySide: Record<string, { widthMm: number; heightMm: number }> = {}
    for (const p of computeSidePlacements(design)) bySide[p.side] = { widthMm: p.widthMm, heightMm: p.heightMm }
    if (Object.keys(bySide).length) placements[gid] = bySide
  }

  const ship = order?.shipping_address ?? null
  const customer =
    quote.company ||
    ship?.company ||
    quote.contact_name ||
    [ship?.first_name, ship?.last_name].filter(Boolean).join(" ") ||
    quote.email ||
    "Customer"
  const po = order?.display_id != null ? String(order.display_id) : quote.public_id
  const dueDate = typeof order?.metadata?.production_due_date === "string" ? order.metadata.production_due_date : null

  return { po, customer, due_date: dueDate, packs: buildDspPack({ state, products, poNumber: po, customer, dueDate, placements }) }
}
