/**
 * Pay-on-account guard. Medusa's manual payment provider places an order
 * without taking money, so it must only ever work for an organisation staff
 * have approved for account terms. Two store routes can reach it:
 *
 *   POST /store/payment-collections/:id/payment-sessions   (choose provider)
 *   POST /store/carts/:id/complete                          (place the order)
 *
 * Both run services/org-account → checkOrgCheckout, which decides from the
 * database (membership, role, the organisation's switch, credit limit,
 * spending limits, PO balance), never from what the browser sent. Fails
 * CLOSED: if the check itself errors, the request is refused.
 */
import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { isSystemPaymentProvider } from "../../lib/org-account"
import { checkOrgCheckout, type OrgCheckoutResult } from "../../services/org-account"

const actorOf = (req: MedusaRequest): string | null =>
  ((req as any).auth_context?.actor_id as string | undefined) ?? null

const answer = (res: MedusaResponse, result: OrgCheckoutResult, next: MedusaNextFunction) => {
  if (result.ok === true) return next()
  return res.status(result.status).json({ code: result.code, type: "not_allowed", message: result.message })
}

const failClosed = (req: MedusaRequest, res: MedusaResponse, err: unknown) => {
  try {
    ;(req.scope.resolve(ContainerRegistrationKeys.LOGGER) as any).error(
      `org-checkout-guard: ${(err as Error)?.message ?? err}`
    )
  } catch {
    /* logging only */
  }
  return res.status(503).json({
    code: "org_checkout_check_failed",
    type: "unexpected_state",
    message: "We couldn't check this order just now. Nothing has been charged. Please try again.",
  })
}

/** POST /store/carts/:id/complete */
export async function orgCheckoutCompleteGuard(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const result = await checkOrgCheckout(req.scope, {
      cartId: String((req.params as Record<string, string>)?.id ?? ""),
      actorId: actorOf(req),
    })
    return answer(res, result, next)
  } catch (err) {
    return failClosed(req, res, err)
  }
}

/** POST /store/payment-collections/:id/payment-sessions */
export async function orgPaymentSessionGuard(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const body = ((req as any).validatedBody ?? req.body ?? {}) as { provider_id?: unknown }
  if (!isSystemPaymentProvider(body.provider_id)) return next()
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data } = await query.graph({
      entity: "cart_payment_collection",
      filters: { payment_collection_id: String((req.params as Record<string, string>)?.id ?? "") },
      fields: ["cart_id"],
    })
    const cartId = (data as any[])?.[0]?.cart_id as string | undefined
    // A payment collection with no cart (an order's, say) never gets a no-card session from the store API.
    if (!cartId) {
      return res.status(403).json({
        code: "account_terms_not_allowed",
        type: "not_allowed",
        message: "Paying on account isn't available for this order.",
      })
    }
    const result = await checkOrgCheckout(req.scope, {
      cartId,
      actorId: actorOf(req),
      forceAccount: true,
      stamp: false,
    })
    return answer(res, result, next)
  } catch (err) {
    return failClosed(req, res, err)
  }
}
