import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { findOpenCarts } from "../../../../lib/open-carts"

/**
 * GET /admin/admin-workspace/search?q=<query>
 *
 * Powers the Cmd+K palette. Returns top hits across orders, customers,
 * and products in a single fetch so the palette stays snappy.
 *
 * Strategy: short-prefix search via Medusa Query module. Keeps it
 * simple — no Meilisearch dependency for admin search since the index
 * size is small. Capped at 10 results per category.
 */
const LIMIT = 10

type Hit = {
  type: "order" | "customer" | "product" | "cart"
  id: string
  title: string
  subtitle?: string | null
  href: string
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  // Strip LIKE wildcards (%/_) so a user typing "%" doesn't match everything.
  const q =
    typeof req.query.q === "string"
      ? req.query.q.trim().replace(/[%_]/g, "")
      : ""
  if (q.length === 0) {
    return res.json({ q, hits: [] })
  }

  const results: Hit[] = []

  // Orders — match display_id (numeric prefix) or email
  try {
    const filters: Record<string, any> = {}
    const numeric = Number(q)
    if (Number.isFinite(numeric) && numeric > 0) {
      filters.display_id = numeric
    } else {
      filters.email = { $ilike: `%${q}%` }
    }
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "total",
        "currency_code",
        "created_at",
      ],
      filters,
      pagination: { take: LIMIT, skip: 0, order: { created_at: "DESC" } },
    })
    for (const o of (data as any[]) ?? []) {
      results.push({
        type: "order",
        id: o.id,
        title: o.display_id != null ? `#${o.display_id}` : o.id.slice(0, 8),
        subtitle: o.email
          ? `${o.email} · $${Math.round(Number(o.total ?? 0))}`
          : `$${Math.round(Number(o.total ?? 0))}`,
        href: `/app/orders/${o.id}`,
      })
    }
  } catch {
    /* skip */
  }

  // Customers — match email or first/last name
  try {
    const orFilters: any[] = [
      { email: { $ilike: `%${q}%` } },
      { first_name: { $ilike: `%${q}%` } },
      { last_name: { $ilike: `%${q}%` } },
    ]
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name", "created_at"],
      filters: { $or: orFilters } as any,
      pagination: { take: LIMIT, skip: 0 },
    })
    for (const c of (data as any[]) ?? []) {
      const name = [c?.first_name, c?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim()
      results.push({
        type: "customer",
        id: c.id,
        title: name || c.email || c.id,
        subtitle: name && c.email ? c.email : null,
        href: `/app/customers/${c.id}`,
      })
    }
  } catch {
    /* skip */
  }

  // Products — match title or handle
  try {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "thumbnail"],
      filters: {
        $or: [
          { title: { $ilike: `%${q}%` } },
          { handle: { $ilike: `%${q}%` } },
        ],
      } as any,
      pagination: { take: LIMIT, skip: 0 },
    })
    for (const p of (data as any[]) ?? []) {
      results.push({
        type: "product",
        id: p.id,
        title: typeof p.title === "string" ? p.title : p.handle,
        subtitle: typeof p.handle === "string" ? p.handle : null,
        href: `/app/products/${p.id}`,
      })
    }
  } catch {
    /* skip */
  }

  // Open carts — cart / line ids (customers and AI agents quote `cali_…` back
  // at us) or an email. Short free text is skipped: names already hit customers.
  if (/^(cart_|cali_|cus_)/.test(q) || q.includes("@")) {
    try {
      for (const c of await findOpenCarts(req.scope, { q, limit: LIMIT })) {
        results.push({
          type: "cart",
          id: c.id,
          title: c.customer_name || c.email || c.id,
          subtitle: `${c.lines.length} line${c.lines.length === 1 ? "" : "s"} · $${c.item_total.toFixed(2)}`,
          href: `/app/enquiries?tab=carts&q=${encodeURIComponent(c.id)}`,
        })
      }
    } catch {
      /* skip */
    }
  }

  return res.json({ q, hits: results })
}
