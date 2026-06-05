import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { SEARCH_LOG_MODULE } from "../../../modules/search-log"
import { getPostHog } from "../../../lib/posthog"

/**
 * POST /store/search-events
 *
 * Storefront-facing logger for internal site searches. Body:
 *   {
 *     "query": "raw user input",
 *     "results_count": 42,
 *     "country_code": "au"
 *   }
 *
 * Attribution: `customer_id` is resolved SERVER-SIDE from the session
 * (`req.auth_context.actor_id`) when the caller is an authenticated
 * customer — never trusted from the request body, which is unauthenticated
 * and would let any caller attribute searches to an arbitrary customer.
 *
 * Returns 204 always so a logging failure never breaks search UX. Drops
 * empty queries and queries longer than 500 chars defensively.
 */

const bodySchema = z.object({
  query: z.string().trim().min(1).max(500),
  results_count: z.number().int().nonnegative(),
  country_code: z.string().trim().max(8).optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    // Don't leak validation detail to anonymous storefront callers.
    res.status(204).end()
    return
  }

  // Only trust a server-resolved customer id (set when the request carries a
  // valid customer session/token); anonymous callers get null.
  const customerId =
    typeof (req as any).auth_context?.actor_id === "string"
      ? ((req as any).auth_context.actor_id as string)
      : null

  const logger = (req.scope as any).resolve?.("logger") ?? console
  try {
    const service = req.scope.resolve(SEARCH_LOG_MODULE) as any
    const queryNormalized = parsed.data.query.trim().toLowerCase()
    await service.createSearchEvents([
      {
        query: parsed.data.query.trim(),
        query_normalized: queryNormalized,
        results_count: parsed.data.results_count,
        country_code: parsed.data.country_code ?? null,
        customer_id: customerId,
      },
    ])
  } catch (err: any) {
    logger.warn?.(`[search-events] log failed: ${err?.message ?? err}`)
  }

  const distinctId = customerId ?? "anonymous"
  getPostHog()?.capture({
    distinctId,
    event: "site searched",
    properties: {
      query: parsed.data.query.trim(),
      results_count: parsed.data.results_count,
      country_code: parsed.data.country_code ?? null,
    },
  })

  res.status(204).end()
}
