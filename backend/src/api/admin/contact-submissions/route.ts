import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { listContactSubmissions } from "../../../lib/contact-submissions"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
  const requested = Number(req.query.limit)
  const limit = Math.min(
    Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_LIMIT,
    MAX_LIMIT
  )

  const { rows, total } = await listContactSubmissions({ q, limit })

  return res.json({ submissions: rows, count: rows.length, total })
}
