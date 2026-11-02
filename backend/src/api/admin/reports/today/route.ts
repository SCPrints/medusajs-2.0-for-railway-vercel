import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { studioDate, studioDayStart, studioHourAndDay } from "../../../../lib/business-days"
import {
  isNotProceeding,
  isOpenUnshipped,
  loadOrdersOr500,
  matchesRegion,
  parseRegionFilter,
  projectedShipDate,
} from "../../../../lib/reports/orders"

/**
 * GET /admin/reports/today
 *
 * Heartbeat data for the "Today" sticky widget at the top of the
 * Reports page. Designed for a single fetch every minute or two — keep
 * it light.
 *
 * Returns:
 *   - today's revenue / orders / new customers vs same weekday last week
 *     (so Mondays compare to Mondays — useful for staff cadence)
 *   - this week's projected ships (open orders with projected_ship in next 7 days)
 *   - on-this-day-last-year: revenue + orders + top product
 *   - milestones crossed today (100th order this month, biggest single order,
 *     etc.) so the frontend can fire confetti
 *
 * All times anchored to Australia/Sydney, daylight saving included.
 */
const shiftDate = (ymd: string, days: number): string =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10)

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = (req.scope as any).resolve?.("logger") ?? console

  const regionFilter = parseRegionFilter(req.query as Record<string, unknown>)

  const orders = await loadOrdersOr500(query, res, logger, "today")
  if (!orders) return

  const now = new Date()
  const todayYmd = studioDate(now)
  const dayStart = (ymd: string) => studioDayStart(ymd).getTime()
  const todayStart = dayStart(todayYmd)
  const todayEnd = dayStart(shiftDate(todayYmd, 1))
  const lastWeekYmd = shiftDate(todayYmd, -7)
  const sameWeekdayLastWeekStart = dayStart(lastWeekYmd)
  const sameWeekdayLastWeekEnd = dayStart(shiftDate(lastWeekYmd, 1))

  // Same date one year ago, in Sydney.
  const lastYearYmd = `${Number(todayYmd.slice(0, 4)) - 1}${todayYmd.slice(4)}`
  const lastYearStart = dayStart(lastYearYmd)
  const lastYearEnd = dayStart(shiftDate(lastYearYmd, 1))

  // Aggregations
  let todayRevenue = 0
  let todayOrders = 0
  const todayNewCustomers = new Set<string>()
  let priorRevenue = 0
  let priorOrders = 0
  const priorNewCustomers = new Set<string>()
  let lastYearRevenue = 0
  let lastYearOrders = 0
  const lastYearProductTally = new Map<
    string,
    { title: string; units: number; revenue: number }
  >()
  // Today's largest single order (so we can emit a "biggest today" milestone)
  let largestOrderToday = 0
  // Customer-first-order tracking for "new customer" today
  const firstOrderByCustomer = new Map<string, number>()
  for (const o of orders) {
    const created = Date.parse(o?.created_at ?? "")
    if (!Number.isFinite(created)) continue
    const key = (o.customer_id as string) || (o.email as string) || ""
    if (!key) continue
    const existing = firstOrderByCustomer.get(key) ?? Infinity
    if (created < existing) firstOrderByCustomer.set(key, created)
  }

  // Cumulative-this-month for the "100th order this month" milestone.
  const monthStart = dayStart(`${todayYmd.slice(0, 7)}-01`)
  let monthOrdersBeforeToday = 0
  let monthOrdersThroughToday = 0

  // Top customer today (single largest spender today)
  const todaySpendByCustomer = new Map<
    string,
    { email: string; spend: number }
  >()

  for (const o of orders) {
    if (!matchesRegion(o, regionFilter)) continue
    if (isNotProceeding(o)) continue
    const created = Date.parse(o?.created_at ?? "")
    if (!Number.isFinite(created)) continue
    const total = Number(o.total ?? 0)
    const key = (o.customer_id as string) || (o.email as string) || ""

    if (created >= todayStart && created < todayEnd) {
      todayRevenue += total
      todayOrders += 1
      if (total > largestOrderToday) largestOrderToday = total
      if (key) {
        const existing = todaySpendByCustomer.get(key) ?? {
          email: typeof o.email === "string" ? o.email : "(unknown)",
          spend: 0,
        }
        existing.spend += total
        todaySpendByCustomer.set(key, existing)
        const firstOrder = firstOrderByCustomer.get(key)
        if (firstOrder != null && firstOrder >= todayStart) {
          todayNewCustomers.add(key)
        }
      }
    } else if (
      created >= sameWeekdayLastWeekStart &&
      created < sameWeekdayLastWeekEnd
    ) {
      priorRevenue += total
      priorOrders += 1
      if (key) {
        const firstOrder = firstOrderByCustomer.get(key)
        if (
          firstOrder != null &&
          firstOrder >= sameWeekdayLastWeekStart &&
          firstOrder < sameWeekdayLastWeekEnd
        ) {
          priorNewCustomers.add(key)
        }
      }
    }

    if (created >= lastYearStart && created < lastYearEnd) {
      lastYearRevenue += total
      lastYearOrders += 1
      for (const it of (o.items ?? []) as any[]) {
        const pid = (it?.product_id as string) || (it?.title as string) || ""
        if (!pid) continue
        const t =
          (typeof it?.product_title === "string" && it.product_title) ||
          (typeof it?.title === "string" && it.title) ||
          "(unknown)"
        const stat = lastYearProductTally.get(pid) ?? {
          title: t,
          units: 0,
          revenue: 0,
        }
        stat.units += Number(it?.quantity ?? 0)
        stat.revenue +=
          Number(it?.unit_price ?? 0) * Number(it?.quantity ?? 0)
        lastYearProductTally.set(pid, stat)
      }
    }

    if (created >= monthStart && created < todayStart) {
      monthOrdersBeforeToday += 1
    }
    if (created >= monthStart && created < todayEnd) {
      monthOrdersThroughToday += 1
    }
  }

  // Ships due today / in the next 7 days. Same dates as the Capacity report;
  // overdue jobs still have to go out, so they count towards the week.
  const weekEndYmd = shiftDate(todayYmd, 6)
  let shipsThisWeek = 0
  let shipsToday = 0
  for (const o of orders) {
    if (!matchesRegion(o, regionFilter)) continue
    if (!isOpenUnshipped(o)) continue
    const shipDate = projectedShipDate(o, now.getTime())
    if (shipDate === todayYmd) shipsToday += 1
    if (shipDate <= weekEndYmd) shipsThisWeek += 1
  }

  const lastYearTopProduct = (() => {
    let top: { title: string; units: number; revenue: number } | null = null
    for (const stat of lastYearProductTally.values()) {
      if (!top || stat.revenue > top.revenue) top = stat
    }
    return top
  })()

  const todayTopCustomer = (() => {
    let top: { email: string; spend: number } | null = null
    for (const stat of todaySpendByCustomer.values()) {
      if (!top || stat.spend > top.spend) top = stat
    }
    return top
  })()

  // Milestones — what changed today that's worth celebrating?
  const milestones: Array<{ kind: string; label: string }> = []
  if (
    monthOrdersBeforeToday < 100 &&
    monthOrdersThroughToday >= 100
  ) {
    milestones.push({
      kind: "month_century",
      label: "100th order this month!",
    })
  }
  if (
    monthOrdersBeforeToday < 50 &&
    monthOrdersThroughToday >= 50 &&
    monthOrdersBeforeToday >= 25
  ) {
    milestones.push({
      kind: "month_half_century",
      label: "50 orders this month",
    })
  }
  if (todayOrders >= 1 && priorOrders === 0 && studioHourAndDay(now).weekday < 6) {
    // First order of a normally-quiet day
    milestones.push({
      kind: "broke_quiet_day",
      label: "First order of a usually-quiet day",
    })
  }

  return res.json({
    today: {
      from: new Date(todayStart).toISOString(),
      to: new Date(todayEnd).toISOString(),
      revenue: Math.round(todayRevenue * 100) / 100,
      orders: todayOrders,
      new_customers: todayNewCustomers.size,
      ships_today: shipsToday,
      ships_this_week: shipsThisWeek,
      largest_order: Math.round(largestOrderToday * 100) / 100,
      top_customer: todayTopCustomer,
    },
    same_weekday_last_week: {
      from: new Date(sameWeekdayLastWeekStart).toISOString(),
      to: new Date(sameWeekdayLastWeekEnd).toISOString(),
      revenue: Math.round(priorRevenue * 100) / 100,
      orders: priorOrders,
      new_customers: priorNewCustomers.size,
    },
    on_this_day_last_year: {
      from: new Date(lastYearStart).toISOString(),
      to: new Date(lastYearEnd).toISOString(),
      revenue: Math.round(lastYearRevenue * 100) / 100,
      orders: lastYearOrders,
      top_product: lastYearTopProduct,
    },
    month_to_date: {
      orders_before_today: monthOrdersBeforeToday,
      orders_through_today: monthOrdersThroughToday,
    },
    milestones,
    timezone: "Australia/Sydney",
    generated_at: now.toISOString(),
  })
}
