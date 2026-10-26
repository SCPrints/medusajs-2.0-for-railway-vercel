import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { groupToday, type TodayView } from "../../lib/job-today"
import type { JobView } from "../../lib/job-view"
import { resolveTracksFromMeta } from "../../lib/production-stage"
import { QUOTE_MODULE } from "../../modules/quote"
import { getJob } from "./build"

const OPEN_QUOTE_STATUSES = ["new", "quoted", "accepted"]
const CLOSED_QUOTE_STATUSES = ["lost", "expired"]
const CLOSED_DOWNSTREAM = new Set(["shipped", "delivered"])
/** Done and Lost show this far back; search finds anything older. */
const RECENT_MS = 90 * 86_400_000
const CACHE_MS = 60_000
const CONCURRENCY = 5

// ponytail: one in-process cache, one machine. Bust with ?fresh=1 after an
// action; move to Redis if there is ever a second backend machine.
// ponytail: builds every job in turn (getJob); fine at tens of open jobs, move
// the list to one SQL read model past a few hundred.
let cache: { at: number; view: TodayView } | null = null

/**
 * Ids of every job the list shows: everything open (quotes without an order,
 * un-shipped orders, shipped orders still owing) plus what finished, was lost
 * or was cancelled in the last 90 days, for the Done and Lost folders.
 */
async function jobIds(container: MedusaContainer): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const quotes = container.resolve(QUOTE_MODULE) as any
  const since = Date.now() - RECENT_MS
  const recent = (v: unknown) => Date.parse(String(v ?? "")) >= since

  const quoteRows: any[] = await quotes.listQuotes(
    { status: [...OPEN_QUOTE_STATUSES, ...CLOSED_QUOTE_STATUSES] },
    { take: 500, select: ["id", "status", "metadata", "updated_at"], order: { created_at: "DESC" } }
  )
  const quoteIds = quoteRows
    .filter((q) => !(typeof q.metadata?.order_id === "string" && q.metadata.order_id))
    .filter((q) => OPEN_QUOTE_STATUSES.includes(q.status) || recent(q.updated_at))
    .map((q) => q.id as string)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "status", "metadata", "created_at"],
    pagination: { take: 500, skip: 0, order: { created_at: "DESC" } },
  })
  const orderIds: string[] = []
  const finishedIds: string[] = []
  const lostIds: string[] = []
  const recentIds = new Set<string>()
  for (const o of (orders as any[]) ?? []) {
    const meta = (o.metadata ?? {}) as Record<string, unknown>
    if (meta.fulfillment_order === true) continue
    if (recent(o.created_at)) recentIds.add(o.id)
    if (o.status === "canceled") {
      if (recentIds.has(o.id)) lostIds.push(o.id)
    } else if (CLOSED_DOWNSTREAM.has(resolveTracksFromMeta(meta).downstream)) finishedIds.push(o.id)
    else orderIds.push(o.id)
  }

  // Shipped / delivered jobs stay open while money is owed; the rest are Done.
  const owing = await owingIds(container, finishedIds)
  const owingSet = new Set(owing)
  const doneIds = finishedIds.filter((id) => !owingSet.has(id) && recentIds.has(id))
  return [...orderIds, ...owing, ...doneIds, ...lostIds, ...quoteIds]
}

async function owingIds(container: MedusaContainer, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const orderModule = container.resolve(Modules.ORDER) as any
  const rows: any[] = await orderModule
    .listOrders({ id: ids }, { relations: ["summary"], select: ["id"], take: ids.length })
    .catch(() => [])
  const n = (v: unknown) => {
    const x = typeof v === "object" && v && "value" in (v as any) ? Number((v as any).value) : Number(v)
    return Number.isFinite(x) ? x : 0
  }
  return rows
    .filter((o) => {
      const s = o.summary ?? {}
      return n(s.raw_current_order_total ?? s.current_order_total) - n(s.raw_paid_total ?? s.paid_total) > 0.01
    })
    .map((o) => o.id as string)
}

export async function buildToday(container: MedusaContainer, options: { fresh?: boolean } = {}): Promise<TodayView> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.view
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const ids = await jobIds(container)
  const jobs: JobView[] = []
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      ids.slice(i, i + CONCURRENCY).map((id) =>
        getJob(container, id).catch((err: any) => {
          logger.warn(`today: job ${id} failed: ${err?.message ?? err}`)
          return null
        })
      )
    )
    for (const j of batch) if (j) jobs.push(j)
  }

  const view = groupToday(jobs)
  cache = { at: Date.now(), view }
  return view
}

export function bustTodayCache() {
  cache = null
}
