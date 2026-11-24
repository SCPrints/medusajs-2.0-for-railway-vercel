import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ulid } from "ulid"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../lib/audit-entities"
import { writeAudit } from "../../lib/audit-log"
import { CONTACT_NOTIFICATION_EMAIL, SUPPORT_REPLY_TO_EMAIL } from "../../lib/constants"
import { captureEvent } from "../../lib/posthog"
import { resolveTracksFromMeta } from "../../lib/production-stage"
import {
  isTeamStoresEnabled,
  isUnderMinimum,
  runQuoteLines,
  storesDueToClose,
  storesDueToOpen,
  summariseRun,
  type RunOrder,
  type RunSummary,
} from "../../lib/team-store"
import { EmailTemplates } from "../../modules/email-notifications/templates"
import { ORGANISATION_MODULE } from "../../modules/organisation"
import { QUOTE_MODULE } from "../../modules/quote"
import { TEAM_STORE_MODULE } from "../../modules/team-store"
import { raiseAttention } from "../attention/notify"
import { bustTodayCache } from "../jobs/today"

export const storefrontBase = (): string => {
  const root = (process.env.STOREFRONT_URL ?? "http://localhost:8000").replace(/\/$/, "")
  const country = (process.env.STOREFRONT_DEFAULT_COUNTRY_CODE ?? "au").toLowerCase()
  return `${root}/${country}`
}
export const storeUrl = (handle: string) => `${storefrontBase()}/team-store/${encodeURIComponent(handle)}`

const sydneyDate = (d: Date | string) =>
  new Date(d).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" })

/** Orders in a store's run: any order with a line stamped with the store id (set server-side at add). */
export async function loadRunOrders(container: MedusaContainer, storeId: string): Promise<RunOrder[]> {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const rows: Array<{ order_id: string }> = await knex
    .raw(
      `select distinct oi.order_id
         from order_item oi
         join order_line_item li on li.id = oi.item_id
        where li.metadata->>'team_store_id' = ? and oi.deleted_at is null and li.deleted_at is null`,
      [storeId]
    )
    .then((r: any) => r.rows ?? [])
  const ids = rows.map((r) => r.order_id).filter(Boolean)
  if (!ids.length) return []

  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const { data } = await query.graph({
    entity: "order",
    filters: { id: ids },
    fields: [
      "id",
      "display_id",
      "status",
      "email",
      "metadata",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "items.quantity",
      "items.unit_price",
      "items.title",
      "items.variant_title",
      "items.thumbnail",
      "items.metadata",
    ],
  })
  return ((data ?? []) as any[]).map((o) => ({
    id: o.id,
    display_id: o.display_id ?? null,
    status: o.status,
    email: o.email ?? null,
    name: [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(" ") || null,
    downstream: resolveTracksFromMeta((o.metadata ?? {}) as Record<string, unknown>).downstream,
    items: o.items ?? [],
  }))
}

export async function getRunSummary(container: MedusaContainer, storeId: string): Promise<RunSummary> {
  return summariseRun(storeId, await loadRunOrders(container, storeId))
}

/** Plain email (CUSTOMER_MESSAGE template). Never throws; no-op while TEAM_STORES_ENABLED is off. */
export async function sendPlainEmail(
  container: MedusaContainer,
  to: string | null | undefined,
  subject: string,
  body: string
): Promise<boolean> {
  // Nothing reaches a customer (or staff) until the feature is switched on.
  if (!to || !isTeamStoresEnabled()) return false
  try {
    const notifications = container.resolve(Modules.NOTIFICATION) as any
    await notifications.createNotifications({
      to,
      channel: "email",
      template: EmailTemplates.CUSTOMER_MESSAGE,
      data: {
        emailOptions: { subject, ...(SUPPORT_REPLY_TO_EMAIL ? { replyTo: SUPPORT_REPLY_TO_EMAIL } : {}) },
        message: { body, signature: "SC Prints" },
      },
    })
    return true
  } catch (err: any) {
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(`team-store: email to ${to} failed: ${err?.message ?? err}`)
    return false
  }
}

const money = (n: number) => `$${n.toFixed(2)}`

/**
 * Close a store: status → closed, one run quote for the Jobs list (never
 * converted), a summary to staff + organiser, and an attention flag when it
 * closed under its minimum (Decision 2: staff choose print or refund).
 * Idempotent: a store that already has a run quote keeps it.
 */
export async function closeTeamStore(
  container: MedusaContainer,
  storeId: string,
  opts: { actor?: string; now?: Date } = {}
): Promise<{ summary: RunSummary; quote_id: string; under_minimum: boolean }> {
  const now = opts.now ?? new Date()
  const service = container.resolve(TEAM_STORE_MODULE) as any
  const store = await service.retrieveTeamStore(storeId)
  const org = await (container.resolve(ORGANISATION_MODULE) as any).retrieveOrganisation(store.organisation_id).catch(() => null)
  const summary = await getRunSummary(container, storeId)
  const underMinimum = isUnderMinimum(store.minimum_quantity, summary.units)

  let quoteId: string = store.quote_id
  if (!quoteId) {
    const quotes = container.resolve(QUOTE_MODULE) as any
    const publicId = `Q-${ulid().slice(-10).toUpperCase()}`
    const [quote] = await quotes.createQuotes([
      {
        public_id: publicId,
        status: "accepted",
        source: "team_store",
        email: org?.contact_email || CONTACT_NOTIFICATION_EMAIL || "orders@scprints.com.au",
        company: org?.name ?? null,
        contact_phone: org?.contact_phone ?? null,
        subject: `Team store run: ${store.title}`,
        message: `${summary.orders} orders, ${summary.units} units, ${money(summary.revenue)} paid.${
          summary.fundraising ? ` ${money(summary.fundraising)} of it was raised for ${org?.name ?? "the organisation"}: pay it back to them.` : ""
        }`,
        accepted_at: now,
        total_estimate: summary.revenue,
        line_items: { items: runQuoteLines(summary) },
        metadata: { team_store_id: store.id, team_store_handle: store.handle, team_store_order_ids: summary.order_ids },
      },
    ])
    quoteId = quote.id
    await quotes.createQuoteEvents([
      { quote_id: quoteId, type: "created", actor: opts.actor ?? "team_store_close", body: { source: "team_store", team_store_id: store.id } },
    ])
  }

  await service.updateTeamStores({
    id: store.id,
    status: store.status === "open" ? "closed" : store.status,
    quote_id: quoteId,
    metadata: { ...(store.metadata ?? {}), closed_at: now.toISOString(), closed_summary: { orders: summary.orders, units: summary.units, revenue: summary.revenue } },
  })
  bustTodayCache()

  await writeAudit({
    container,
    entity: AUDIT_ENTITY.TEAM_STORE,
    entity_id: store.id,
    action: AUDIT_ACTION.STATUS_CHANGED,
    actor_id: opts.actor ?? "system",
    details: { organisation_id: store.organisation_id, to: "closed", orders: summary.orders, units: summary.units, under_minimum: underMinimum },
  })

  if (underMinimum) {
    await raiseAttention(container, {
      kind: "team_store_under_minimum",
      quote_id: quoteId,
      label: store.title,
      excerpt: `Closed with ${summary.units} units; the minimum was ${store.minimum_quantity}. Decide: print anyway, or refund everyone.`,
    })
  }

  const lines = [
    `${store.title} closed on ${sydneyDate(now)}.`,
    "",
    `Orders: ${summary.orders}`,
    `Units: ${summary.units}`,
    "",
    ...summary.items.map((i) => `${i.title}: ${i.sizes.map((s) => `${s.size} × ${s.quantity}`).join(", ")}`),
  ]
  await sendPlainEmail(
    container,
    CONTACT_NOTIFICATION_EMAIL,
    `${underMinimum ? "[Under minimum] " : ""}Team store closed: ${store.title}`,
    [
      ...lines,
      "",
      `Revenue: ${money(summary.revenue)}`,
      summary.fundraising ? `Raised for ${org?.name ?? "them"}: ${money(summary.fundraising)} (pay it back to them)` : "",
      underMinimum ? `Under the minimum of ${store.minimum_quantity}: decide print or refund.` : ""].join("\n")
  )
  await sendPlainEmail(
    container,
    org?.contact_email,
    `Your team store has closed: ${store.title}`,
    [
      ...lines,
      "",
      summary.fundraising ? `You raised ${money(summary.fundraising)}. We'll pay it to you once the order is delivered.` : "",
      "We'll let you know when the order goes into production.",
    ].filter((l, i, all) => l || all[i - 1] !== "").join("\n")
  )

  captureEvent(opts.actor ?? "system", "team_store_closed", {
    team_store_id: store.id,
    orders: summary.orders,
    units: summary.units,
    revenue: summary.revenue,
    fundraising: summary.fundraising,
    under_minimum: underMinimum,
  })
  return { summary, quote_id: quoteId, under_minimum: underMinimum }
}

/**
 * Hourly housekeeping: approved stores open at `opens_at`, open stores close
 * at `closes_at`, and a run whose every order is delivered completes.
 */
export async function runTeamStoreHousekeeping(
  container: MedusaContainer,
  now = new Date()
): Promise<{ opened: number; closed: number; completed: number }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(TEAM_STORE_MODULE) as any
  const stores: any[] = await service.listTeamStores(
    { status: ["awaiting_approval", "open", "closed", "in_production"] },
    { take: 500 }
  )
  const result = { opened: 0, closed: 0, completed: 0 }

  for (const s of storesDueToOpen(stores, now)) {
    await service.updateTeamStores({ id: s.id, status: "open" })
    result.opened += 1
  }
  for (const s of storesDueToClose(stores, now)) {
    try {
      await closeTeamStore(container, s.id, { now })
      result.closed += 1
    } catch (err: any) {
      logger.warn(`team-store: close ${s.id} failed: ${err?.message ?? err}`)
    }
  }
  for (const s of stores.filter((x) => (x.status === "closed" || x.status === "in_production") && x.quote_id)) {
    const orders = (await loadRunOrders(container, s.id)).filter((o) => o.status !== "canceled")
    if (!orders.length || !orders.every((o: any) => o.downstream === "delivered")) continue
    await service.updateTeamStores({ id: s.id, status: "completed" })
    const quotes = container.resolve(QUOTE_MODULE) as any
    const q = await quotes.retrieveQuote(s.quote_id).catch(() => null)
    if (q) await quotes.updateQuotes([{ id: q.id, metadata: { ...(q.metadata ?? {}), team_store_completed: true } }])
    result.completed += 1
  }
  if (result.completed) bustTodayCache()
  return result
}
