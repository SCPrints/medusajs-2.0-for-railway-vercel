/**
 * Pure rules behind the re-order reminder: who is due, and which past order to
 * remind them about. No framework imports; the builder feeds it rows.
 */
import { classifyReorderLines, isGeneratedLine, type OrderLineLike } from "./reorder-lines"

const DAY = 86_400_000
/** Never more than one reminder per customer in this many days. */
export const MIN_DAYS_BETWEEN_REMINDERS = 60

export type ReminderOrder = {
  id: string
  display_id: number | null
  created_at: number
  /** Production stage; anything but "delivered" means the job is still open. */
  stage: string | null
  items: OrderLineLike[]
}

export type ReminderLine = { title: string; quantity: number; thumbnail: string | null }

export type ReminderPick = {
  trigger: "pattern" | "season"
  median_gap_days: number
  days_since_last: number
  order: ReminderOrder
  lines: ReminderLine[]
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length === 0 ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Same garments + designs = same signature. */
const signature = (o: ReminderOrder): string =>
  classifyReorderLines(o.items)
    .design.map((l) => `${l.product_id ?? l.title}|${l.metadata?.source_design_id ?? l.metadata?.design_id ?? ""}`)
    .sort()
    .join(",")

/** The order they repeat most (ties go to the most recent). Only orders Order again can copy. */
export function mostRepeatedOrder(orders: ReminderOrder[]): ReminderOrder | null {
  const ok = orders.filter((o) => classifyReorderLines(o.items).design.length > 0)
  const count = new Map<string, number>()
  for (const o of ok) count.set(signature(o), (count.get(signature(o)) ?? 0) + 1)
  return ok.sort((x, y) => (count.get(signature(y)) as number) - (count.get(signature(x)) as number) || y.created_at - x.created_at)[0] ?? null
}

/** What they ordered: garment names and quantities (no prices), setup fees left out. */
export function reminderLines(order: ReminderOrder, max = 6): ReminderLine[] {
  const byTitle = new Map<string, ReminderLine>()
  for (const l of order.items) {
    if (isGeneratedLine(l)) continue
    const title = l.product_title || l.title || "Item"
    const e = byTitle.get(title) ?? { title, quantity: 0, thumbnail: l.thumbnail ?? null }
    e.quantity += Number(l.quantity ?? 0)
    byTitle.set(title, e)
  }
  return [...byTitle.values()].slice(0, max)
}

export function pickReminder(input: {
  /** Non-cancelled orders, any order. */
  orders: ReminderOrder[]
  now: number
  lastReminderAt?: number | null
  hasOpenCart?: boolean
  hasOpenQuote?: boolean
  minGapDays?: number
  maxGapDays?: number
}): ReminderPick | null {
  const { now } = input
  const orders = [...input.orders].sort((a, b) => a.created_at - b.created_at)
  if (!orders.length || input.hasOpenCart || input.hasOpenQuote) return null
  // A job still in the shop: nothing to re-order yet.
  if (orders.some((o) => o.stage != null && o.stage !== "delivered")) return null
  const sinceReminder = input.lastReminderAt != null ? (now - input.lastReminderAt) / DAY : Infinity
  if (sinceReminder < MIN_DAYS_BETWEEN_REMINDERS) return null

  const last = orders[orders.length - 1]
  const daysSinceLast = (now - last.created_at) / DAY
  const gaps = orders.slice(1).map((o, i) => (o.created_at - orders[i].created_at) / DAY)
  // Own pattern: median gap between their orders (2 orders = their one gap).
  const medianGap = median(gaps)
  const minGap = input.minGapDays ?? 14
  const maxGap = input.maxGapDays ?? 365

  let trigger: ReminderPick["trigger"] | null = null
  let seasonal: ReminderOrder | undefined
  if (gaps.length && medianGap >= minGap && medianGap <= maxGap && daysSinceLast >= medianGap && daysSinceLast <= medianGap * 1.5 && sinceReminder >= medianGap) {
    trigger = "pattern"
  } else {
    // Seasonal clubs and schools: an order about a year ago (±15 days), nothing since.
    seasonal = orders.find((o) => {
      const age = (now - o.created_at) / DAY
      return age >= 350 && age <= 380
    })
    if (seasonal && daysSinceLast >= 60) trigger = "season"
  }
  if (!trigger) return null

  const order = trigger === "season" && classifyReorderLines(seasonal!.items).design.length ? seasonal! : mostRepeatedOrder(orders)
  if (!order) return null
  return { trigger, median_gap_days: Math.round(medianGap * 10) / 10, days_since_last: Math.round(daysSinceLast * 10) / 10, order, lines: reminderLines(order) }
}
