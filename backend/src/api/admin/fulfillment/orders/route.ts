import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  OrderStatus,
} from "@medusajs/framework/utils"
import {
  convertDraftOrderWorkflow,
  createOrderWorkflow,
} from "@medusajs/medusa/core-flows"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../lib/audit-entities"
import { writeAudit } from "../../../../lib/audit-log"
import { captureEvent } from "../../../../lib/posthog"
import { ORGANISATION_MODULE } from "../../../../modules/organisation"
import { ORG_INVENTORY_MODULE } from "../../../../modules/org-inventory"
import type OrganisationModuleService from "../../../../modules/organisation/service"
import type OrgInventoryModuleService from "../../../../modules/org-inventory/service"

const lineItemSchema = z.object({
  org_inventory_id: z.string().min(1),
  quantity: z.number().int().positive(),
})

const createSchema = z.object({
  organisation_id: z.string().min(1),
  organisation_destination_id: z.string().min(1),
  items: z.array(lineItemSchema).min(1),
  external_ref: z.string().max(120).nullable().optional(),
  requested_ship_by: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  source: z
    .enum(["manual_admin", "email_parsed", "portal", "api"])
    .optional(),
})

type CreatePayload = z.infer<typeof createSchema>

/**
 * GET /admin/fulfillment/orders — list orders where
 * metadata.fulfillment_order = true.
 *
 * Filters: organisation_id, organisation_destination_id, source.
 *
 * Uses the QUERY graph because the order module is core Medusa and
 * doesn't have org-scoped methods. Filtering by metadata happens
 * server-side via QUERY's filter pushdown.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const filters: Record<string, unknown> = {
    metadata: { fulfillment_order: true },
  }
  if (req.query.organisation_id) {
    filters.metadata = {
      ...(filters.metadata as Record<string, unknown>),
      organisation_id: String(req.query.organisation_id),
    }
  }
  if (req.query.organisation_destination_id) {
    filters.metadata = {
      ...(filters.metadata as Record<string, unknown>),
      organisation_destination_id: String(
        req.query.organisation_destination_id
      ),
    }
  }
  try {
    const { data: orders } = await query.graph({
      entity: "orders",
      filters,
      fields: [
        "id",
        "display_id",
        "email",
        "total",
        "currency_code",
        "status",
        "created_at",
        "metadata",
      ],
      pagination: {
        take: 200,
        order: { created_at: "DESC" },
      },
    })
    res.json({ orders: orders ?? [] })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "list failed" })
  }
}

/**
 * POST /admin/fulfillment/orders
 *
 * Creates a fulfillment order from an admin-entered "I just got this in
 * the inbox from Lifegrain" email. Validates the (org, destination,
 * inventory rows) belong together, builds line items snapshotting the
 * design + variant context for downstream production widgets, and
 * stamps metadata.fulfillment_order so the Phase 1 subscribers fire.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → Workflow A.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  let body: CreatePayload
  try {
    body = createSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  const orgService =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const invService =
    req.scope.resolve<OrgInventoryModuleService>(ORG_INVENTORY_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any

  // --- Validate the org has a primary contact set
  let organisation: any
  try {
    organisation = await orgService.retrieveOrganisation(body.organisation_id)
  } catch {
    return res.status(404).json({ error: "organisation not found" })
  }
  if (!organisation.primary_contact_customer_id) {
    return res.status(400).json({
      error:
        "Organisation must have a primary_contact_customer_id set before placing fulfillment orders. Edit the org and set it on the Overview tab.",
    })
  }

  // --- Validate destination belongs to this org and is active
  let destination: any
  try {
    destination = await orgService.retrieveOrganisationDestination(
      body.organisation_destination_id
    )
  } catch {
    return res.status(404).json({ error: "destination not found" })
  }
  if (destination.organisation_id !== body.organisation_id) {
    return res
      .status(400)
      .json({ error: "destination does not belong to organisation" })
  }
  if (!destination.is_active) {
    return res.status(400).json({ error: "destination is inactive" })
  }

  // --- Hydrate inventory rows + validate they belong to the org
  const invIds = body.items.map((i) => i.org_inventory_id)
  const invRows = (await invService.listOrgInventories(
    { id: invIds } as any,
    { take: invIds.length }
  )) as any[]
  if (invRows.length !== invIds.length) {
    return res.status(400).json({ error: "one or more inventory rows not found" })
  }
  for (const r of invRows) {
    if (r.organisation_id !== body.organisation_id) {
      return res
        .status(400)
        .json({ error: "inventory row does not belong to organisation" })
    }
    if (!r.is_active) {
      return res.status(400).json({
        error: `inventory row ${r.id} is inactive`,
      })
    }
  }
  const invById: Record<string, any> = {}
  for (const r of invRows) invById[r.id] = r

  // --- Hydrate design names + variant titles for line item titles
  const designIds = Array.from(
    new Set(invRows.map((r) => r.organisation_design_id))
  )
  const designs = (await orgService.listOrganisationDesigns(
    { id: designIds } as any,
    { take: designIds.length }
  )) as any[]
  const designById: Record<string, any> = {}
  for (const d of designs) designById[d.id] = d

  const variantIds = Array.from(
    new Set(invRows.map((r) => r.product_variant_id))
  )
  const variantContext: Record<
    string,
    { variant_title: string | null; product_title: string | null }
  > = {}
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
    /* graph unavailable → titles fall back to ids */
  }

  // --- Query the AU region at runtime (audit gotcha #1)
  let auRegionId: string | null = null
  let auCurrencyCode = "aud"
  try {
    const { data: regions } = await query.graph({
      entity: "region",
      fields: ["id", "currency_code", "name"],
      filters: { name: "Australia" },
    })
    const region = regions?.[0]
    if (region) {
      auRegionId = region.id
      auCurrencyCode = region.currency_code ?? "aud"
    }
  } catch {
    /* fall through — error below */
  }
  if (!auRegionId) {
    return res.status(500).json({
      error:
        "AU region not found in Medusa. Cannot create fulfillment order without a region.",
    })
  }

  // --- Build line item payloads, converting cents → dollars
  const lineItems = body.items.map((item) => {
    const inv = invById[item.org_inventory_id]
    const design = designById[inv.organisation_design_id]
    const vctx = variantContext[inv.product_variant_id] ?? {
      variant_title: null,
      product_title: null,
    }
    const designName = design?.name ?? inv.organisation_design_id
    const variantLabel =
      inv.customer_facing_label ??
      vctx.variant_title ??
      inv.product_variant_id
    return {
      title: `${designName} — ${variantLabel}`,
      variant_id: inv.product_variant_id,
      quantity: item.quantity,
      unit_price: inv.unit_price / 100, // cents → dollars
      metadata: {
        fulfillment_line: true,
        org_inventory_id: inv.id,
        organisation_id: inv.organisation_id,
        organisation_design_id: inv.organisation_design_id,
        fulfillment_mode: inv.fulfillment_mode,
        unit_cost_cents: inv.unit_cost,
        print_file_url: design?.print_file_url ?? null,
        ...(design?.customizer_metadata
          ? { customizerDesign: design.customizer_metadata }
          : {}),
      },
    }
  })

  // --- Build shipping address from destination snapshot
  const shippingAddress = {
    first_name: destination.contact_name?.split(" ")[0] ?? destination.name,
    last_name:
      destination.contact_name?.split(" ").slice(1).join(" ") || "Receiving",
    company: organisation.name ?? undefined,
    address_1: destination.address_1,
    address_2: destination.address_2 ?? undefined,
    city: destination.city,
    province: destination.province ?? "",
    postal_code: destination.postal_code,
    country_code: (destination.country_code ?? "au").toLowerCase(),
    phone: destination.contact_phone ?? undefined,
  }

  // --- Compose the order input
  const orderInput: any = {
    region_id: auRegionId,
    currency_code: auCurrencyCode,
    customer_id: organisation.primary_contact_customer_id,
    email: organisation.contact_email ?? undefined,
    shipping_address: shippingAddress,
    billing_address: shippingAddress,
    status: OrderStatus.DRAFT,
    is_draft_order: true,
    no_notification: false, // Let stage-changed emails fire normally
    metadata: {
      fulfillment_order: true,
      organisation_id: body.organisation_id,
      organisation_destination_id: body.organisation_destination_id,
      external_ref: body.external_ref ?? null,
      requested_ship_by: body.requested_ship_by ?? null,
      source: body.source ?? "manual_admin",
      placed_by_admin_user_id: (req as any).auth_context?.actor_id ?? null,
      notes: body.notes ?? null,
    },
    items: lineItems,
  }

  // --- Create draft + convert to pending.
  // The two workflows don't share a transaction, so if the convert step
  // fails after the draft is created we must delete the orphaned draft —
  // otherwise a partial failure leaves a stray draft order behind.
  let orderId: string
  try {
    const draftResult = await createOrderWorkflow(req.scope).run({
      input: orderInput,
    })
    const draftId = (draftResult as any)?.result?.id
    if (!draftId) {
      throw new Error("draft order creation returned no id")
    }
    try {
      await convertDraftOrderWorkflow(req.scope).run({
        input: { id: draftId },
      })
    } catch (convertErr) {
      // Best-effort cleanup of the orphaned draft; never mask the real error.
      try {
        const orderModule = req.scope.resolve(Modules.ORDER) as any
        await orderModule.deleteOrders([draftId])
      } catch {
        /* if deletion also fails, leave the draft for manual cleanup */
      }
      throw convertErr
    }
    orderId = draftId
  } catch (err: any) {
    return res.status(500).json({
      error: "Failed to create fulfillment order",
      detail: String(err?.message ?? err),
    })
  }

  // Audit + PostHog
  const actorId = (req as any).auth_context?.actor_id ?? null
  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: orderId,
    action: AUDIT_ACTION.FULFILLMENT_ORDER_CREATED,
    actor_id: actorId,
    details: {
      organisation_id: body.organisation_id,
      organisation_destination_id: body.organisation_destination_id,
      external_ref: body.external_ref ?? null,
      source: body.source ?? "manual_admin",
      line_count: body.items.length,
    },
  })
  try {
    captureEvent(actorId ?? "system", "fulfillment_order_created", {
      order_id: orderId,
      organisation_id: body.organisation_id,
      destination_id: body.organisation_destination_id,
      line_count: body.items.length,
      source: body.source ?? "manual_admin",
    })
  } catch {
    /* PostHog best-effort */
  }

  res.status(201).json({ order_id: orderId })
}
