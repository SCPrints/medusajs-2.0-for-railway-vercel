import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../../../lib/audit-log"
import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../modules/organisation/service"
import { requireMembership, requireRole } from "../../_helpers"

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "purchaser", "viewer"]).default("purchaser"),
})

/**
 * GET /store/customers/me/organisations/[id]/members
 *
 * Any member can list the roster. Returns each member with their
 * customer record hydrated (email + name) — for the Members tab UI.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)

  const members = (await service.listOrganisationMembers(
    { organisation_id: membership.organisation_id } as any,
    { take: 200, order: { accepted_at: "DESC" } }
  )) as any[]

  if (members.length === 0) {
    return res.json({ members: [] })
  }

  const customerIds = Array.from(new Set(members.map((m) => m.customer_id)))
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const customerById: Record<string, any> = {}
  try {
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name"],
      filters: { id: customerIds },
    })
    for (const c of data ?? []) customerById[c.id] = c
  } catch {
    /* graph unavailable — fall back to nulls */
  }

  res.json({
    members: members.map((m) => ({
      id: m.id,
      customer_id: m.customer_id,
      role: m.role,
      accepted_at: m.accepted_at,
      invited_by: m.invited_by,
      customer: customerById[m.customer_id]
        ? {
            id: customerById[m.customer_id].id,
            email: customerById[m.customer_id].email ?? null,
            first_name: customerById[m.customer_id].first_name ?? null,
            last_name: customerById[m.customer_id].last_name ?? null,
          }
        : null,
    })),
  })
}

/**
 * POST /store/customers/me/organisations/[id]/members
 *
 * Owner-only. Invite by email — looks up an existing customer by
 * email, adds a member row with the requested role. Idempotent on
 * (organisation_id, customer_id).
 *
 * If no customer exists with the given email, returns 404 with a
 * friendly error so the storefront can show "Ask them to sign up
 * first and then re-invite". (Email-token invites for non-customers
 * are deferred to a follow-up; the spec calls out members tab as
 * net-new UI rather than full email-invite flow.)
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])

  let body: z.infer<typeof inviteSchema>
  try {
    body = inviteSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  let customer: any
  try {
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name"],
      filters: { email: body.email.toLowerCase() },
    })
    customer = data?.[0]
  } catch {
    /* fall through */
  }
  if (!customer) {
    return res.status(404).json({
      error:
        "No customer found with that email. Ask them to register first, then invite.",
    })
  }

  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const existing = (await service.listOrganisationMembers({
    organisation_id: membership.organisation_id,
    customer_id: customer.id,
  } as any)) as any[]
  if (existing.length > 0) {
    const row = existing[0]
    return res.json({
      member: {
        id: row.id,
        customer_id: row.customer_id,
        role: row.role,
        accepted_at: row.accepted_at,
        invited_by: row.invited_by,
        customer: {
          id: customer.id,
          email: customer.email ?? null,
          first_name: customer.first_name ?? null,
          last_name: customer.last_name ?? null,
        },
      },
      duplicate: true,
    })
  }

  const [created] = (await service.createOrganisationMembers([
    {
      organisation_id: membership.organisation_id,
      customer_id: customer.id,
      role: body.role,
      invited_by: membership.customer_id,
      accepted_at: new Date(),
    },
  ])) as any[]

  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORGANISATION,
    entity_id: membership.organisation_id,
    action: AUDIT_ACTION.MEMBER_ADDED,
    actor_id: membership.customer_id,
    details: {
      customer_id: customer.id,
      role: body.role,
      member_id: created?.id ?? null,
      source: "portal",
    },
  })
  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.CUSTOMER,
    entity_id: customer.id,
    action: AUDIT_ACTION.MEMBER_ADDED,
    actor_id: membership.customer_id,
    details: {
      organisation_id: membership.organisation_id,
      role: body.role,
      source: "portal",
    },
  })

  res.status(201).json({
    member: {
      id: created.id,
      customer_id: created.customer_id,
      role: created.role,
      accepted_at: created.accepted_at,
      invited_by: created.invited_by,
      customer: {
        id: customer.id,
        email: customer.email ?? null,
        first_name: customer.first_name ?? null,
        last_name: customer.last_name ?? null,
      },
    },
  })
}
