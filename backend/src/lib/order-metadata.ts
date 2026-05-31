import type { MedusaContainer } from "@medusajs/framework/types"

/**
 * Atomically merge keys into an order's `metadata` jsonb at the DB level.
 *
 * Several subscribers stamp `order.metadata` on `order.placed`
 * (production-stage, shipping-decision, tax-exempt, perks, fulfillment),
 * and the Redis event bus runs every subscriber for an event CONCURRENTLY
 * (`event-bus-redis` dispatches them with `await Promise.all(...)`). A
 * read-modify-write via `orderModuleService.updateOrders()` therefore loses
 * updates: each handler reads the same metadata snapshot and the last
 * writer clobbers the others' keys (silently dropping production_stage /
 * shipping_decision / tax_exempt / applied_perks / fulfillment_subscriber_ran).
 *
 * Postgres re-reads the row under its row lock on every UPDATE, so
 * `metadata || patch` from concurrent writers all survive provided their
 * keys are disjoint (they are). We bypass the order module service
 * deliberately — it has no merge-metadata API and its `update` REPLACES the
 * whole jsonb. The shared `__pg_connection__` (knex) is the same handle the
 * recovery scripts use for raw SQL against core tables.
 *
 * Note: `||` is a shallow merge — only pass top-level keys (nested objects
 * would be replaced wholesale, which is what every current caller wants).
 */
export async function mergeOrderMetadata(
  container: MedusaContainer,
  orderId: string,
  patch: Record<string, unknown>
): Promise<void> {
  if (!orderId || !patch || Object.keys(patch).length === 0) return
  const pg = container.resolve<any>("__pg_connection__")
  if (!pg?.raw) {
    throw new Error("mergeOrderMetadata: pg connection unavailable")
  }
  await pg.raw(
    `update "order"
        set metadata = coalesce(metadata, '{}'::jsonb) || ?::jsonb,
            updated_at = now()
      where id = ?`,
    [JSON.stringify(patch), orderId]
  )
}
