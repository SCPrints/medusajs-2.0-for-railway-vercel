import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

import { buildDspPack, type DspGroupPack, type DspLine, type DspPlacement, type DspProduct } from "../../lib/dsp-job"
import { computeSidePlacements } from "../../lib/print-placement"
import { restoreSideLayouts } from "../../lib/side-layouts-archive"
import { QUOTE_MODULE } from "../../modules/quote"
import { resolveJobIds } from "../jobs/build"
import { applyArtworkInks, sharedPantone } from "../../lib/dsp-inks"
import { artworkInks, garmentColour, printFileProblem } from "./pdf"

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

  // Latest revised proof per line + side (same rule as the mockup PDF): its
  // mockup for the garment picture, its artwork as the file DSP prints from.
  const revisedMockups: Record<string, string> = {}
  const revisedArtwork: Record<string, string> = {}
  const revisedAt: Record<string, string> = {}
  for (const p of (Array.isArray(meta.revised_proofs) ? meta.revised_proofs : []) as any[]) {
    if (!p?.line_item_id || typeof p.side !== "string" || typeof p.url !== "string" || !p.url.startsWith("http")) continue
    const key = `${p.line_item_id}:${p.side}`
    const at = typeof p.uploaded_at === "string" ? p.uploaded_at : ""
    if (!revisedAt[key] || at >= revisedAt[key]) {
      revisedAt[key] = at
      revisedMockups[key] = p.url
      if (typeof p.artwork_url === "string" && p.artwork_url.startsWith("http")) revisedArtwork[key] = p.artwork_url
      else delete revisedArtwork[key]
    }
  }

  const ship = order.shipping_address ?? null
  const customer = ship?.company || [ship?.first_name, ship?.last_name].filter(Boolean).join(" ") || order.email || "Customer"
  const po = String(order.display_id ?? order.id)
  const dueDate = typeof meta.production_due_date === "string" ? meta.production_due_date : null

  const packs = buildDspPack({
    poNumber: po,
    customer,
    dueDate,
    lines,
    products,
    placements,
    dimensions: stringMap(meta.mockup_print_dimensions),
    revisedMockups,
    revisedArtwork,
    printFiles: stringMap(meta.dsp_print_files),
  })
  await enrichFromImages(packs)

  return {
    order_id: order.id,
    po,
    customer,
    due_date: dueDate,
    sent: Array.isArray(meta.dsp_sent) ? meta.dsp_sent : [],
    packs,
  }
}

/**
 * Reads each page's images: the garment colour off the mockup (the proof's
 * artwork background), and the inks off the artwork — named, matched to the
 * nearest PMS, and flagged when the artwork has more inks than the order.
 */
export async function enrichFromImages(packs: DspGroupPack[]) {
  const get = async (url: string | null) => {
    if (!url) return null
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null
    } catch {
      return null
    }
  }
  // Images first (in parallel), then inks in order — vector (SVG) artwork first so its exact colours set each PMS.
  const pages = packs.flatMap((pack) => pack.pages.map((pg) => ({ pack, pg })))
  const read = await Promise.all(
    pages.map(async ({ pack, pg }) => {
      const [mockup, art, printFile] = await Promise.all([
        get(pg.garmentImageUrl),
        pg.method === "screen" ? get(pg.artworkUrl) : null,
        get(pg.printFileUrl),
      ])
      if (mockup) pg.garmentHex = await garmentColour(mockup)
      if (pg.printFileUrl) {
        const problem = await printFileProblem(printFile, pg.printSize)
        if (problem) pack.warnings.push(`${pg.positionLabel} print file: ${problem}`)
      }
      return { pack, pg, clusters: art ? await artworkInks(art) : null, vector: /\.svg($|\?)/i.test(pg.artworkUrl ?? "") }
    })
  )
  for (const pack of packs) {
    const pms = sharedPantone()
    for (const { pg, clusters } of read.filter((r) => r.pack === pack).sort((a, b) => Number(b.vector) - Number(a.vector))) {
      const warning = clusters ? applyArtworkInks(pg, clusters, pms) : null
      if (warning) pack.warnings.push(warning)
    }
  }
  if (packs.some((p) => p.pages.some((pg) => pg.pmsFromArtwork)))
    packs[0].warnings.push("PMS colours are the nearest match to the artwork — DSP should confirm them.")
}
