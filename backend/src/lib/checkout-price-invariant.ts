/**
 * Checkout price invariant — Phase 3 of the pricing-integrity work.
 *
 * The last gate before a cart becomes an order: re-derives every line's
 * expected price from its own metadata via the canonical pricing functions
 * and flags/blocks material mismatches. This layer validates the OUTCOME,
 * not the causes — it exists to catch the pricing scenario nobody imagined,
 * the way order #44's silently-dropped embroidery charge would have been
 * caught here regardless of which upstream bug dropped it.
 *
 * Modes (env PRICING_INVARIANT_MODE):
 *   off    — invariant never runs.
 *   alert  — DEFAULT. Findings are logged + sent to PostHog; checkout always
 *            proceeds. Ship in this "shadow mode" until live traffic shows
 *            zero false positives.
 *   block  — block-severity findings return 409 from cart-complete with a
 *            customer-safe message. Flip only after a clean shadow run.
 *
 * Fail-open by design: an exception inside the invariant must never stop a
 * customer from checking out — the middleware catches, logs, and proceeds.
 *
 * Tolerance tiers (per line):
 *   |delta| <= $0.50                        → ignored (rounding drift)
 *   |delta| <= max($1, 2% of expected)      → alert finding
 *   beyond that                             → block finding
 *
 * Exemptions (legitimate deviations, never flagged):
 *   - metadata.quote_locked_price   — staff-negotiated quote price
 *   - metadata.decorationDesign     — standalone embroidery-panel line
 *     (prices via its own serverPricing; structural checks still apply)
 *   - metadata.price_override       — explicit override marker
 *     ({ by, reason, at }) for POS discounts / goodwill adjustments
 */
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { recomputeScpCartPricingPure } from "./recompute-scp-cart-pricing"
import {
  computeDecorationTotals,
  screenHeavyFromStoredBreakdown,
} from "./scp-decoration-pricing"
import { isScpPrintSizeId, type ScpPrintSizeId } from "./scp-dtf-print-pricing"
import {
  bnLikeToMajorAmount,
  resolveTierForCartCustomer,
} from "./scp-resolve-garment-unit-price"
import { costExGstMinorFromMetadata, isBelowCost } from "./safe-tier-pricing"
import type { Tier } from "./customer-tiers"
import { getPostHog } from "./posthog"

export type InvariantLine = {
  id: string
  quantity: number
  unit_price: unknown
  variant_id?: string | null
  metadata?: Record<string, unknown> | null
  variant?: { id?: string; metadata?: Record<string, unknown> | null } | null
}

export type InvariantFinding = {
  line_id: string
  kind: "price_mismatch" | "free_decoration" | "requires_quote" | "below_cost"
  severity: "alert" | "block"
  expected?: number
  actual?: number
  delta?: number
  detail: string
}

export type InvariantResult = {
  verdict: "ok" | "alert" | "block"
  findings: InvariantFinding[]
  aggregated_quantity: number
  checked_lines: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

const IGNORE_DELTA_MAJOR = 0.5

export type InvariantMode = "off" | "alert" | "block"

export function invariantMode(): InvariantMode {
  const raw = (process.env.PRICING_INVARIANT_MODE ?? "alert").trim().toLowerCase()
  return raw === "off" || raw === "block" ? raw : "alert"
}

const isExempt = (line: InvariantLine): boolean => {
  const meta = line.metadata as Record<string, unknown> | null | undefined
  if (!meta) return false
  if (meta.quote_locked_price === true) return true
  if (meta.decorationDesign) return true
  // Explicit override convention: staff-recorded deviation with provenance.
  if (typeof meta.price_override === "object" && meta.price_override !== null) return true
  return false
}

const serverBlockOf = (line: InvariantLine): Record<string, unknown> | null => {
  const cd = (line.metadata as Record<string, unknown> | null)?.customizerDesign as
    | Record<string, unknown>
    | undefined
  const pricing = cd?.pricing as Record<string, unknown> | undefined
  const server = pricing?.server
  return typeof server === "object" && server !== null
    ? (server as Record<string, unknown>)
    : null
}

/**
 * Pure evaluation: expected-vs-charged per line + structural checks.
 * Expected prices come from the same pure recompute every cart mutation
 * already runs, so a healthy cart matches to the cent.
 */
export function evaluateCartPricing(
  lines: InvariantLine[],
  tier?: Tier | null
): InvariantResult {
  const findings: InvariantFinding[] = []

  const evaluable = lines.filter((l) => l?.id && !isExempt(l))
  const { prices, aggregated_quantity } = recomputeScpCartPricingPure(
    evaluable,
    tier
  )
  const aggregatedQty = Math.max(1, aggregated_quantity)

  for (const line of evaluable) {
    const actual = bnLikeToMajorAmount(line.unit_price)
    const expected = prices.has(line.id) ? (prices.get(line.id) as number) : null

    // 1. Expected-vs-charged.
    if (actual !== null && expected !== null) {
      const delta = round2(actual - expected)
      if (Math.abs(delta) > IGNORE_DELTA_MAJOR) {
        const materialThreshold = Math.max(1, round2(expected * 0.02))
        findings.push({
          line_id: line.id,
          kind: "price_mismatch",
          severity: Math.abs(delta) > materialThreshold ? "block" : "alert",
          expected: round2(expected),
          actual: round2(actual),
          delta,
          detail: `charged ${round2(actual)} vs expected ${round2(expected)} (delta ${delta})`,
        })
      }
    }

    // 2. Structural checks on customizer lines.
    const server = serverBlockOf(line)
    if (server) {
      const printSizeRaw = server.print_size_id
      const printSizeId: ScpPrintSizeId = isScpPrintSizeId(printSizeRaw)
        ? printSizeRaw
        : "up_to_a6"
      const totals = computeDecorationTotals({
        metadata: line.metadata,
        printSizeId,
        printTierQuantity: aggregatedQty,
        embroideryQuantity: Math.max(1, Math.floor(line.quantity || 1)),
        screenHeavyGarment: screenHeavyFromStoredBreakdown(server),
      })

      // 2a. Decorated sides that carry zero decoration charge — the
      // "$0 embroidery" class (uncommitted stitch config, unknown method).
      if (
        totals.decoratedSides.length > 0 &&
        totals.printTotalMajor === 0 &&
        totals.embroideryTotalMajor === 0 &&
        totals.screenTotalMajor === 0
      ) {
        findings.push({
          line_id: line.id,
          kind: "free_decoration",
          severity: "block",
          detail: `decorated sides [${totals.decoratedSides.join(", ")}] priced at $0 decoration`,
        })
      }

      // 2b. Price-on-application designs must never check out silently.
      if (totals.embroideryBreakdown.some((b) => b.requiresQuote)) {
        findings.push({
          line_id: line.id,
          kind: "requires_quote",
          severity: "block",
          detail: "embroidery above the auto-priced stitch cap (POA) reached checkout",
        })
      }
    }

    // 3. Whole line priced below the garment's cash cost — gross error.
    const cost = costExGstMinorFromMetadata(line.variant?.metadata ?? null)
    if (actual !== null && cost !== null && isBelowCost(Math.round(actual * 100), cost)) {
      findings.push({
        line_id: line.id,
        kind: "below_cost",
        severity: "block",
        actual: round2(actual),
        detail: `unit ${round2(actual)} below garment cash cost ${(Math.round(cost * 1.1) / 100).toFixed(2)}`,
      })
    }
  }

  const verdict = findings.some((f) => f.severity === "block")
    ? "block"
    : findings.length
    ? "alert"
    : "ok"

  return {
    verdict,
    findings,
    aggregated_quantity,
    checked_lines: evaluable.length,
  }
}

/**
 * Fetch the cart read-only and evaluate. Returns null when the invariant is
 * off, the cart is missing/completed/empty, or anything throws (fail-open —
 * the caller proceeds with checkout either way and the error is logged).
 */
export async function runCheckoutPriceInvariant(
  cartId: string,
  scope: { resolve: (key: string) => unknown }
): Promise<InvariantResult | null> {
  if (invariantMode() === "off" || !cartId) return null
  try {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY) as {
      graph: (q: Record<string, unknown>) => Promise<{ data?: unknown[] }>
    }
    const { data: carts } = await query.graph({
      entity: "cart",
      filters: { id: cartId },
      fields: [
        "id",
        "customer_id",
        "completed_at",
        "items.id",
        "items.quantity",
        "items.unit_price",
        "items.variant_id",
        "items.metadata",
      ],
    })
    const cart = carts?.[0] as
      | {
          customer_id?: string | null
          completed_at?: unknown
          items?: Array<{
            id?: string
            quantity?: number
            unit_price?: unknown
            variant_id?: string | null
            metadata?: Record<string, unknown> | null
          }>
        }
      | undefined
    if (!cart || cart.completed_at) return null
    const rawItems = Array.isArray(cart.items) ? cart.items : []
    if (!rawItems.length) return null

    const tier = await resolveTierForCartCustomer(query as never, cart.customer_id ?? null)

    // Same variant-metadata batch fetch the recompute uses (the cart graph
    // join doesn't hydrate variant metadata reliably in production).
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

    const result = evaluateCartPricing(lines, tier)

    if (result.findings.length) {
      // eslint-disable-next-line no-console
      console.error(
        `[checkout-price-invariant] cart ${cartId} verdict=${result.verdict} mode=${invariantMode()} findings=${JSON.stringify(result.findings)}`
      )
      getPostHog()?.capture({
        distinctId: `cart_${cartId}`,
        event: "checkout_price_invariant_finding",
        properties: {
          cart_id: cartId,
          verdict: result.verdict,
          mode: invariantMode(),
          findings: result.findings,
          checked_lines: result.checked_lines,
        },
      })
    }
    return result
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[checkout-price-invariant] failed for cart ${cartId} (fail-open, checkout proceeds):`,
      error
    )
    return null
  }
}
