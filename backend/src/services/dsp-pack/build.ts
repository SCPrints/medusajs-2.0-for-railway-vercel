import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

import { buildDspPack, type DspGroupPack, type DspLine, type DspPlacement, type DspProduct } from "../../lib/dsp-job"
import { computeSidePlacements } from "../../lib/print-placement"
import { restoreSideLayouts } from "../../lib/side-layouts-archive"
import { QUOTE_MODULE } from "../../modules/quote"
import { resolveJobIds } from "../jobs/build"

export type DspPackResult = {
  order_id: string
  po: string
  customer: string
  due_date: string | null
  sent: Array<{ at: string; to: string; by: string | null }>
  packs: DspGroupPack[]
}

const stringMap = (raw: unknown): Record<string, string> =>
  raw && typeof raw === "object" && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === "string" && v.trim()) as Array<[string, string]>)
    : {}

/**
 * Gathers an order's DSP pack (lib/dsp-job.ts): lines + their customer
 * designs, product brand/type/Supacolour flag, measured placements, staff's
 * typed print dimensions and revised proofs, and the decoration notes from the
 * quote lines when the order came from a quote.
 */
export async function getDspPack(container: MedusaContainer, rawId: string): Promise<DspPackResult> {
  const { orderId } = await resolveJobIds(container, rawId)
  if (!orderId) throw new MedusaError(MedusaError.Types.NOT_FOUND, "The DSP pack is built from the order — this job has no order yet.")

  const order: any = await (container.resolve(Modules.ORDER) as any).retrieveOrder(orderId, { relations: ["items", "shipping_address"] })
  const meta = (order.metadata ?? {}) as Record<string, any>

  // Quote line descriptions carry the staff's decoration notes ("white + green ink …").
  const notesByTitle = new Map<string, string>()
  if (typeof meta.quote_id === "string") {
    const quote: any = await (container.resolve(QUOTE_MODULE) as any).retrieveQuote(meta.quote_id).catch(() => null)
    for (const li of ((quote?.line_items as any)?.items ?? []) as any[]) {
      if (li?.title && typeof li.description === "string" && li.description.trim()) notesByTitle.set(li.title, li.description.trim())
    }
  }

  const lines: DspLine[] = []
  const placements: Record<string, DspPlacement[]> = {}
  for (const it of (order.items ?? []) as any[]) {
    const raw = it.metadata?.customizerDesign
    if (!raw || typeof raw !== "object") continue
    const [colour, size] = String(it.variant_title ?? "").includes(" / ") ? String(it.variant_title).split(" / ") : [null, it.variant_title ?? null]
    lines.push({
      id: it.id,
      productId: it.product_id ?? null,
      // Line title carries brand + style code ("AS Colour Staple Tee 5001 — Grey Marle / L"); product_title often doesn't.
      productTitle: String(it.title ?? it.product_title ?? "Garment").split(" — ")[0],
      colour,
      size,
      quantity: Number(it.quantity ?? 0),
      design: raw,
      notes: notesByTitle.get(it.title) ?? (typeof it.metadata?.description === "string" ? it.metadata.description : null),
    })
    placements[it.id] = computeSidePlacements(await restoreSideLayouts(raw))
  }

  const productIds = Array.from(new Set(lines.map((l) => l.productId).filter((id): id is string => Boolean(id))))
  const products: Record<string, DspProduct> = {}
  if (productIds.length) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
    const fields = ["id", "metadata", "type.value"]
    const { data } = await query
      .graph({ entity: "product", fields: [...fields, "brand.name"], filters: { id: productIds } })
      .catch(() => query.graph({ entity: "product", fields, filters: { id: productIds } }))
    for (const p of (data as any[]) ?? []) {
      products[p.id] = { brand: p.brand?.name ?? null, type: p.type?.value ?? null, supacolour: p.metadata?.decoration_pricing_class === "supacolour" }
    }
  }

  // Latest revised proof per line + side (same rule as the mockup PDF).
  const revisedMockups: Record<string, string> = {}
  const revisedAt: Record<string, string> = {}
  for (const p of (Array.isArray(meta.revised_proofs) ? meta.revised_proofs : []) as any[]) {
    if (!p?.line_item_id || typeof p.side !== "string" || typeof p.url !== "string" || !p.url.startsWith("http")) continue
    const key = `${p.line_item_id}:${p.side}`
    const at = typeof p.uploaded_at === "string" ? p.uploaded_at : ""
    if (!revisedAt[key] || at >= revisedAt[key]) {
      revisedAt[key] = at
      revisedMockups[key] = p.url
    }
  }

  const ship = order.shipping_address ?? null
  const customer = ship?.company || [ship?.first_name, ship?.last_name].filter(Boolean).join(" ") || order.email || "Customer"
  const po = String(order.display_id ?? order.id)
  const dueDate = typeof meta.production_due_date === "string" ? meta.production_due_date : null

  return {
    order_id: order.id,
    po,
    customer,
    due_date: dueDate,
    sent: Array.isArray(meta.dsp_sent) ? meta.dsp_sent : [],
    packs: buildDspPack({ poNumber: po, customer, dueDate, lines, products, placements, dimensions: stringMap(meta.mockup_print_dimensions), revisedMockups }),
  }
}
