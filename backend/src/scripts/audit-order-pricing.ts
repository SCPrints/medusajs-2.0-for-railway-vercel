/**
 * Daily order-pricing audit — Phase 4 of the pricing-integrity work.
 *
 * Re-derives the expected price of every line on recent orders via the same
 * evaluation the checkout invariant runs, and stamps offenders with
 * `order.metadata.pricing_audit` + a PostHog event. This is the net behind
 * the net: it catches orders arriving via paths that bypass the checkout
 * chokepoint (POS, admin-created) and anything the invariant's shadow mode
 * let through — next morning instead of whenever a human eyeballs an order.
 *
 * Window: last 48h (recent orders only — older orders may predate rate-card
 * changes and would false-positive). Exemptions mirror the invariant
 * (quote-locked, embroidery-panel, price_override lines) plus whole POS
 * orders (staff-observed; manual discounts are routine there).
 *
 * Only writes orders whose flagged-ness CHANGED. Read-only otherwise.
 *
 *   DRY_RUN=1 npx medusa exec src/scripts/audit-order-pricing.js
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import {
  evaluateCartPricing,
  type InvariantLine,
} from "../lib/checkout-price-invariant"
import { resolveTierForCartCustomer } from "../lib/scp-resolve-garment-unit-price"
import { getPostHog } from "../lib/posthog"
import { EmailTemplates } from "../modules/email-notifications/templates"
import {
  ADMIN_PUBLIC_URL,
  BACKEND_URL,
  CONTACT_NOTIFICATION_EMAIL,
  ORDER_NOTIFICATION_EMAIL,
  SUPPORT_REPLY_TO_EMAIL,
} from "../lib/constants"

// Default 48h; WINDOW_HOURS env override for manual backtests (older orders
// may predate rate-card changes — expect legitimate-looking flags there).
const WINDOW_HOURS = Number(process.env.WINDOW_HOURS) > 0 ? Number(process.env.WINDOW_HOURS) : 48
const PAGE_SIZE = 50

export default async function auditOrderPricing({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const orderModule = container.resolve(Modules.ORDER) as {
    updateOrders: (
      data: Array<{ id: string; metadata: Record<string, unknown> }>
    ) => Promise<unknown>
  }
  const dryRun = process.env.DRY_RUN === "1"
  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString()

  let skip = 0
  let scanned = 0
  let flagged = 0
  let cleared = 0
  const sample: string[] = []
  // Every order currently flagged in the window (new or repeat) — the email
  // digest repeats daily until each is fixed or stamped with price_override.
  const digestOrders: Array<{
    display_id: number | string
    order_id: string
    verdict: string
    findings: Array<{ kind: string; detail: string }>
  }> = []

  for (;;) {
    const { data } = await query.graph({
      entity: "order",
      filters: { created_at: { $gte: since } },
      fields: [
        "id",
        "display_id",
        "customer_id",
        "metadata",
        "items.id",
        "items.quantity",
        "items.unit_price",
        "items.variant_id",
        "items.metadata",
      ],
      pagination: { skip, take: PAGE_SIZE },
    })
    const orders = (data ?? []) as Array<{
      id: string
      display_id?: number
      customer_id?: string | null
      metadata?: Record<string, unknown> | null
      items?: Array<{
        id?: string
        quantity?: number
        unit_price?: unknown
        variant_id?: string | null
        metadata?: Record<string, unknown> | null
      }>
    }>
    if (!orders.length) break

    for (const order of orders) {
      scanned++
      // POS sales are staff-observed and routinely carry manual discounts.
      if (order.metadata?.pos_session_id) continue

      const rawItems = Array.isArray(order.items) ? order.items : []
      if (!rawItems.length) continue

      // Same variant-metadata batch fetch as the invariant (graph joins
      // don't hydrate variant metadata reliably).
      const variantIds = Array.from(
        new Set(
          rawItems
            .map((it) => it.variant_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      )
      const variantMetaById = new Map<string, Record<string, unknown>>()
      if (variantIds.length) {
        const { data: variantRows } = await query.graph({
          entity: "variants",
          filters: { id: variantIds },
          fields: ["id", "metadata"],
        })
        for (const row of (variantRows ?? []) as Array<{
          id?: string
          metadata?: Record<string, unknown> | null
        }>) {
          if (row?.id && row.metadata && typeof row.metadata === "object") {
            variantMetaById.set(row.id, row.metadata)
          }
        }
      }

      const lines: InvariantLine[] = rawItems.map((raw) => ({
        id: raw.id ?? "",
        quantity: typeof raw.quantity === "number" ? raw.quantity : 0,
        unit_price: raw.unit_price,
        variant_id: raw.variant_id ?? null,
        metadata: raw.metadata ?? null,
        variant: {
          id: raw.variant_id ?? undefined,
          metadata: raw.variant_id ? variantMetaById.get(raw.variant_id) ?? null : null,
        },
      }))

      const tier = await resolveTierForCartCustomer(
        query as never,
        order.customer_id ?? null
      )
      const result = evaluateCartPricing(lines, tier)

      const wasFlagged =
        (order.metadata?.pricing_audit as { status?: string } | undefined)?.status ===
        "mismatch"
      const isFlagged = result.verdict !== "ok"
      if (isFlagged) {
        digestOrders.push({
          display_id: order.display_id ?? order.id,
          order_id: order.id,
          verdict: result.verdict,
          findings: result.findings
            .slice(0, 5)
            .map((f) => ({ kind: f.kind, detail: f.detail })),
        })
      }
      if (isFlagged === wasFlagged) continue

      if (isFlagged) {
        flagged++
        if (sample.length < 10) {
          sample.push(
            `#${order.display_id}: ${result.findings
              .map((f) => `${f.kind}(${f.detail})`)
              .join("; ")
              .slice(0, 200)}`
          )
        }
        getPostHog()?.capture({
          distinctId: `order_${order.id}`,
          event: "order_pricing_audit_flagged",
          properties: {
            order_id: order.id,
            display_id: order.display_id,
            verdict: result.verdict,
            findings: result.findings,
          },
        })
      } else {
        cleared++
      }

      if (!dryRun) {
        await orderModule.updateOrders([
          {
            id: order.id,
            // Read-modify-write: Medusa update REPLACES metadata jsonb.
            metadata: {
              ...(order.metadata ?? {}),
              pricing_audit: isFlagged
                ? {
                    status: "mismatch",
                    verdict: result.verdict,
                    findings: result.findings.slice(0, 10),
                    checked_at: new Date().toISOString(),
                  }
                : { status: "ok", checked_at: new Date().toISOString() },
            },
          },
        ])
      }
    }
    skip += PAGE_SIZE
  }

  logger.info(
    `[audit-order-pricing] ${dryRun ? "DRY RUN " : ""}scanned ${scanned} orders (last ${WINDOW_HOURS}h) — newly flagged: ${flagged}, cleared: ${cleared}, in digest: ${digestOrders.length}`
  )
  for (const line of sample) logger.warn(`[audit-order-pricing] ${line}`)

  // Email digest — repeats daily while any order in the window stays flagged
  // (fix the price or stamp metadata.price_override to clear it). Silent when
  // everything's clean; skipped in dry runs and when no inbox is configured.
  const digestRecipient = CONTACT_NOTIFICATION_EMAIL || ORDER_NOTIFICATION_EMAIL
  if (!dryRun && digestOrders.length && digestRecipient) {
    try {
      const notificationModuleService = container.resolve(Modules.NOTIFICATION) as unknown as {
        createNotifications: (data: Record<string, unknown>) => Promise<unknown>
      }
      await notificationModuleService.createNotifications({
        to: digestRecipient,
        channel: "email",
        template: EmailTemplates.PRICING_AUDIT_DIGEST,
        data: {
          emailOptions: {
            replyTo: SUPPORT_REPLY_TO_EMAIL,
            subject: `⚠ Pricing audit: ${digestOrders.length} order${digestOrders.length === 1 ? "" : "s"} flagged`,
          },
          digest: {
            windowLabel: `last ${WINDOW_HOURS}h`,
            orders: digestOrders,
            adminUrl: ADMIN_PUBLIC_URL || BACKEND_URL || null,
          },
        },
      })
      logger.info(`[audit-order-pricing] digest emailed to ${digestRecipient}`)
    } catch (err: any) {
      logger.error(`[audit-order-pricing] digest email failed — ${err?.message ?? err}`)
    }
  }
}
