import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { MEILISEARCH_ADMIN_KEY, MEILISEARCH_HOST } from "../lib/constants"
import { SALES_WINDOW_DAYS, unitsSoldByProduct } from "../lib/search-popularity"

/**
 * Nightly at 01:30 UTC (~11:30 AEST): writes `metadata.sales_90d` (units sold
 * in the last 90 days) onto every product whose figure changed. The search
 * index re-reads the product on `product.updated`, so its `popularity`
 * tiebreaker follows sales without a reindex. Always on — it emails nobody
 * and only writes rows that changed.
 */
export async function refreshSearchPopularity(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as any

  // ponytail: 5000-order cap, same as the cross-sell job; switch to a SQL
  // GROUP BY when order volume passes that.
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "status", "created_at", "items.product_id", "items.quantity"],
    pagination: { take: 5000, skip: 0, order: { created_at: "DESC" } } as any,
  })
  const since = Date.now() - SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const sold = unitsSoldByProduct(orders as any[], since)

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    pagination: { take: 20000, skip: 0 },
  })

  let updated = 0
  let failures = 0
  for (const p of products as any[]) {
    const meta = (p.metadata ?? {}) as Record<string, unknown>
    const next = sold.get(p.id) ?? 0
    const current = Number(meta.sales_90d) || 0
    if (next === current) continue
    try {
      // update() replaces the metadata jsonb — spread the existing keys.
      await productModule.updateProducts(p.id, { metadata: { ...meta, sales_90d: next } })
      updated++
    } catch {
      failures++
    }
  }
  return { orders: (orders as any[]).length, products_with_sales: sold.size, updated, failures }
}

/**
 * Meilisearch keeps a record of every finished task and only prunes them
 * itself at one million. Each stock update is a task, so the log grew ~1 GB
 * in three weeks and filled the volume on 2026-11-17: every index write then
 * failed slowly and held up the event queue (customer emails ran 17 minutes
 * late). Delete finished tasks older than a week; the freed space is reused.
 */
export async function pruneMeiliTasks(keepDays = 7): Promise<number | null> {
  if (!MEILISEARCH_HOST || !MEILISEARCH_ADMIN_KEY) return null
  const before = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString()
  const res = await fetch(
    `${MEILISEARCH_HOST.replace(/\/$/, "")}/tasks?statuses=succeeded,failed,canceled&beforeFinishedAt=${encodeURIComponent(before)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${MEILISEARCH_ADMIN_KEY}` } }
  )
  if (!res.ok) throw new Error(`Meilisearch task prune ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()) as { taskUid?: number }).taskUid ?? null
}

export default async function refreshSearchPopularityJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const taskUid = await pruneMeiliTasks()
    if (taskUid != null) logger.info(`refresh-search-popularity: pruning old Meilisearch tasks (task ${taskUid})`)
  } catch (err: any) {
    logger.error(`refresh-search-popularity: ${err?.message ?? err}`)
  }
  try {
    const r = await refreshSearchPopularity(container)
    logger.info(
      `refresh-search-popularity: orders=${r.orders} with_sales=${r.products_with_sales} updated=${r.updated} failures=${r.failures}`
    )
  } catch (err: any) {
    logger.error(`refresh-search-popularity: ${err?.message ?? err}`)
  }
}

export const config = {
  name: "refresh-search-popularity",
  schedule: "30 1 * * *",
}
