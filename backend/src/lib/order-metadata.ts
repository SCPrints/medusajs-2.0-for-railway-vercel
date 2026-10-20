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
 *
 * `opts.append` appends to jsonb ARRAYS in the same statement — the stage
 * writers use it for `production_stage_history`, so two concurrent saves
 * both keep their history entry instead of the loser's vanishing under a
 * full-metadata read-modify-write (review 3-5). `opts.unset` drops keys
 * (`metadata - '{k1,k2}'`) — the stale flags a stage move clears.
 */
export type MergeOrderMetadataOptions = {
  /** Top-level keys to remove before merging the patch. */
  unset?: string[]
  /** Per array key, entries to append (missing/non-array keys start as []). */
  append?: Record<string, unknown[]>
}

const SAFE_KEY = /^[a-z_][a-z0-9_]*$/

export async function mergeOrderMetadata(
  container: MedusaContainer,
  orderId: string,
  patch: Record<string, unknown>,
  opts: MergeOrderMetadataOptions = {}
): Promise<void> {
  const unset = (opts.unset ?? []).filter((k) => SAFE_KEY.test(k))
  const append = Object.entries(opts.append ?? {}).filter(
    ([key, entries]) => SAFE_KEY.test(key) && Array.isArray(entries) && entries.length > 0
  )
  if (!orderId) return
  if ((!patch || Object.keys(patch).length === 0) && unset.length === 0 && append.length === 0) return
  const pg = container.resolve<any>("__pg_connection__")
  if (!pg?.raw) {
    throw new Error("mergeOrderMetadata: pg connection unavailable")
  }

  const bindings: unknown[] = []
  let expr = "coalesce(metadata, '{}'::jsonb)"
  if (unset.length > 0) {
    expr = `(${expr} - ?::text[])`
    bindings.push(`{${unset.join(",")}}`)
  }
  expr = `${expr} || ?::jsonb`
  bindings.push(JSON.stringify(patch ?? {}))
  for (const [key, entries] of append) {
    // Keys are code constants (SAFE_KEY-checked), so the path literal is safe.
    expr = `jsonb_set(${expr}, '{${key}}', coalesce(metadata->'${key}', '[]'::jsonb) || ?::jsonb)`
    bindings.push(JSON.stringify(entries))
  }
  bindings.push(orderId)

  await pg.raw(
    `update "order"
        set metadata = ${expr},
            updated_at = now()
      where id = ?`,
    bindings
  )
}
