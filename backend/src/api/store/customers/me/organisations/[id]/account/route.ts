import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

import { canOrderForOrg, creditCheck, limitCheck, money } from "../../../../../../../lib/org-account"
import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import { loadOrgAccount } from "../../../../../../../services/org-account"
import { zodMessage } from "../../../../../../../services/org-account/schemas"
import { requireMembership, requireRole } from "../../_helpers"

const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)

/**
 * GET /store/customers/me/organisations/:id/account[?cart_id=cart_…]
 *
 * The organisation's buying-on-account picture for a member: terms, credit,
 * the caller's own limits, blanket POs with what's left, cost centres. With
 * `cart_id` (the caller's own cart) it also says how that cart may be paid —
 * checkout uses this to decide what to show. Advice only: the real decision
 * is made again by the checkout guard.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const account = await loadOrgAccount(req.scope, membership.organisation_id)
  const [member] = (await service.listOrganisationMembers({ id: membership.member_id }, { take: 1 })) as any[]
  const my = {
    order_limit: money(member?.order_limit),
    monthly_limit: money(member?.monthly_limit),
    month_spend: account.month_spend[membership.customer_id] ?? 0,
  }
  const creditLimit = money(account.org.credit_limit)
  const termsEnabled = account.org.account_terms_enabled === true

  let checkout: Record<string, unknown> | null = null
  const cartId = typeof req.query?.cart_id === "string" ? req.query.cart_id : null
  if (cartId && canOrderForOrg(membership.role)) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({
      entity: "cart",
      filters: { id: cartId },
      fields: ["id", "customer_id", "completed_at", "total"],
    })
    const cart = (data as any[])?.[0]
    const total = money(cart?.total)
    if (cart && !cart.completed_at && cart.customer_id === membership.customer_id && total != null) {
      // An owner already approved this cart (up to a total): no limit applies.
      const [parked] = (await service.listOrganisationCarts({ cart_id: cart.id }, { take: 1 })) as any[]
      const approved =
        parked?.organisation_id === membership.organisation_id &&
        parked.status === "approved" &&
        total <= (money(parked.approved_total) ?? 0) + 0.005
      const limit = approved ? ({ ok: true } as const) : limitCheck({ ...my, total })
      const credit = creditCheck({ limit: creditLimit, outstanding: account.outstanding, total })
      checkout = {
        total,
        needs_approval: limit.ok === true
          ? null
          : limit.reason === "order_limit"
            ? `This order is over your ${aud(limit.limit)} limit per order.`
            : `This order takes you over your ${aud(limit.limit)} limit for the month.`,
        pay_on_account: !termsEnabled
          ? null
          : credit.ok
            ? { ok: true }
            : {
                ok: false,
                message: `Over the account limit: ${aud(credit.available ?? 0)} left, this order is ${aud(total)}.`,
              },
      }
    }
  }

  res.json({
    role: membership.role,
    organisation: { id: account.org.id, name: account.org.name },
    account: {
      terms_enabled: termsEnabled,
      terms_days: Number(account.org.account_terms_days) || 30,
      credit_limit: creditLimit,
      outstanding: account.outstanding,
      available: account.available,
      ap_email: account.org.ap_email ?? null,
    },
    my,
    purchase_orders: account.purchase_orders,
    cost_centres: account.cost_centres,
    checkout,
  })
}

const updateSchema = z.object({
  ap_email: z.string().trim().email().max(200).nullable().or(z.literal("")),
})

/**
 * POST /store/customers/me/organisations/:id/account   { ap_email }
 * Owner only. The accounts-payable inbox is the one account field the
 * organisation sets itself; terms and credit are staff-controlled.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])
  const parsed = updateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), message: zodMessage(parsed.error) })
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  await service.updateOrganisations([
    { id: membership.organisation_id, ap_email: parsed.data.ap_email || null },
  ])
  res.json({ ok: true, ap_email: parsed.data.ap_email || null })
}
