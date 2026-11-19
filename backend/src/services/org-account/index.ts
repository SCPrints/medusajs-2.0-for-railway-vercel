/**
 * Buying on account — everything that needs the container. The rules
 * themselves are pure and live in lib/org-account.ts.
 *
 *   loadOrgAccount     the numbers behind an organisation's account page
 *   checkOrgCheckout   THE gate for an organisation order / the no-card path
 *   placeCartOnAccount an approved cart → an unpaid order (owner approval)
 *   notifyOrgCart      the approval emails
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  completeCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
} from "@medusajs/medusa/core-flows"

import { SUPPORT_REPLY_TO_EMAIL } from "../../lib/constants"
import {
  accountDueDate,
  canOrderForOrg,
  creditCheck,
  isSystemPaymentProvider,
  limitCheck,
  money,
  poCheck,
  poRemaining,
  summariseOrgOrders,
  SYSTEM_PAYMENT_PROVIDER,
  type OrgOrderRow,
  type OrgRole,
} from "../../lib/org-account"
import { EmailTemplates } from "../../modules/email-notifications/templates"
import { ORGANISATION_MODULE } from "../../modules/organisation"

const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)

export type OrgOrder = OrgOrderRow & {
  display_id: number | string | null
  email: string | null
  currency_code: string
}

/**
 * Every order tagged to the organisation (`metadata.organisation_id`), with
 * its real total and what has been captured against it.
 * ponytail: newest 1000 orders, summed in memory. Move the sums into SQL if
 * an organisation ever gets near that.
 */
export async function loadOrgOrders(container: MedusaContainer, orgId: string): Promise<OrgOrder[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "order",
    filters: { metadata: { organisation_id: orgId } },
    fields: [
      "id",
      "display_id",
      "status",
      "canceled_at",
      "created_at",
      "customer_id",
      "email",
      "currency_code",
      "metadata",
      "summary.*",
    ],
    pagination: { take: 1000, skip: 0, order: { created_at: "DESC" } },
  })
  return ((data ?? []) as any[]).map((o) => {
    const s = o.summary ?? {}
    return {
      id: o.id,
      display_id: o.display_id ?? null,
      email: o.email ?? null,
      currency_code: String(o.currency_code ?? "aud"),
      customer_id: o.customer_id ?? null,
      created_at: o.created_at,
      canceled: o.status === "canceled" || !!o.canceled_at,
      total: money(s.raw_current_order_total ?? s.current_order_total) ?? 0,
      paid: money(s.raw_paid_total ?? s.paid_total) ?? 0,
      metadata: (o.metadata ?? {}) as Record<string, unknown>,
    }
  })
}

export type OrgAccount = {
  org: any
  orders: OrgOrder[]
  outstanding: number
  available: number | null
  month_spend: Record<string, number>
  purchase_orders: Array<{
    id: string
    number: string
    amount: number
    drawn: number
    remaining: number
    expires_at: string | null
    is_active: boolean
    expired: boolean
  }>
  cost_centres: Array<{ id: string; code: string; name: string; is_active: boolean }>
}

export async function loadOrgAccount(
  container: MedusaContainer,
  orgId: string,
  now = new Date()
): Promise<OrgAccount> {
  const service = container.resolve(ORGANISATION_MODULE) as any
  const [org, orders, pos, ccs] = await Promise.all([
    service.retrieveOrganisation(orgId),
    loadOrgOrders(container, orgId),
    service.listOrganisationPurchaseOrders({ organisation_id: orgId }, { take: 500, order: { created_at: "DESC" } }),
    service.listOrganisationCostCentres({ organisation_id: orgId }, { take: 500, order: { code: "ASC" } }),
  ])
  const sums = summariseOrgOrders(orders, now)
  const limit = money(org.credit_limit)
  return {
    org,
    orders,
    outstanding: sums.outstanding,
    available: creditCheck({ limit, outstanding: sums.outstanding, total: 0 }).available,
    month_spend: sums.month_spend,
    purchase_orders: (pos as any[]).map((p) => {
      const amount = money(p.amount) ?? 0
      const drawn = sums.po_drawn[p.id] ?? 0
      const expires = p.expires_at ? new Date(p.expires_at) : null
      return {
        id: p.id,
        number: p.number,
        amount,
        drawn,
        remaining: poRemaining(amount, drawn),
        expires_at: expires ? expires.toISOString() : null,
        is_active: p.is_active !== false,
        expired: !!expires && expires.getTime() < now.getTime(),
      }
    }),
    cost_centres: (ccs as any[]).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      is_active: c.is_active !== false,
    })),
  }
}

/** Cart keys only this gate may set. A value the browser sent is never trusted. */
const TRUSTED_KEYS = ["pay_on_account", "account_terms", "balance_due_at"] as const
const ORG_KEYS = ["organisation_id", "organisation_po_id", "cost_centre", ...TRUSTED_KEYS] as const

export type OrgCheckoutResult =
  | { ok: true; organisation_id: string | null; on_account: boolean }
  | { ok: false; status: number; code: string; message: string }

const refuse = (status: number, code: string, message: string): OrgCheckoutResult => ({
  ok: false,
  status,
  code,
  message,
})

const NO_ACCOUNT = "Paying on account isn't available for this order. Please pay by card."

/**
 * The one gate for an organisation order. Runs on payment-session creation
 * (`forceAccount`, no stamping) and again on cart completion.
 *
 * Refuses the no-card payment provider unless ALL of these hold:
 *   - the cart is tagged to an organisation (`metadata.organisation_id`)
 *   - the signed-in customer owns the cart and is an owner/purchaser of it
 *   - staff switched `account_terms_enabled` on for that organisation
 *   - unpaid on-account orders + this cart fit under `credit_limit` (if set)
 * It also enforces the member's spending limits (→ needs approval), the
 * blanket PO balance / expiry and the cost centre for ANY organisation order,
 * then writes the verified facts onto the cart: completeCartWorkflow copies
 * cart metadata onto the order, so the order is born with `organisation_id`,
 * `account_terms { days, due_at }` and `balance_due_at` (the invoice's
 * "Due by"). Anything of those the browser put there itself is overwritten
 * or removed.
 *
 * `approved: true` (owner approval, server-side only) skips the member limit.
 * Throws on infrastructure errors; callers fail CLOSED.
 * ponytail: credit / PO balance are read-then-write, so two orders placed in
 * the same second can both pass. Staff see every order; lock per organisation
 * if that ever matters.
 */
export async function checkOrgCheckout(
  container: MedusaContainer,
  input: {
    cartId: string
    actorId: string | null | undefined
    forceAccount?: boolean
    approved?: boolean
    stamp?: boolean
    now?: Date
  }
): Promise<OrgCheckoutResult> {
  const now = input.now ?? new Date()
  const stamp = input.stamp !== false
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: input.cartId },
    fields: [
      "id",
      "customer_id",
      "completed_at",
      "total",
      "metadata",
      "payment_collection.payment_sessions.provider_id",
    ],
  })
  const cart = (carts as any[])?.[0]
  // No such cart / already an order: Medusa's own handler answers that.
  if (!cart || cart.completed_at) return { ok: true, organisation_id: null, on_account: false }

  const meta = { ...((cart.metadata ?? {}) as Record<string, unknown>) }
  const orgId = typeof meta.organisation_id === "string" && meta.organisation_id ? meta.organisation_id : null
  const sessions = (cart.payment_collection?.payment_sessions ?? []) as any[]
  const onAccount = !!input.forceAccount || sessions.some((s) => isSystemPaymentProvider(s?.provider_id))
  const total = money(cart.total)

  const cartModule = container.resolve(Modules.CART) as any
  const writeMeta = async (next: Record<string, unknown>) => {
    if (!stamp || JSON.stringify(next) === JSON.stringify(cart.metadata ?? {})) return
    await cartModule.updateCarts(cart.id, { metadata: next })
  }

  if (!orgId) {
    if (onAccount) return refuse(403, "account_terms_not_allowed", NO_ACCOUNT)
    // A personal order: drop any organisation / on-account keys it carries.
    if (ORG_KEYS.some((k) => k in meta)) {
      for (const k of ORG_KEYS) delete meta[k]
      await writeMeta(meta)
    }
    return { ok: true, organisation_id: null, on_account: false }
  }

  // ── An organisation order ────────────────────────────────────────────────
  const notAllowed = refuse(403, "org_order_not_allowed", "You can't place orders for this organisation.")
  if (!input.actorId || cart.customer_id !== input.actorId) return notAllowed
  const service = container.resolve(ORGANISATION_MODULE) as any
  const [member] = (await service.listOrganisationMembers(
    { organisation_id: orgId, customer_id: input.actorId },
    { take: 1 }
  )) as any[]
  if (!member || !canOrderForOrg(member.role as OrgRole)) return notAllowed
  if (total == null) return refuse(409, "cart_total_unknown", "We couldn't work out this order's total. Please try again.")

  const account = await loadOrgAccount(container, orgId, now)

  // Parked cart: waiting for an owner, or approved up to a total.
  const [parked] = (await service.listOrganisationCarts({ cart_id: cart.id }, { take: 1 })) as any[]
  let approved = !!input.approved
  if (parked && parked.organisation_id === orgId && !input.approved) {
    if (parked.status === "awaiting_approval") {
      return refuse(409, "awaiting_approval", "This order is waiting for approval.")
    }
    if (parked.status === "declined") {
      return refuse(409, "declined", "This order was declined. Open it from your organisation page to change it.")
    }
    if (parked.status === "approved") {
      approved = total <= (money(parked.approved_total) ?? 0) + 0.005
    }
  }
  if (!approved) {
    const limit = limitCheck({
      order_limit: money(member.order_limit),
      monthly_limit: money(member.monthly_limit),
      month_spend: account.month_spend[input.actorId] ?? 0,
      total,
    })
    if (limit.ok === false) {
      return refuse(
        409,
        "needs_approval",
        limit.reason === "order_limit"
          ? `This order is over your ${aud(limit.limit)} limit per order. Send it for approval.`
          : `This order takes you over your ${aud(limit.limit)} limit for the month. Send it for approval.`
      )
    }
  }

  // Cost centre: required when the organisation keeps a list.
  const activeCentres = account.cost_centres.filter((c) => c.is_active)
  const centre = typeof meta.cost_centre === "string" ? meta.cost_centre.trim() : ""
  if (activeCentres.length) {
    if (!activeCentres.some((c) => c.code === centre)) {
      return refuse(400, "cost_centre_required", "Choose a cost centre for this order.")
    }
  } else {
    delete meta.cost_centre
  }

  // Blanket purchase order.
  const poId = typeof meta.organisation_po_id === "string" ? meta.organisation_po_id : ""
  if (poId) {
    const po = account.purchase_orders.find((p) => p.id === poId)
    if (!po) return refuse(400, "po_not_found", "That purchase order isn't on this organisation.")
    const check = poCheck({ ...po, total, now })
    if (check.ok === false) {
      return refuse(
        409,
        `po_${check.reason}`,
        check.reason === "insufficient"
          ? `Purchase order ${po.number} has ${aud(check.remaining)} left. This order is ${aud(total)}.`
          : check.reason === "expired"
            ? `Purchase order ${po.number} has expired.`
            : `Purchase order ${po.number} is closed.`
      )
    }
    meta.po_number = po.number
  } else {
    delete meta.organisation_po_id
  }

  for (const k of TRUSTED_KEYS) delete meta[k]
  if (onAccount) {
    if (account.org.account_terms_enabled !== true) return refuse(403, "account_terms_not_allowed", NO_ACCOUNT)
    const credit = creditCheck({ limit: money(account.org.credit_limit), outstanding: account.outstanding, total })
    if (!credit.ok) {
      return refuse(
        409,
        "credit_limit",
        `This order is ${aud(total)} and ${account.org.name} has ${aud(credit.available ?? 0)} of its account limit left. Please pay by card or contact us.`
      )
    }
    const days = Number(account.org.account_terms_days) > 0 ? Number(account.org.account_terms_days) : 30
    const dueAt = accountDueDate(now, days)
    meta.pay_on_account = true
    meta.account_terms = { days, due_at: dueAt }
    meta.balance_due_at = dueAt
  }
  await writeMeta(meta)
  return { ok: true, organisation_id: orgId, on_account: onAccount }
}

/**
 * Owner approval, account-terms organisation: turn the requester's cart into
 * an unpaid order. Server-side only; the same gate runs with `approved`.
 */
export async function placeCartOnAccount(
  container: MedusaContainer,
  cartId: string
): Promise<{ ok: true; order_id: string } | { ok: false; message: string }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: ["id", "customer_id", "completed_at", "payment_collection.id"],
  })
  const cart = (carts as any[])?.[0]
  if (!cart || cart.completed_at) return { ok: false, message: "This cart has already been ordered." }
  const pre = await checkOrgCheckout(container, {
    cartId,
    actorId: cart.customer_id,
    forceAccount: true,
    approved: true,
    stamp: false,
  })
  if (pre.ok === false) return { ok: false, message: pre.message }
  try {
    let collectionId: string | undefined = cart.payment_collection?.id
    if (!collectionId) {
      await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cartId } })
      const { data } = await query.graph({
        entity: "cart",
        filters: { id: cartId },
        fields: ["id", "payment_collection.id"],
      })
      collectionId = (data as any[])?.[0]?.payment_collection?.id
    }
    if (!collectionId) return { ok: false, message: "Couldn't set up payment for this cart." }
    await createPaymentSessionsWorkflow(container).run({
      input: {
        payment_collection_id: collectionId,
        provider_id: SYSTEM_PAYMENT_PROVIDER,
        customer_id: cart.customer_id,
      },
    })
    const gate = await checkOrgCheckout(container, { cartId, actorId: cart.customer_id, approved: true })
    if (gate.ok === false) return { ok: false, message: gate.message }
    const { result } = await completeCartWorkflow(container).run({ input: { id: cartId } })
    return { ok: true, order_id: (result as any).id }
  } catch (err: any) {
    return {
      ok: false,
      message: `We couldn't place this order (${err?.message ?? "unknown error"}). Open it to check the delivery details, then order it.`,
    }
  }
}

/** Names + emails for a set of customers. */
export async function customersById(
  container: MedusaContainer,
  ids: string[]
): Promise<Record<string, { name: string; email: string | null }>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (!unique.length) return {}
  const rows = (await (container.resolve(Modules.CUSTOMER) as any).listCustomers(
    { id: unique },
    { select: ["id", "email", "first_name", "last_name"], take: unique.length }
  )) as any[]
  const out: Record<string, { name: string; email: string | null }> = {}
  for (const c of rows) {
    out[c.id] = {
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "A team member",
      email: c.email ?? null,
    }
  }
  return out
}

const orgPageUrl = (orgId: string, tab: string) => {
  const base = process.env.STOREFRONT_URL?.replace(/\/$/, "")
  if (!base) return null
  const cc = (process.env.STOREFRONT_DEFAULT_COUNTRY_CODE ?? "au").toLowerCase()
  return `${base}/${cc}/account/organisations/${orgId}#${tab}`
}

/**
 * Approval emails (transactional): owners when something waits for them, the
 * requester on the decision. Plain-text body through the customer-message
 * template. Never throws.
 */
export async function notifyOrgCart(
  container: MedusaContainer,
  input: {
    kind: "requested" | "approved" | "declined"
    row: any
    orgName: string
    total: number | null
    actorId: string
    orderDisplayId?: number | string | null
    handoff?: boolean
  }
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const service = container.resolve(ORGANISATION_MODULE) as any
    const { row, orgName } = input
    const amount = input.total != null ? ` (${aud(input.total)} inc GST)` : ""
    let to: string[] = []
    let subject = ""
    let lines: string[] = []
    const link = orgPageUrl(row.organisation_id, "approvals")
    if (input.kind === "requested") {
      const owners = (await service.listOrganisationMembers(
        { organisation_id: row.organisation_id, role: "owner" },
        { take: 50 }
      )) as any[]
      const people = await customersById(container, [row.created_by, ...owners.map((o) => o.customer_id)])
      to = owners
        .filter((o) => o.customer_id !== row.created_by || owners.length === 1)
        .map((o) => people[o.customer_id]?.email)
        .filter((e): e is string => !!e)
      subject = `Order to approve for ${orgName}: ${row.name}`
      lines = [
        `${people[row.created_by]?.name ?? "A team member"} has sent an order for approval: "${row.name}"${amount}.`,
        row.cost_centre ? `Cost centre: ${row.cost_centre}` : "",
        row.note ? `Note: ${row.note}` : "",
        link ? `Approve or decline it here:\n${link}` : "Sign in to your SC Prints account to approve or decline it.",
      ]
    } else {
      const people = await customersById(container, [row.created_by, input.actorId])
      const email = people[row.created_by]?.email
      to = email ? [email] : []
      const who = people[input.actorId]?.name ?? "An owner"
      if (input.kind === "approved") {
        subject = `Approved: ${row.name}`
        lines = [
          `${who} approved your order "${row.name}"${amount} for ${orgName}.`,
          input.orderDisplayId
            ? `It has been placed as order #${input.orderDisplayId}. We'll be in touch with your proof.`
            : input.handoff
              ? `${who} will pay for it and place the order.`
              : "",
        ]
      } else {
        subject = `Declined: ${row.name}`
        lines = [
          `${who} declined your order "${row.name}"${amount} for ${orgName}.`,
          row.decline_reason ? `Reason: ${row.decline_reason}` : "",
          link ? `You can change it and send it again:\n${link}` : "",
        ]
      }
    }
    const body = lines.filter(Boolean).join("\n\n")
    const notifications = container.resolve(Modules.NOTIFICATION) as any
    for (const address of Array.from(new Set(to))) {
      await notifications.createNotifications({
        to: address,
        channel: "email",
        template: EmailTemplates.CUSTOMER_MESSAGE,
        data: {
          emailOptions: { subject, ...(SUPPORT_REPLY_TO_EMAIL ? { replyTo: SUPPORT_REPLY_TO_EMAIL } : {}) },
          message: { body, signature: "SC Prints" },
        },
      })
    }
  } catch (err) {
    logger.error(`org cart ${input.kind} email failed: ${(err as Error).message}`)
  }
}
