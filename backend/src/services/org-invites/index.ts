import { MedusaError, Modules } from "@medusajs/framework/utils"

import { SUPPORT_REPLY_TO_EMAIL } from "../../lib/constants"
import { hashInviteToken, inviteExpiry, inviteState, inviteUrl, MAX_INVITE_SENDS, MAX_PENDING_INVITES, newInviteToken, ROLE_LABEL } from "../../lib/org-invites"
import { EmailTemplates } from "../../modules/email-notifications/templates"
import { ORGANISATION_MODULE } from "../../modules/organisation"
import type OrganisationModuleService from "../../modules/organisation/service"

const svc = (container: any) => container.resolve(ORGANISATION_MODULE) as OrganisationModuleService

/** What an owner sees: never the token or its hash. */
export const publicInvite = (i: any) => ({
  id: i.id,
  email: i.email,
  role: i.role,
  expires_at: i.expires_at,
  send_count: i.send_count,
  created_at: i.created_at,
})

async function sendInviteEmail(container: any, invite: any, token: string, invitedBy: string) {
  const url = inviteUrl(token)
  if (!url) return false
  const org: any = await svc(container).retrieveOrganisation(invite.organisation_id)
  const inviter: any = await (container.resolve(Modules.CUSTOMER) as any).retrieveCustomer(invitedBy).catch(() => null)
  const who = [inviter?.first_name, inviter?.last_name].filter(Boolean).join(" ") || inviter?.email || "A colleague"
  const role = ROLE_LABEL[invite.role as keyof typeof ROLE_LABEL] ?? "a member"
  await (container.resolve(Modules.NOTIFICATION) as any).createNotifications({
    to: invite.email,
    channel: "email",
    template: EmailTemplates.CUSTOMER_MESSAGE,
    data: {
      emailOptions: { subject: `${who} invited you to ${org.name} on SC Prints`, ...(SUPPORT_REPLY_TO_EMAIL ? { replyTo: SUPPORT_REPLY_TO_EMAIL } : {}) },
      message: {
        body: `${who} invited you to join ${org.name} on SC Prints as ${role}.\n\nTo accept, sign in (or sign up) with this email address, ${invite.email}, then open:\n\n${url}\n\nThe link works for 14 days. If you weren't expecting this, you can ignore it.`,
        signature: "SC Prints",
      },
    },
  })
  return true
}

/** Owner invites a colleague. Throws MedusaError: NOT_ALLOWED (cap / already a member). Re-inviting a pending address refreshes it. */
export async function createInvite(container: any, input: { organisation_id: string; email: string; role: "owner" | "purchaser" | "viewer"; invited_by: string }) {
  const s = svc(container)
  const email = input.email.trim().toLowerCase()
  const invites = (await s.listOrganisationInvites({ organisation_id: input.organisation_id } as any, { take: 500 })) as any[]
  const pending = invites.filter((i) => inviteState(i) === "pending")
  const existing = pending.find((i) => i.email === email)
  if (!existing && pending.length >= MAX_PENDING_INVITES) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `You can have up to ${MAX_PENDING_INVITES} invitations waiting. Cancel one first.`)
  }
  const customers: any[] = await (container.resolve(Modules.CUSTOMER) as any).listCustomers({ email, has_account: true })
  if (customers.length) {
    const members = (await s.listOrganisationMembers({ organisation_id: input.organisation_id, customer_id: customers.map((c) => c.id) } as any)) as any[]
    if (members.length) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "They are already a member.")
  }
  const { token, hash } = newInviteToken()
  let invite: any
  if (existing) {
    if (existing.send_count >= MAX_INVITE_SENDS) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "That invitation has already been sent three times.")
    ;[invite] = (await s.updateOrganisationInvites([{ id: existing.id, role: input.role, token_hash: hash, expires_at: inviteExpiry(), send_count: existing.send_count + 1 }])) as any[]
  } else {
    ;[invite] = (await s.createOrganisationInvites([{ organisation_id: input.organisation_id, email, role: input.role, token_hash: hash, invited_by: input.invited_by, expires_at: inviteExpiry(), send_count: 1 }])) as any[]
  }
  const sent = await sendInviteEmail(container, invite, token, input.invited_by).catch(() => false)
  return { invite, sent }
}

/** New link, same invitation; at most three sends in total. */
export async function resendInvite(container: any, invite: any) {
  if (invite.send_count >= MAX_INVITE_SENDS) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "That invitation has already been sent three times.")
  const { token, hash } = newInviteToken()
  const [updated] = (await svc(container).updateOrganisationInvites([{ id: invite.id, token_hash: hash, expires_at: inviteExpiry(), send_count: invite.send_count + 1 }])) as any[]
  const sent = await sendInviteEmail(container, updated, token, invite.invited_by).catch(() => false)
  return { invite: updated, sent }
}

/** The live (pending) invite for a link token, or null for anything unknown, used, cancelled or old. */
export async function findPendingByToken(container: any, token: string) {
  const [invite] = (await svc(container).listOrganisationInvites({ token_hash: hashInviteToken(token) } as any, { take: 1 })) as any[]
  return invite && inviteState(invite) === "pending" ? invite : null
}
