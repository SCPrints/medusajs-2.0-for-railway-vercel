import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../../../../lib/audit-log"
import { ORGANISATION_MODULE } from "../../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../../modules/organisation/service"
import { requireMembership, requireRole } from "../../../_helpers"

const updateSchema = z.object({
  role: z.enum(["owner", "purchaser", "viewer"]),
})

/**
 * POST /store/customers/me/organisations/[id]/members/[member_id]
 *
 * Owner-only. Change a member's role. Owners cannot demote themselves
 * if they're the last owner — the storefront should hide the UI in
 * that case but the backend guards against it too.
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])

  const memberId = req.params?.member_id
  if (!memberId) {
    return res.status(404).json({ error: "not_found" })
  }

  let body: z.infer<typeof updateSchema>
  try {
    body = updateSchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const target = (await service.listOrganisationMembers({
    id: memberId,
    organisation_id: membership.organisation_id,
  } as any)) as any[]
  const row = target[0]
  if (!row) {
    return res.status(404).json({ error: "not_found" })
  }

  // Last-owner guard
  if (row.role === "owner" && body.role !== "owner") {
    const owners = (await service.listOrganisationMembers({
      organisation_id: membership.organisation_id,
      role: "owner",
    } as any)) as any[]
    if (owners.length <= 1) {
      return res.status(400).json({
        error: "Cannot demote the last owner. Promote another member first.",
      })
    }
  }

  await service.updateOrganisationMembers([
    { id: memberId, role: body.role } as any,
  ])

  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORGANISATION,
    entity_id: membership.organisation_id,
    action: AUDIT_ACTION.OWNER_CHANGED,
    actor_id: membership.customer_id,
    details: {
      customer_id: row.customer_id,
      member_id: memberId,
      from_role: row.role,
      to_role: body.role,
      source: "portal",
    },
  })

  res.json({ ok: true })
}

/**
 * DELETE /store/customers/me/organisations/[id]/members/[member_id]
 *
 * Owner-only. Remove a member. Last-owner guard applies.
 */
export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])

  const memberId = req.params?.member_id
  if (!memberId) {
    return res.status(404).json({ error: "not_found" })
  }

  const service =
    req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const target = (await service.listOrganisationMembers({
    id: memberId,
    organisation_id: membership.organisation_id,
  } as any)) as any[]
  const row = target[0]
  if (!row) return res.json({ ok: true })

  if (row.role === "owner") {
    const owners = (await service.listOrganisationMembers({
      organisation_id: membership.organisation_id,
      role: "owner",
    } as any)) as any[]
    if (owners.length <= 1) {
      return res.status(400).json({
        error:
          "Cannot remove the last owner. Promote another member to owner first.",
      })
    }
  }

  await service.deleteOrganisationMembers([memberId])

  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORGANISATION,
    entity_id: membership.organisation_id,
    action: AUDIT_ACTION.MEMBER_REMOVED,
    actor_id: membership.customer_id,
    details: {
      customer_id: row.customer_id,
      member_id: memberId,
      role: row.role,
      source: "portal",
    },
  })
  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.CUSTOMER,
    entity_id: row.customer_id,
    action: AUDIT_ACTION.MEMBER_REMOVED,
    actor_id: membership.customer_id,
    details: {
      organisation_id: membership.organisation_id,
      role: row.role,
      source: "portal",
    },
  })

  res.json({ ok: true })
}
