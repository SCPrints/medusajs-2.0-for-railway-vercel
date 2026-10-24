import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

import { ASCOLOUR_WORKSHOP_ADDRESS_1 } from "../../lib/constants"
import { AUDIT_ENTITY } from "../../lib/audit-entities"
import { getOwner } from "../../lib/crm-owners"
import { readStoredDeliveryAddress } from "../../lib/delivery-address"
import {
  deriveJobState,
  STAFF_EMAIL_ACTOR_PREFIX,
  STAFF_NOTE_ACTOR_PREFIX,
  threadTimes,
  type JobSnapshot,
} from "../../lib/job-state"
import { groupJobLines, type RawJobLine } from "../../lib/job-lines"
import type { JobActivity, JobLine, JobPricing, JobView } from "../../lib/job-view"
import { isDecoratedLine } from "../../lib/production-gate"
import { rushTierOf } from "../../lib/production-due-date"
import { resolveTracksFromMeta } from "../../lib/production-stage"
import { productionGateFailures } from "../../lib/production-gate"
import { QUOTE_MODULE } from "../../modules/quote"
import { STRIPE_PAYMENT_LINK_MODULE } from "../../modules/stripe-payment-link"
import { TASK_MODULE } from "../../modules/task"
import { buildOrderTimeline } from "../order-timeline/build"

// Defined in lib/job-state.ts (pure); re-exported for existing importers.
export { STAFF_EMAIL_ACTOR_PREFIX, STAFF_NOTE_ACTOR_PREFIX }

const DUPLICATE_AUDIT = new Set(["stage_changed", "job_reply", "job_note", "dsp_job_sent"])

const iso = (v: unknown): string | null => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}
const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = typeof v === "object" && v && "value" in (v as any) ? Number((v as any).value) : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Finds the quote and/or order behind any id staff might paste: an order id,
 * a quote id, a quote public id ("Q-4GY0KD74V2" or bare), or an order
 * display number. Returns both halves when they are linked.
 */
export async function resolveJobIds(
  container: MedusaContainer,
  raw: string
): Promise<{ quoteId: string | null; orderId: string | null }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const quotes = container.resolve(QUOTE_MODULE) as any
  const id = raw.trim()

  let quoteId: string | null = null
  let orderId: string | null = null

  if (id.startsWith("order_")) orderId = id
  else if (id.startsWith("qt_")) quoteId = id
  else {
    const publicId = id.replace(/^q-/i, "").toUpperCase()
    const [byPublic] = await quotes.listQuotes({ public_id: publicId }, { take: 1, select: ["id"] })
    if (byPublic?.id) quoteId = byPublic.id
    else if (/^\d+$/.test(id)) {
      const { data } = await query.graph({ entity: "order", fields: ["id"], filters: { display_id: Number(id) }, pagination: { take: 1 } })
      orderId = (data as any[])?.[0]?.id ?? null
    }
  }

  if (quoteId && !orderId) {
    const q = await quotes.retrieveQuote(quoteId).catch(() => null)
    const oid = (q?.metadata as any)?.order_id
    if (typeof oid === "string" && oid) orderId = oid
  }
  if (orderId && !quoteId) {
    const { data } = await query.graph({ entity: "order", fields: ["id", "metadata"], filters: { id: orderId }, pagination: { take: 1 } })
    const qid = ((data as any[])?.[0]?.metadata as any)?.quote_id
    if (typeof qid === "string" && qid) quoteId = qid
  }
  return { quoteId, orderId }
}

export async function getJob(container: MedusaContainer, rawId: string): Promise<JobView> {
  const { quoteId, orderId } = await resolveJobIds(container, rawId)
  if (!quoteId && !orderId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `No job matches "${rawId}"`)
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const quotes = container.resolve(QUOTE_MODULE) as any
  const tasks = container.resolve(TASK_MODULE) as any
  const now = new Date()

  // ── Quote ────────────────────────────────────────────────────────────────
  const quote: any = quoteId ? await quotes.retrieveQuote(quoteId).catch(() => null) : null
  const qmeta = (quote?.metadata ?? {}) as Record<string, any>

  // ── Order (items via the module: ponytail — pulls the customizerDesign
  // jsonb for every line; fine for one order, revisit if the page feels slow)
  let order: any = null
  if (orderId) {
    const orderModule = container.resolve(Modules.ORDER) as any
    order = await orderModule.retrieveOrder(orderId, { relations: ["items", "summary", "shipping_address"] }).catch(() => null)
    if (order) {
      const { data } = await query.graph({
        entity: "order",
        fields: ["id", "payment_status", "fulfillment_status", "customer_id", "email"],
        filters: { id: orderId },
        pagination: { take: 1 },
      })
      Object.assign(order, (data as any[])?.[0] ?? {})
    }
  }
  const ometa = (order?.metadata ?? {}) as Record<string, any>

  // ── Customer ─────────────────────────────────────────────────────────────
  const customerId: string | null = order?.customer_id ?? quote?.customer_id ?? null
  let customerRow: any = null
  if (customerId) {
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id", "first_name", "last_name", "email", "phone", "company_name", "has_account"],
      filters: { id: customerId },
      pagination: { take: 1 },
    })
    customerRow = (data as any[])?.[0] ?? null
  }
  const ship = order?.shipping_address ?? null
  const customerName =
    [customerRow?.first_name, customerRow?.last_name].filter(Boolean).join(" ") ||
    quote?.contact_name ||
    qmeta.accepted_by_name ||
    [ship?.first_name, ship?.last_name].filter(Boolean).join(" ") ||
    null

  // ── Owner ────────────────────────────────────────────────────────────────
  let owner: JobView["owner"] = null
  const ownerUserId =
    (orderId ? (await getOwner({ container, entity: AUDIT_ENTITY.ORDER, entity_id: orderId }).catch(() => null))?.user_id : null) ??
    quote?.assigned_to ??
    (customerId ? (await getOwner({ container, entity: AUDIT_ENTITY.CUSTOMER, entity_id: customerId }).catch(() => null))?.user_id : null) ??
    null
  if (ownerUserId) {
    const user = await (container.resolve(Modules.USER) as any).retrieveUser(ownerUserId).catch(() => null)
    owner = {
      user_id: ownerUserId,
      label: [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || ownerUserId,
    }
  }

  // ── Money + payment links ────────────────────────────────────────────────
  const summary = order?.summary ?? {}
  const orderTotal = num(summary.raw_current_order_total ?? summary.current_order_total)
  const paid = num(summary.raw_paid_total ?? summary.paid_total) ?? 0
  const depositRequired = Number(ometa.deposit_amount_cents ?? 0)
  let openLink: JobView["money"]["open_payment_link"] = null
  if (orderId) {
    try {
      const links = container.resolve(STRIPE_PAYMENT_LINK_MODULE) as any
      const [open] = await links.listStripePaymentLinks({ order_id: orderId, status: "open" }, { order: { created_at: "DESC" }, take: 1 })
      if (open?.url) openLink = { url: open.url, scenario: open.scenario ?? null, created_at: iso(open.created_at) ?? now.toISOString() }
    } catch {
      /* module optional */
    }
  }
  const currency = String(order?.currency_code ?? quote?.currency_code ?? "aud").toLowerCase()
  const isPaid = order?.payment_status === "captured" || (orderTotal != null && paid >= orderTotal - 0.01 && orderTotal > 0)

  // ── Lines ────────────────────────────────────────────────────────────────
  // Margin per pricer group comes from the snapshot the Job pricer froze at
  // send time; the quote is loaded for an order too (metadata.quote_id), so
  // orders keep their margins. Groups saved before `groupId` existed → null.
  const pricerSnap = (qmeta.job_pricer as any)?.snapshot ?? null
  const marginByGroup = new Map<string, number | null>(
    ((pricerSnap?.groups ?? []) as any[]).filter((g) => typeof g?.groupId === "string").map((g) => [g.groupId, num(g.marginPct)])
  )
  const pricerGroupOf = (l: RawJobLine) => (typeof l.group_id === "string" ? l.group_id.split("~")[0] : null)
  const marginFor = (_key: string, l: RawJobLine) => {
    const g = pricerGroupOf(l)
    return g ? (marginByGroup.get(g) ?? null) : null
  }
  const rawLines: RawJobLine[] = order
    ? (order.items ?? []).map((it: any) => ({
        id: it.id,
        title: it.title ?? it.product_title ?? "Item",
        subtitle: [it.variant_title, it.metadata?.product_handle].filter(Boolean).join(" · ") || null,
        quantity: Number(it.quantity ?? 0),
        unit_price: num(it.unit_price),
        total: num(it.unit_price) != null ? (num(it.unit_price) as number) * Number(it.quantity ?? 0) : null,
        thumbnail: it.thumbnail ?? null,
        decorated: isDecoratedLine(it),
        product_id: it.product_id ?? null,
        option_values: it.variant_option_values ?? null,
        group_id: it.metadata?.group_id ?? null,
      }))
    : (((quote?.line_items as any)?.items ?? []) as any[]).map((li, i) => ({
        id: li.id ?? `line-${i}`,
        title: li.title ?? "Item",
        subtitle: li.description ?? null,
        quantity: Number(li.quantity ?? 0),
        unit_price: num(li.unit_price),
        total: num(li.total) ?? (num(li.unit_price) != null ? (num(li.unit_price) as number) * Number(li.quantity ?? 0) : null),
        thumbnail: li.thumbnail ?? null,
        decorated: !!li.customizerDesign,
        product_id: li.product_id ?? null,
        group_id: li.group_id ?? null,
      }))
  const lines: JobLine[] = groupJobLines(rawLines, marginFor)

  // ── Tasks ────────────────────────────────────────────────────────────────
  const taskRows: any[] = await tasks
    .listTasks(
      { ...(orderId ? { order_id: orderId } : { quote_id: quoteId }), status: ["open", "in_progress"] },
      { take: 50, order: { due_at: "ASC" } }
    )
    .catch(() => [])

  // ── Activity ─────────────────────────────────────────────────────────────
  const activity: JobActivity[] = []
  if (quote) {
    activity.push({ at: iso(quote.created_at) ?? now.toISOString(), kind: "enquiry", title: quote.subject ?? "Enquiry received", detail: quote.message ?? null, actor: quote.email ?? null })
    const events: any[] = await quotes.listQuoteEvents({ quote_id: quote.id }, { order: { created_at: "DESC" }, take: 300 }).catch(() => [])
    for (const e of events) {
      const b = (e.body ?? {}) as Record<string, any>
      const at = iso(e.created_at) ?? now.toISOString()
      switch (e.type) {
        case "message":
          activity.push({
            at,
            kind: b.direction === "out" ? "email_out" : "email_in",
            title: b.direction === "out" ? `Email to ${quote.email}` : `Email from ${b.from ?? quote.email}`,
            detail: [b.subject ? `Subject: ${b.subject}` : null, b.text ?? null].filter(Boolean).join("\n") || null,
            actor: e.actor ?? null,
          })
          break
        case "note":
          activity.push({ at, kind: "note", title: "Note", detail: b.text ?? b.note ?? JSON.stringify(b), actor: e.actor ?? null })
          break
        case "status_changed":
          activity.push({ at, kind: "status", title: `Quote ${b.from ?? "?"} → ${b.to ?? "?"}`, detail: b.via ?? null, actor: e.actor ?? null })
          break
        case "assigned":
          activity.push({ at, kind: "system", title: "Assigned", detail: b.to ?? null, actor: e.actor ?? null })
          break
        case "line_items_updated":
          activity.push({ at, kind: "system", title: "Lines updated", detail: b.count != null ? `${b.count} line(s)` : null, actor: e.actor ?? null })
          break
        default:
          break
      }
    }
  }
  if (order) {
    const timeline = await buildOrderTimeline(container, order.id).catch(() => [])
    for (const t of timeline) {
      let kind: JobActivity["kind"] = "system"
      if (t.type === "comment") {
        const actor = t.actor ?? ""
        kind = actor.startsWith("email:") ? "email_in" : actor.startsWith(STAFF_EMAIL_ACTOR_PREFIX) ? "email_out" : actor.startsWith(STAFF_NOTE_ACTOR_PREFIX) ? "note" : "comment"
      } else if (t.type === "stage_change") kind = "stage"
      else if (t.type === "photo_added") kind = "photo"
      else if (t.type === "reject_logged") kind = "reject"
      else if (t.type === "nps_sent" || t.type === "nps_response") kind = "nps"
      else if (t.type === "created") kind = "status"
      activity.push({ at: t.at, kind, title: t.title, detail: t.detail ?? null, actor: t.actor ?? null, thumbnail_url: t.thumbnail_url ?? null })
    }
  }
  for (const entity of [orderId ? { entity: "order", id: orderId } : null, quoteId ? { entity: "quote", id: quoteId } : null]) {
    if (!entity) continue
    const { data } = await query
      .graph({
        entity: "audit_log",
        fields: ["action", "actor_id", "actor_email", "details", "created_at"],
        filters: { entity: entity.entity, entity_id: entity.id },
        pagination: { take: 200, skip: 0, order: { created_at: "DESC" } },
      })
      .catch(() => ({ data: [] }))
    for (const a of (data as any[]) ?? []) {
      const d = (a.details ?? {}) as Record<string, any>
      const k = typeof d.kind === "string" ? d.kind : a.action
      // Already entries in their own right: the email, the stage row from the
      // timeline, the composer's email/note, the DSP send comment.
      if (k === "attention:customer_reply" || DUPLICATE_AUDIT.has(k)) continue
      activity.push({ at: iso(a.created_at) ?? now.toISOString(), kind: "system", title: String(k).replace(/^attention:/, "flagged: ").replace(/_/g, " "), detail: d.subject ?? null, actor: a.actor_email ?? a.actor_id ?? null })
    }
  }
  for (const t of taskRows) {
    activity.push({ at: iso(t.created_at) ?? now.toISOString(), kind: "task", title: `Task: ${t.title}`, detail: t.due_at ? `Due ${iso(t.due_at)?.slice(0, 10)}` : null, actor: t.created_by ?? null })
  }
  activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  // ── Snapshot → state ─────────────────────────────────────────────────────
  const tracks = order ? resolveTracksFromMeta(ometa) : null
  // A logged call/note answers the customer too. Proof / design change
  // requests are NOT inbound mail: folding them in made "Reply" outrank
  // "Revise the proof" (threadTimes in lib/job-state.ts).
  const { inbound, last_inbound_at: lastInbound, answers: outbound } = threadTimes(activity)
  const revisedProofAt =
    (Array.isArray(ometa.revised_proofs) ? (ometa.revised_proofs as any[]) : [])
      .map((p) => iso(p?.uploaded_at))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  const proofSentAt = tracks?.artwork === "awaiting_approval" ? iso(ometa.artwork_stage_changed_at) : null
  const lastOutbound =
    [...outbound, iso(quote?.quoted_at), iso(order?.created_at), proofSentAt, openLink?.created_at ?? null, iso(qmeta.design_approval_changed_at)]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null

  const hasDecorated = order ? (order.items ?? []).some(isDecoratedLine) : false
  const snapshot: JobSnapshot = {
    quote: quote
      ? {
          status: quote.status,
          created_at: iso(quote.created_at),
          quoted_at: iso(quote.quoted_at),
          accepted_at: iso(quote.accepted_at),
          has_prices: lines.some((l) => l.unit_price != null) || num(quote.total_estimate) != null,
          design_changes_requested_at: iso(qmeta.design_changes_requested_at),
          design_approved_at: iso(qmeta.design_approved_at),
        }
      : null,
    order:
      order && tracks
        ? {
            created_at: iso(order.created_at),
            status: order.status,
            paid: isPaid,
            deposit_required: depositRequired > 0,
            deposit_paid: ometa.deposit_paid === true,
            has_open_payment_link: !!openLink,
            tracks,
            artwork_stage_changed_at: iso(ometa.artwork_stage_changed_at),
            artwork_changes_requested_at: iso(ometa.artwork_changes_requested_at),
            blanks_stage_changed_at: iso(ometa.blanks_stage_changed_at),
            production_stage_changed_at: iso(ometa.production_stage_changed_at),
            has_decorated_lines: hasDecorated,
            outstanding: orderTotal != null ? Math.max(0, orderTotal - paid) : null,
            balance_due_at: iso(ometa.balance_due_at),
            pos_sale: typeof ometa.pos_session_id === "string" && !!ometa.pos_session_id,
            revised_proof_at: revisedProofAt,
            gate_failures: productionGateFailures({
              meta: ometa,
              fromDownstream: tracks.downstream,
              toDownstream: "in_production",
              artwork: tracks.artwork,
              blanks: tracks.blanks,
              hasDecoratedLines: hasDecorated,
            }),
          }
        : null,
    last_inbound_at: lastInbound,
    last_outbound_at: lastOutbound,
    follow_up_at:
      taskRows
        .filter((t) => t?.metadata?.follow_up === true && t.due_at)
        .map((t) => iso(t.due_at))
        .filter(Boolean)
        .sort()[0] ?? null,
    now,
  }
  const state = deriveJobState(snapshot)

  // ── Flags + address ──────────────────────────────────────────────────────
  const placeholder =
    !!order && !ometa.delivery_method && !!ASCOLOUR_WORKSHOP_ADDRESS_1 && ship?.address_1 === ASCOLOUR_WORKSHOP_ADDRESS_1
  const stored = readStoredDeliveryAddress(qmeta.delivery_address)
  const flags: JobView["flags"] = []
  if (ometa.is_stale === true) flags.push({ kind: "stale", label: `Stuck at ${ometa.stale_stage ?? ometa.stale_track ?? "a stage"}` })
  if (placeholder) flags.push({ kind: "address", label: "Delivery address is the studio placeholder" })
  if (!order && quote?.status === "accepted") flags.push({ kind: "no_order", label: "Accepted but no order created" })
  const unread = inbound.filter((at) => !lastOutbound || at > lastOutbound).length
  if (unread) flags.push({ kind: "unread", label: `${unread} customer email${unread === 1 ? "" : "s"} unanswered` })

  // ── Pricing (Job pricer totals) + who else is in the job ────────────────
  const snapTotals = pricerSnap?.totals ?? (qmeta.job_pricer as any)?.totals ?? null
  const sellInc = num(snapTotals?.sellIncMajor)
  const pricing: JobPricing | null =
    snapTotals && sellInc != null
      ? {
          saved_at: iso((qmeta.job_pricer as any)?.saved_at),
          sell_inc: sellInc,
          cost_ex: num(snapTotals.costExMajor) ?? 0,
          margin_ex: num(snapTotals.marginExMajor) ?? 0,
          margin_pct: num(snapTotals.marginPct),
          unknown_cost_count: Array.isArray(snapTotals.unknownCostKeys) ? snapTotals.unknownCostKeys.length : num(snapTotals.unknownCostCount) ?? 0,
          stale: Math.abs(((orderTotal ?? num(quote?.total_estimate)) ?? sellInc) - sellInc) > 1,
        }
      : null
  const displayId = typeof order?.display_id === "number" ? order.display_id : null
  const publicId = quote?.public_id ?? null
  const title = [customerName ?? customerRow?.email ?? quote?.email ?? order?.email, quote?.subject ?? (order ? `Order #${displayId ?? ""}` : null)]
    .filter(Boolean)
    .join(" · ")

  return {
    id: orderId ?? quoteId!,
    kind: order ? "order" : "quote",
    title,
    quote: quote
      ? {
          id: quote.id,
          public_id: publicId,
          status: quote.status,
          subject: quote.subject ?? null,
          assigned_to: quote.assigned_to ?? null,
          total_estimate: num(quote.total_estimate),
          expires_at: iso(quote.expires_at),
          quoted_at: iso(quote.quoted_at),
          accepted_at: iso(quote.accepted_at),
          has_job_pricer: !!qmeta.job_pricer,
          design_approval_status: typeof qmeta.design_approval_status === "string" ? qmeta.design_approval_status : null,
        }
      : null,
    order:
      order && tracks
        ? {
            id: order.id,
            display_id: displayId,
            status: order.status,
            payment_status: order.payment_status ?? "unknown",
            tracks,
            production_due_date: iso(ometa.production_due_date),
            delivery_method: typeof ometa.delivery_method === "string" ? ometa.delivery_method : null,
            is_stale: ometa.is_stale === true,
            rush_tier: rushTierOf(ometa),
          }
        : null,
    customer: {
      id: customerId,
      name: customerName,
      email: customerRow?.email ?? order?.email ?? quote?.email ?? null,
      phone: customerRow?.phone ?? ship?.phone ?? quote?.contact_phone ?? null,
      company: customerRow?.company_name ?? quote?.company ?? ship?.company ?? null,
      has_account: customerRow?.has_account === true,
    },
    owner,
    address: {
      shipping: ship
        ? {
            name: [ship.first_name, ship.last_name].filter(Boolean).join(" ") || null,
            company: ship.company ?? null,
            address_1: ship.address_1 ?? null,
            address_2: ship.address_2 ?? null,
            city: ship.city ?? null,
            province: ship.province ?? null,
            postal_code: ship.postal_code ?? null,
            phone: ship.phone ?? null,
          }
        : stored
          ? { name: [stored.first_name, stored.last_name].filter(Boolean).join(" ") || null, company: stored.company ?? null, address_1: stored.address_1, address_2: stored.address_2 ?? null, city: stored.city, province: stored.province ?? null, postal_code: stored.postal_code, phone: stored.phone ?? null }
          : null,
      placeholder,
      found_in_thread: null,
    },
    money: {
      currency_code: currency,
      quoted: num(quote?.total_estimate),
      order_total: orderTotal,
      paid,
      outstanding: orderTotal != null ? Math.max(0, orderTotal - paid) : null,
      deposit_required_cents: depositRequired,
      deposit_paid: ometa.deposit_paid === true,
      open_payment_link: openLink,
    },
    lines,
    pricing,
    flags,
    tasks: taskRows.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due_at: iso(t.due_at), assignee_user_id: t.assignee_user_id, follow_up: t?.metadata?.follow_up === true })),
    activity,
    unread_inbound: unread,
    state,
  }
}
