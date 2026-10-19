import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  updateInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Change-only, chunked, sanity-guarded inventory_level writes for every
 * supplier sync + importer (code review 2026-10, findings 2-1 + 2-5).
 *
 * Before: each sync passed 8–11k updates to one updateInventoryLevelsWorkflow
 * call (one transaction holding row locks on every supplier level, 11k rows
 * in the Redis workflow checkpoint, one inventory-level.updated event per row
 * into the Meili subscriber) and rewrote unchanged rows daily because
 * stocked_quantity was never fetched. And a "200 OK with the wrong shape"
 * (FashionBiz `stock` renamed, AP `stock_level` → NaN) zeroed a whole
 * supplier's stock.
 *
 * Now: existing levels are fetched WITH stocked_quantity, only rows whose
 * quantity actually changed are written, writes go in chunks of 250, and the
 * whole write is refused when the new quantities look like shape drift
 * rather than stock movement. Callers must NOT advance a checkpoint on
 * `aborted`.
 */

export type LevelWrite = {
  inventory_item_id: string
  location_id: string
  stocked_quantity: number
}

export type InventoryWritePlan = {
  creates: LevelWrite[]
  updates: LevelWrite[]
  unchanged: number
  /** Rows that already had a level (changed or not) — the guard's population. */
  existingSum: number
  newSum: number
  rowsConsidered: number
  rowsBecomingZero: number
}

export const INVENTORY_WRITE_CHUNK = 250

/**
 * Guard thresholds. The population is every matched row that already has a
 * level, changed or not, so a handful of sell-outs on a quiet day can't trip
 * it — but a delta payload of a few sold-out SKUs would, so the guard only
 * applies from `minRows` rows. ponytail: tune minRows if a real sellout day
 * ever aborts; SUPPLIER_INVENTORY_GUARD=off is the operator escape hatch.
 */
export const INVENTORY_GUARD = {
  minRows: 20,
  maxSumDropRatio: 0.5,
  maxZeroShare: 0.9,
} as const

const toQty = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return toQty((v as { value: unknown }).value)
  }
  return 0
}

/** Pure: diff the SKU → qty plan against existing levels. */
export function planInventoryLevelWrites(input: {
  items: ReadonlyArray<{ id: string; sku: string | null }>
  existingLevels: ReadonlyArray<{ inventory_item_id: string; stocked_quantity?: unknown }>
  stockBySku: ReadonlyMap<string, number>
  locationId: string
}): InventoryWritePlan {
  const existingQty = new Map<string, number>()
  for (const l of input.existingLevels) {
    existingQty.set(l.inventory_item_id, toQty(l.stocked_quantity))
  }

  const plan: InventoryWritePlan = {
    creates: [],
    updates: [],
    unchanged: 0,
    existingSum: 0,
    newSum: 0,
    rowsConsidered: 0,
    rowsBecomingZero: 0,
  }

  for (const item of input.items) {
    if (!item?.id) continue
    const qty = toQty(input.stockBySku.get(item.sku ?? "") ?? 0)
    const payload: LevelWrite = {
      inventory_item_id: item.id,
      location_id: input.locationId,
      stocked_quantity: qty,
    }
    if (!existingQty.has(item.id)) {
      plan.creates.push(payload)
      continue
    }
    const current = existingQty.get(item.id)!
    plan.rowsConsidered++
    plan.existingSum += current
    plan.newSum += qty
    if (qty === 0) plan.rowsBecomingZero++
    if (current === qty) plan.unchanged++
    else plan.updates.push(payload)
  }
  return plan
}

/** Pure: should this write be refused as probable shape drift? */
export function shouldAbortInventoryWrite(
  plan: Pick<InventoryWritePlan, "existingSum" | "newSum" | "rowsConsidered" | "rowsBecomingZero">,
  guard: typeof INVENTORY_GUARD = INVENTORY_GUARD
): { abort: false } | { abort: true; reason: string } {
  const { existingSum, newSum, rowsConsidered, rowsBecomingZero } = plan
  if (rowsConsidered < guard.minRows || existingSum <= 0) return { abort: false }
  if (newSum < existingSum * guard.maxSumDropRatio) {
    return {
      abort: true,
      reason: `new stock sum ${newSum} is below ${guard.maxSumDropRatio * 100}% of existing ${existingSum} across ${rowsConsidered} rows`,
    }
  }
  if (rowsBecomingZero / rowsConsidered > guard.maxZeroShare) {
    return {
      abort: true,
      reason: `${rowsBecomingZero} of ${rowsConsidered} rows would become zero (existing sum ${existingSum})`,
    }
  }
  return { abort: false }
}

export function chunk<T>(rows: ReadonlyArray<T>, size: number = INVENTORY_WRITE_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

export type InventoryWriteResult = {
  created: number
  updated: number
  unchanged: number
  aborted?: true
  reason?: string
}

type Logger = { info: (m: string) => void; warn: (m: string) => void }

/**
 * Upsert inventory_levels at `locationId` from a SKU → qty plan. SKUs with no
 * inventory_item are skipped (the variant wasn't created). On abort nothing
 * is written and `{ aborted: true, reason }` is returned.
 */
export async function writeInventoryLevels(
  container: MedusaContainer,
  opts: { stockBySku: ReadonlyMap<string, number>; locationId: string; logger?: Logger }
): Promise<InventoryWriteResult> {
  const { stockBySku, locationId, logger } = opts
  if (stockBySku.size === 0) return { created: 0, updated: 0, unchanged: 0 }

  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data: items } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
    filters: { sku: Array.from(stockBySku.keys()) },
  })
  const itemIds = ((items ?? []) as Array<{ id: string }>).map((i) => i.id)
  if (!itemIds.length) return { created: 0, updated: 0, unchanged: 0 }

  const { data: existingLevels } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "inventory_item_id", "stocked_quantity"],
    filters: { inventory_item_id: itemIds, location_id: locationId },
  })

  const plan = planInventoryLevelWrites({
    items: items ?? [],
    existingLevels: existingLevels ?? [],
    stockBySku,
    locationId,
  })

  if (process.env.SUPPLIER_INVENTORY_GUARD !== "off") {
    const verdict = shouldAbortInventoryWrite(plan)
    if (verdict.abort) {
      logger?.warn(
        `[inventory-level-writes] REFUSED write at ${locationId}: ${verdict.reason}. Nothing written; checkpoint must not advance. Set SUPPLIER_INVENTORY_GUARD=off to force.`
      )
      return { created: 0, updated: 0, unchanged: plan.unchanged, aborted: true, reason: verdict.reason }
    }
  }

  for (const batch of chunk(plan.creates)) {
    await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: batch } })
  }
  for (const batch of chunk(plan.updates)) {
    await updateInventoryLevelsWorkflow(container).run({ input: { updates: batch } })
  }

  logger?.info(
    `Inventory levels: ${plan.creates.length} created, ${plan.updates.length} updated, ${plan.unchanged} unchanged.`
  )
  return { created: plan.creates.length, updated: plan.updates.length, unchanged: plan.unchanged }
}
