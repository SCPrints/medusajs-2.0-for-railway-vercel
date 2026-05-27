import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import { ORG_INVENTORY_MODULE } from "../../../../../../../modules/org-inventory"
import type OrganisationModuleService from "../../../../../../../modules/organisation/service"
import type OrgInventoryModuleService from "../../../../../../../modules/org-inventory/service"
import { requireMembership } from "../../_helpers"

type CustomerInventoryRow = {
  id: string
  organisation_id: string
  product_variant_id: string
  organisation_design_id: string
  fulfillment_mode: "held_stock" | "print_on_demand"
  unit_price: number
  quantity_on_hand: number
  quantity_reserved: number
  available: number
  reorder_point: number | null
  lead_time_days: number | null
  customer_facing_label: string | null
  is_active: boolean
  variant_title: string | null
  product_title: string | null
  design_name: string | null
  design_thumbnail_url: string | null
}

/**
 * GET /store/customers/me/organisations/[id]/inventory
 *
 * Customer-facing inventory grid. Mirrors the admin grid columns
 * (P2-Q3: full admin-parity visibility) but never exposes unit_cost.
 *
 * Optional filters:
 *  - design_id
 *  - mode = "held_stock" | "print_on_demand"
 *  - below_reorder = "1" | "true" — show only rows below their reorder point
 *  - active_only is implicit (always filters to is_active=true)
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  const designId = req.query?.design_id
    ? String(req.query.design_id)
    : undefined
  const mode = req.query?.mode ? String(req.query.mode) : undefined
  const belowReorder =
    req.query?.below_reorder === "1" || req.query?.below_reorder === "true"

  const orgService =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const invService =
    req.scope.resolve<OrgInventoryModuleService>(ORG_INVENTORY_MODULE)

  const filters: Record<string, unknown> = {
    organisation_id: membership.organisation_id,
    is_active: true,
  }
  if (designId) filters.organisation_design_id = designId
  if (mode === "held_stock" || mode === "print_on_demand") {
    filters.fulfillment_mode = mode
  }

  const rows = (await invService.listOrgInventories(filters, {
    take: 2000,
    order: { created_at: "DESC" },
  })) as any[]

  // Hydrate variant + design context
  const variantIds = Array.from(
    new Set(rows.map((r) => r.product_variant_id))
  )
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
      /* graph may be unavailable in tests */
    }
  }

  const designContext: Record<
    string,
    { design_name: string | null; design_thumbnail_url: string | null }
  > = {}
  if (designIds.length > 0) {
    const designs = (await orgService.listOrganisationDesigns(
      { id: designIds } as any,
      { take: designIds.length }
    )) as any[]
    for (const d of designs) {
      designContext[d.id] = {
        design_name: d.name ?? null,
        design_thumbnail_url: d.thumbnail_url ?? null,
      }
    }
  }

  let enriched: CustomerInventoryRow[] = rows.map((r) => {
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
      quantity_on_hand: r.quantity_on_hand ?? 0,
      quantity_reserved: r.quantity_reserved ?? 0,
      available: (r.quantity_on_hand ?? 0) - (r.quantity_reserved ?? 0),
      reorder_point: r.reorder_point,
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
