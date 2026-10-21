import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { groupToday, type TodayView } from "../../lib/job-today"
import type { JobView } from "../../lib/job-view"
import { resolveTracksFromMeta } from "../../lib/production-stage"
import { QUOTE_MODULE } from "../../modules/quote"
import { getJob } from "./build"

const OPEN_QUOTE_STATUSES = ["new", "quoted", "accepted"]
const CLOSED_DOWNSTREAM = new Set(["shipped", "delivered"])
const CACHE_MS = 60_000
const CONCURRENCY = 5

// ponytail: one in-process cache, one machine. Bust with ?fresh=1 after an
// action; move to Redis if there is ever a second backend machine.
let cache: { at: number; view: TodayView } | null = null

/** Ids of every job that isn't finished: open quotes without an order, plus un-shipped orders. */
async function openJobIds(container: MedusaContainer): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const quotes = container.resolve(QUOTE_MODULE) as any

  const quoteRows: any[] = await quotes.listQuotes(
    { status: OPEN_QUOTE_STATUSES },
    { take: 500, select: ["id", "metadata"], order: { created_at: "DESC" } }
  )
  const quoteIds = quoteRows
    .filter((q) => !(typeof q.metadata?.order_id === "string" && q.metadata.order_id))
    .map((q) => q.id as string)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "status", "metadata"],
    filters: { status: { $ne: "canceled" } },
    pagination: { take: 500, skip: 0, order: { created_at: "DESC" } },
  })
  const orderIds = ((orders as any[]) ?? [])
    .filter((o) => {
      const meta = (o.metadata ?? {}) as Record<string, unknown>
      if (meta.fulfillment_order === true) return false
      return !CLOSED_DOWNSTREAM.has(resolveTracksFromMeta(meta).downstream)
    })
    .map((o) => o.id as string)

  return [...orderIds, ...quoteIds]
}

export async function buildToday(container: MedusaContainer, options: { fresh?: boolean } = {}): Promise<TodayView> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.view
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const ids = await openJobIds(container)
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
