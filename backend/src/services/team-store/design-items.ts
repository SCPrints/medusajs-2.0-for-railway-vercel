import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { restoreSideLayouts } from "../../lib/side-layouts-archive"
import { variantColour } from "../../lib/team-store"
import { TEAM_STORE_MODULE } from "../../modules/team-store"
import { designFields } from "./admin"
import { verifyTeamStore } from "./sign"

/**
 * The Studio's quote-mode relay for team-store items. The staff Studio is
 * opened with `quote_id=<tsitem_…>` (admin design-link route) and posts back
 * to /store/quotes/:id/design-items exactly as it does for quotes; that route
 * hands `tsitem_` ids here. The design is stored on the item (archived to R2);
 * the Studio's per-size lines are ignored — sizes and price are set in admin.
 */
export const isTeamStoreItemId = (id: unknown): boolean => typeof id === "string" && id.startsWith("tsitem_")

export async function teamStoreDesignGET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  if (!verifyTeamStore("design", id, req.query.qsig)) return res.status(400).json({ error: "invalid_signature" })
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const item = await service.retrieveTeamStoreItem(id).catch(() => null)
  if (!item) return res.status(404).json({ error: "not_found" })
  res.json({ customizerDesign: item.customizer_design ? await restoreSideLayouts(item.customizer_design) : null })
}

export async function teamStoreDesignPOST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const body = (req.body ?? {}) as Record<string, any>
  if (!verifyTeamStore("design", id, body.qsig)) return res.status(400).json({ error: "invalid_signature" })
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const item = await service.retrieveTeamStoreItem(id).catch(() => null)
  if (!item) return res.status(404).json({ error: "not_found" })
  const store = await service.retrieveTeamStore(item.team_store_id)
  if (!["draft", "awaiting_approval"].includes(store.status)) {
    // Buyers have seen (and bought) the approved artwork.
    return res.status(409).json({ error: "team_store_not_editable", status: store.status })
  }

  const lines: any[] = Array.isArray(body.lines) ? body.lines : []
  const design =
    (body.design && typeof body.design === "object" ? body.design : null) ??
    (lines.find((l) => l?.metadata?.customizerDesign)?.metadata?.customizerDesign as Record<string, unknown> | undefined) ??
    null
  if (!design) return res.status(400).json({ error: "design required" })

  // Staff may switch colour (or garment) inside the Studio: follow the design.
  const patch: Record<string, unknown> = await designFields(req.scope, store.id, design)
  const variantId = lines.find((l) => typeof l?.variant_id === "string")?.variant_id ?? design.variantId
  if (typeof variantId === "string") {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({
      entity: "variant",
      filters: { id: variantId },
      fields: ["id", "title", "options.value", "options.option.title", "product.handle"],
    })
    const v = data?.[0]
    const colour = v ? variantColour(v) : null
    if (v?.product?.handle) patch.product_handle = v.product.handle
    if (colour) patch.colour = colour
  }
  // A new design must be approved again.
  if (store.status === "awaiting_approval" && store.approved_at) {
    await service.updateTeamStores({ id: store.id, approved_at: null, approved_by_name: null })
  }
  await service.updateTeamStoreItems({ id: item.id, ...patch })
  res.status(201).json({ ok: true, lines: [], count: 0 })
}
