import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { findOpenCarts } from "../../../lib/open-carts"

/**
 * GET /admin/open-carts?q=<email | cart_… | cali_… | cus_… | name>
 *   → { carts: OpenCart[] }
 * Empty q = most recently active open carts with an email (90 days).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const q = typeof req.query.q === "string" ? req.query.q : ""
  const carts = await findOpenCarts(req.scope, { q })
  res.json({ carts })
}
