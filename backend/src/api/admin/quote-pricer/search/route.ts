import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { MEILISEARCH_ADMIN_KEY, MEILISEARCH_HOST } from "../../../../lib/constants"

/**
 * GET /admin/quote-pricer/search?q=staple → { products: [{ id, title, handle, thumbnail }] }
 *
 * Relevance-ranked garment lookup for the Job pricer. Medusa's `q` filter is
 * an unordered ILIKE over title + description + SKU — with 30k products a
 * query like "staple" returns a page of polos whose DESCRIPTION says
 * "staple" before the AS Colour Staple Tee. Meili ranks title matches first
 * (searchableAttributes order) and is typo-tolerant, so this hits the same
 * product index the storefront search uses, excluding the hidden setup-fee
 * service products. Falls back to the Medusa `q` search when Meili isn't
 * configured or errors, so the pricer still works in dev.
 */
type Hit = { id: string; title: string; handle: string | null; thumbnail: string | null }

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const q = String(req.query.q ?? "").trim().slice(0, 120)
  const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 12))
  if (!q) return res.json({ products: [] })

  if (MEILISEARCH_HOST && MEILISEARCH_ADMIN_KEY) {
    try {
      const index = process.env.MEILISEARCH_PRODUCT_INDEX || "products"
      const r = await fetch(`${MEILISEARCH_HOST.replace(/\/$/, "")}/indexes/${index}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MEILISEARCH_ADMIN_KEY}` },
        body: JSON.stringify({
          q,
          limit,
          filter: "internal_service != true",
          attributesToRetrieve: ["id", "title", "handle", "thumbnail"],
        }),
        signal: AbortSignal.timeout(4000),
      })
      if (r.ok) {
        const json = (await r.json()) as { hits?: Hit[] }
        return res.json({ products: (json.hits ?? []).map((h) => ({ id: h.id, title: h.title, handle: h.handle ?? null, thumbnail: h.thumbnail ?? null })), source: "meilisearch" })
      }
    } catch {
      /* fall through to the DB search */
    }
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "thumbnail", "metadata"],
    filters: { title: { $ilike: `%${q}%` } },
    pagination: { take: limit, skip: 0 },
  })
  const products = (data as any[])
    .filter((p) => p?.metadata?.internal_service !== true)
    .map((p) => ({ id: p.id, title: p.title, handle: p.handle ?? null, thumbnail: p.thumbnail ?? null }))
  return res.json({ products, source: "db" })
}
