import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"

import { DESIGNS_MODULE } from "../../../../../modules/designs"
import type DesignsModuleService from "../../../../../modules/designs/service"
import { getPostHog } from "../../../../../lib/posthog"
import { decorateDesigns } from "../../../../../lib/owned-design"
import {
  listCustomerOrgs,
  visibleToCustomerFilter,
} from "../../../../../lib/customer-org-sharing"
import { requireCustomer } from "../../../../../lib/require-customer"

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  thumbnail_url: z.string().url().optional(),
  base_product_id: z.string().min(1).optional(),
  base_variant_id: z.string().min(1).optional(),
  customizer_metadata: z.record(z.string(), z.unknown()),
})

/**
 * design id → when an order that used it had its artwork approved. One query
 * for the whole page. Only orders placed from a saved design carry
 * `source_design_id` on their lines (no backfill for older orders).
 */
async function approvedAtByDesign(
  scope: AuthenticatedMedusaRequest["scope"],
  designIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (designIds.length === 0) return out
  try {
    const pg = scope.resolve<any>("__pg_connection__")
    const { rows } = await pg.raw(
      `select li.metadata->>'source_design_id' as design_id,
              max(o.metadata->>'artwork_approved_at') as approved_at
         from order_line_item li
         join order_item oi on oi.item_id = li.id and oi.deleted_at is null
         join "order" o on o.id = oi.order_id
        where li.deleted_at is null
          and o.deleted_at is null
          and o.canceled_at is null
          and li.metadata->>'source_design_id' = any(?)
          and o.metadata->>'artwork_approved_at' is not null
        group by 1`,
      [designIds]
    )
    for (const r of rows ?? []) out.set(r.design_id, r.approved_at)
  } catch {
    // The badge is a nicety; never break the list for it.
  }
  return out
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = requireCustomer(req)
  const query = listQuerySchema.parse(req.query ?? {})
  const designsService = req.scope.resolve<DesignsModuleService>(DESIGNS_MODULE)
  const orgs = await listCustomerOrgs(req.scope, customerId)

  // Own designs + designs shared to any of my organisations.
  const [designs, count] = await designsService.listAndCountDesigns(
    visibleToCustomerFilter(customerId, orgs) as any,
    {
      take: query.limit ?? 50,
      skip: query.offset ?? 0,
      order: { created_at: "DESC" },
    }
  )

  const approved = await approvedAtByDesign(req.scope, designs.map((d: any) => d.id))
  res.json({
    designs: (await decorateDesigns(req.scope, designs, customerId, orgs)).map((d: any) => ({
      ...d,
      approved: approved.has(d.id),
      approved_at: approved.get(d.id) ?? null,
    })),
    count,
    limit: query.limit ?? 50,
    offset: query.offset ?? 0,
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = requireCustomer(req)
  const body = createBodySchema.parse(req.body ?? {})
  const designsService = req.scope.resolve<DesignsModuleService>(DESIGNS_MODULE)

  const [created] = await designsService.createDesigns([
    {
      customer_id: customerId,
      name: body.name,
      thumbnail_url: body.thumbnail_url ?? null,
      base_product_id: body.base_product_id ?? null,
      base_variant_id: body.base_variant_id ?? null,
      customizer_metadata: body.customizer_metadata,
    },
  ])

  getPostHog()?.capture({
    distinctId: customerId,
    event: "design saved",
    properties: {
      design_id: created.id,
      design_name: body.name,
      base_product_id: body.base_product_id ?? null,
      base_variant_id: body.base_variant_id ?? null,
    },
  })

  res.status(201).json({ design: created })
}
