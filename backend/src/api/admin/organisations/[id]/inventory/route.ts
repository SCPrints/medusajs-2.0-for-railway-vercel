import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

import { ORGANISATION_MODULE } from "../../../../../modules/organisation"
import { ORG_INVENTORY_MODULE } from "../../../../../modules/org-inventory"
import type OrganisationModuleService from "../../../../../modules/organisation/service"
import type OrgInventoryModuleService from "../../../../../modules/org-inventory/service"

const createSchema = z.object({
  product_variant_id: z.string().min(1),
  organisation_design_id: z.string().min(1),
  fulfillment_mode: z.enum(["held_stock", "print_on_demand"]).optional(),
  unit_price: z.number().int().nonnegative(),
  unit_cost: z.number().int().nonnegative(),
  reorder_point: z.number().int().nonnegative().nullable().optional(),
  reorder_quantity: z.number().int().nonnegative().nullable().optional(),
  lead_time_days: z.number().int().nonnegative().nullable().optional(),
  customer_facing_label: z.string().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
  initial_quantity: z.number().int().nonnegative().optional(),
})

type EnrichedRow = {
  id: string
  organisation_id: string
  product_variant_id: string
  organisation_design_id: string
  fulfillment_mode: "held_stock" | "print_on_demand"
  unit_price: number
  unit_cost: number
  quantity_on_hand: number
  quantity_reserved: number
  available: number
  reorder_point: number | null
  reorder_quantity: number | null
  lead_time_days: number | null
  customer_facing_label: string | null
  is_active: boolean
  variant_title: string | null
  product_title: string | null
  design_name: string | null
  design_thumbnail_url: string | null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const activeOnly = req.query?.active === "1" || req.query?.active === "true"
  const designId = req.query?.design_id ? String(req.query.design_id) : undefined
  const mode = req.query?.mode ? String(req.query.mode) : undefined
  const belowReorder =
    req.query?.below_reorder === "1" || req.query?.below_reorder === "true"

  const orgService =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  try {
    await orgService.retrieveOrganisation(id)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }

  const invService =
    req.scope.resolve<OrgInventoryModuleService>(ORG_INVENTORY_MODULE)

  const filters: Record<string, unknown> = { organisation_id: id }
  if (activeOnly) filters.is_active = true
  if (designId) filters.organisation_design_id = designId
  if (mode) filters.fulfillment_mode = mode

  const rows = (await invService.listOrgInventories(filters, {
    take: 1000,
    order: { created_at: "DESC" },
  })) as any[]

  // Hydrate variant + design context via the graph query
  const variantIds = Array.from(new Set(rows.map((r) => r.product_variant_id)))
  const designIds = Array.from(
    new Set(rows.map((r) => r.organisation_design_id))
  )

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const variantContext: Record<
    string,
    { variant_title: string | null; product_title: string | null }
  > = {}
  if (variantIds.length > 0) {
    try {
      const { data } = await query.graph({
        entity: "product_variant",
        fields: ["id", "title", "product.title"],
        filters: { id: variantIds },
      })
      for (const v of data ?? []) {
        variantContext[v.id] = {
          variant_title: v.title ?? null,
          product_title: v.product?.title ?? null,
        }
      }
    } catch {
      /* graph may be unavailable in tests — fall back to nulls */
    }
  }

  const designContext: Record<
    string,
    { design_name: string | null; design_thumbnail_url: string | null }
  > = {}
  if (designIds.length > 0) {
    const designs = await orgService.listOrganisationDesigns(
      { id: designIds } as any,
      { take: designIds.length }
    )
    for (const d of designs as any[]) {
      designContext[d.id] = {
        design_name: d.name ?? null,
        design_thumbnail_url: d.thumbnail_url ?? null,
      }
    }
  }

  let enriched: EnrichedRow[] = rows.map((r) => {
    const vctx = variantContext[r.product_variant_id] ?? {
      variant_title: null,
      product_title: null,
    }
    const dctx = designContext[r.organisation_design_id] ?? {
      design_name: null,
      design_thumbnail_url: null,
    }
    return {
      id: r.id,
      organisation_id: r.organisation_id,
      product_variant_id: r.product_variant_id,
      organisation_design_id: r.organisation_design_id,
      fulfillment_mode: r.fulfillment_mode,
      unit_price: r.unit_price,
      unit_cost: r.unit_cost,
      quantity_on_hand: r.quantity_on_hand,
      quantity_reserved: r.quantity_reserved,
      available: (r.quantity_on_hand ?? 0) - (r.quantity_reserved ?? 0),
      reorder_point: r.reorder_point,
      reorder_quantity: r.reorder_quantity,
      lead_time_days: r.lead_time_days,
      customer_facing_label: r.customer_facing_label,
      is_active: r.is_active,
      variant_title: vctx.variant_title,
      product_title: vctx.product_title,
      design_name: dctx.design_name,
      design_thumbnail_url: dctx.design_thumbnail_url,
    }
  })

  if (belowReorder) {
    enriched = enriched.filter(
      (r) =>
        r.fulfillment_mode === "held_stock" &&
        r.reorder_point != null &&
        r.available <= r.reorder_point
    )
  }

  res.json({ inventory: enriched })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }
  const orgService =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  try {
    await orgService.retrieveOrganisation(id)
  } catch {
    return res.status(404).json({ error: "organisation not found" })
  }
  // Validate the design belongs to this org
  try {
    const design = (await orgService.retrieveOrganisationDesign(
      body.organisation_design_id
    )) as any
    if (design.organisation_id !== id) {
      return res.status(400).json({ error: "design does not belong to organisation" })
    }
  } catch {
    return res.status(400).json({ error: "design not found" })
  }

  const invService =
    req.scope.resolve<OrgInventoryModuleService>(ORG_INVENTORY_MODULE)

  const [created] = await invService.createOrgInventories([
    {
      organisation_id: id,
      product_variant_id: body.product_variant_id,
      organisation_design_id: body.organisation_design_id,
      fulfillment_mode: body.fulfillment_mode ?? "held_stock",
      unit_price: body.unit_price,
      unit_cost: body.unit_cost,
      quantity_on_hand: 0,
      quantity_reserved: 0,
      reorder_point: body.reorder_point ?? null,
      reorder_quantity: body.reorder_quantity ?? null,
      lead_time_days: body.lead_time_days ?? null,
      customer_facing_label: body.customer_facing_label ?? null,
      is_active: body.is_active ?? true,
      metadata: {},
    } as any,
  ])

  // Optionally seed initial stock via an adjustment_up movement
  if (body.initial_quantity && body.initial_quantity > 0) {
    await invService.adjust({
      org_inventory_id: created.id,
      target_quantity: body.initial_quantity,
      notes: "Initial seed",
      actor_id: (req as any).auth_context?.actor_id ?? null,
    })
  }

  res.status(201).json({ inventory: created })
}
