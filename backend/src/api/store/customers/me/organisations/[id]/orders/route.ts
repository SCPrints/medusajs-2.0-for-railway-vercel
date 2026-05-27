import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  OrderStatus,
} from "@medusajs/framework/utils"
import {
  convertDraftOrderWorkflow,
  createOrderWorkflow,
} from "@medusajs/medusa/core-flows"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../../../lib/audit-log"
import { captureEvent } from "../../../../../../../lib/posthog"
import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import { ORG_INVENTORY_MODULE } from "../../../../../../../modules/org-inventory"
import type OrganisationModuleService from "../../../../../../../modules/organisation/service"
import type OrgInventoryModuleService from "../../../../../../../modules/org-inventory/service"
import { requireMembership, requireRole } from "../../_helpers"

const MAX_TAKE = 100
const DEFAULT_TAKE = 20

/**
 * GET /store/customers/me/organisations/[id]/orders
 *
 * Order history filtered to this org via metadata.organisation_id.
 * Supports basic pagination (limit + offset). Members of any role can
 * read.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  const limit = Math.max(
    1,
    Math.min(MAX_TAKE, Number(req.query?.limit) || DEFAULT_TAKE)
  )
  const offset = Math.max(0, Number(req.query?.offset) || 0)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any

  const filters: Record<string, unknown> = {
    metadata: {
      fulfillment_order: true,
      organisation_id: membership.organisation_id,
    },
  }

  if (req.query?.destination_id) {
    filters.metadata = {
      ...(filters.metadata as Record<string, unknown>),
      organisation_destination_id: String(req.query.destination_id),
    }
  }

  let orders: any[] = []
  let count = 0
  try {
    const result = await query.graph({
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
        "items.id",
        "items.title",
        "items.quantity",
        "items.metadata",
      ],
      pagination: {
        skip: offset,
        take: limit,
        order: { created_at: "DESC" },
      },
    })
    orders = result.data ?? []
    count = result.metadata?.count ?? orders.length
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "list failed" })
  }

  const slim = orders.map((o) => {
    const items = (o.items ?? []) as any[]
    return {
      id: o.id,
      display_id: o.display_id,
      total: o.total,
      currency_code: o.currency_code,
      status: o.status,
      created_at: o.created_at,
      production_stage: o.metadata?.production_stage ?? null,
      destination_id: o.metadata?.organisation_destination_id ?? null,
      external_ref: o.metadata?.external_ref ?? null,
      placed_by_customer_id: o.metadata?.placed_by_customer_id ?? null,
      line_count: items.length,
      design_summary: dedupe(
        items
          .map((it) => it.metadata?.organisation_design_id ?? null)
          .filter(Boolean) as string[]
      ),
      quantity_total: items.reduce(
        (sum, it) => sum + (Number(it.quantity) || 0),
        0
      ),
    }
  })

  res.json({ orders: slim, count, limit, offset })
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr))
}

/* ------------------------------------------------------------------ *
 * POST — place a fulfillment order from the customer portal
 * ------------------------------------------------------------------ */

const lineItemSchema = z.object({
  org_inventory_id: z.string().min(1),
  quantity: z.number().int().positive(),
})

const placeSchema = z.object({
  destination_id: z.string().min(1),
  items: z.array(lineItemSchema).min(1),
  external_ref: z.string().max(120).nullable().optional(),
  required_by: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

type PlacePayload = z.infer<typeof placeSchema>

/**
 * POST /store/customers/me/organisations/[id]/orders
 *
 * Customer-portal mirror of `POST /admin/fulfillment/orders`.
 * Differences from the admin route:
 *  - Auth: customer JWT + membership check (purchaser or owner only)
 *  - Destination + line ids come pre-scoped to the URL's org id
 *  - Stamps `metadata.placed_by_customer_id` for the audit trail
 *    (Phase 2 Q5 — primary contact remains customer_id of record)
 *  - source = "portal"
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  requireRole(membership, ["purchaser", "owner"])

  let body: PlacePayload
  try {
    body = placeSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  const orgService =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const invService =
    req.scope.resolve<OrgInventoryModuleService>(ORG_INVENTORY_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any

  // --- Validate org has a primary contact set
  let organisation: any
  try {
    organisation = await orgService.retrieveOrganisation(membership.organisation_id)
  } catch {
    return res.status(404).json({ error: "organisation not found" })
  }
  if (!organisation.primary_contact_customer_id) {
    return res.status(400).json({
      error:
        "Organisation must have a primary contact before placing orders. Contact SC Prints.",
    })
  }

  // --- Validate destination belongs to this org and is active
  let destination: any
  try {
    destination = await orgService.retrieveOrganisationDestination(body.destination_id)
  } catch {
    return res.status(404).json({ error: "destination not found" })
  }
  if (destination.organisation_id !== membership.organisation_id) {
    return res.status(404).json({ error: "destination not found" })
  }
  if (!destination.is_active) {
    return res.status(400).json({ error: "destination is inactive" })
  }

  // --- Hydrate + validate inventory rows belong to this org
  const invIds = body.items.map((i) => i.org_inventory_id)
  const invRows = (await invService.listOrgInventories(
    { id: invIds } as any,
    { take: invIds.length }
  )) as any[]
  if (invRows.length !== invIds.length) {
    return res
      .status(400)
      .json({ error: "one or more inventory rows not found" })
  }
  for (const r of invRows) {
    if (r.organisation_id !== membership.organisation_id) {
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
    /* fall through */
  }
  if (!auRegionId) {
    return res.status(500).json({
      error: "AU region not configured. Contact SC Prints.",
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

  const orderInput: any = {
    region_id: auRegionId,
    currency_code: auCurrencyCode,
    customer_id: organisation.primary_contact_customer_id,
    email: organisation.contact_email ?? undefined,
    shipping_address: shippingAddress,
    billing_address: shippingAddress,
    status: OrderStatus.DRAFT,
    is_draft_order: true,
    no_notification: false,
    metadata: {
      fulfillment_order: true,
      organisation_id: membership.organisation_id,
      organisation_destination_id: body.destination_id,
      external_ref: body.external_ref ?? null,
      requested_ship_by: body.required_by ?? null,
      source: "portal",
      placed_by_customer_id: membership.customer_id,
      notes: body.notes ?? null,
    },
    items: lineItems,
  }

  let orderId: string
  try {
    const draftResult = await createOrderWorkflow(req.scope).run({
      input: orderInput,
    })
    const draftId = (draftResult as any)?.result?.id
    if (!draftId) {
      throw new Error("draft order creation returned no id")
    }
    await convertDraftOrderWorkflow(req.scope).run({
      input: { id: draftId },
    })
    orderId = draftId
  } catch (err: any) {
    return res.status(500).json({
      error: "Failed to place order. Please try again.",
      detail: String(err?.message ?? err),
    })
  }

  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: orderId,
    action: AUDIT_ACTION.FULFILLMENT_ORDER_CREATED,
    actor_id: membership.customer_id,
    details: {
      organisation_id: membership.organisation_id,
      organisation_destination_id: body.destination_id,
      external_ref: body.external_ref ?? null,
      source: "portal",
      line_count: body.items.length,
      placed_by_customer_id: membership.customer_id,
    },
  })

  try {
    captureEvent(membership.customer_id, "fulfillment_order_created", {
      order_id: orderId,
      organisation_id: membership.organisation_id,
      destination_id: body.destination_id,
      line_count: body.items.length,
      source: "portal",
    })
    captureEvent(membership.customer_id, "portal_new_order_submitted", {
      org_id: membership.organisation_id,
      destination_id: body.destination_id,
      line_count: body.items.length,
      total: lineItems.reduce(
        (s, it) => s + it.unit_price * it.quantity,
        0
      ),
    })
  } catch {
    /* PostHog best-effort */
  }

  res.status(201).json({ order_id: orderId })
}
