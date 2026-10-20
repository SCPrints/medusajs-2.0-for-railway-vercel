import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { refreshCartItemsWorkflow } from "@medusajs/medusa/core-flows"
import type { ICartModuleService } from "@medusajs/framework/types"

import {
  bnLikeToMajorAmount,
  garmentMajorWithTier,
  normalizeBulkPricingTiersFromVariantMetadata,
  resolveTierForCartCustomer,
} from "./scp-resolve-garment-unit-price"
import type { Tier } from "./customer-tiers"
import {
  isScpPrintSizeId,
  resolveScpTierIndexForQuantity,
  type ScpPrintSizeId,
} from "./scp-dtf-print-pricing"
import {
  clusterDigitizingEntries,
  computeDecorationTotals,
  embroideryDigitizingUnits,
  fullColourCardFromStoredServer,
  screenDarkGarmentFromStoredBreakdown,
  screenHeavyFromStoredBreakdown,
  screenJobQuantityByLine,
  type DigitizingUnitEntry,
} from "./scp-decoration-pricing"
import {
  applyBundleDiscount,
  bundleDiscountByLine,
  loadBundleDiscountDefs,
} from "./bundle-lines"

/**
 * Cross-cart bulk-tier aggregation.
 *
 * SC Prints' tier ladder (1-9 / 10-19 / 20-49 / 50-99 / 100+) is uniform across
 * every variant (see `backend/src/utils/bulk-price-ladder.ts`). Each variant
 * carries its own per-tier `amount` on `metadata.bulk_pricing.tiers`. The
 * historical pricing model looked up that tier using *just this line's*
 * quantity, meaning a customer adding 20 of Product A and 30 of Product B
 * paid the 20-tier and 30-tier prices independently — not the 50-tier price
 * that 50 total units should unlock.
 *
 * This helper recomputes every eligible line's `unit_price` based on the
 * aggregated quantity across the cart. Eligibility = the line's variant has
 * `bulk_pricing.tiers` metadata and is not opted out via
 * `variant.metadata.exclude_from_bulk_aggregation === true`. Opt-out is
 * intended for niche SKUs like the DTF gang sheet that should not participate
 * in the bulk discount.
 *
 * Each eligible line's price has two parts that both depend on quantity:
 *   - garment unit price (variant `bulk_pricing.tiers` lookup)
 *   - SCP DTF print surcharge (tier-indexed, only for customizer lines)
 *
 * Both are recomputed at the aggregated quantity. Lines without
 * `customizerDesign.pricing.server` metadata are treated as plain garment
 * lines (no print surcharge); they still benefit from the aggregated garment
 * tier.
 *
 * Idempotent and loop-safe: if no line's `unit_price` would change, the
 * helper does nothing. This means a subscriber firing on `cart.updated`
 * won't recurse — the second-pass recompute is a no-op.
 */

// Number.EPSILON nudges binary x.xx5 (29.95 × 0.9 = 26.954999…) onto the cent it means (review 1-9).
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type RecomputeResult = {
  aggregated_quantity: number
  eligible_line_ids: string[]
  excluded_line_ids: string[]
  updates: Array<{ line_id: string; old_unit_price: number; new_unit_price: number }>
}

/**
 * Review 1-7. `perLine` prices every eligible line at its OWN quantity
 * instead of the cart-wide sum — what the ENABLE_SCP_CART_AGGREGATION=false
 * branch now does instead of returning early (a quantity edit through
 * Medusa core keeps the custom unit_price, so "aggregation off" must still
 * re-tier the edited line or 5 units stay at the 100+ price). `lineIds`
 * restricts the write to those lines; the storefront uses both together as
 * the fallback when the full recompute fails after a quantity change.
 */
export type RecomputeOptions = {
  perLine?: boolean
  lineIds?: string[]
}

type CartLineForRecompute = {
  id: string
  quantity: number
  unit_price: unknown
  variant_id?: string | null
  metadata?: Record<string, unknown> | null
  variant?: {
    id?: string
    metadata?: Record<string, unknown> | null
  } | null
}

const ENABLE_FLAG_ENV = "ENABLE_SCP_CART_AGGREGATION"

/**
 * Lost-update guard (review 1-2). The recompute reads the cart, prices it,
 * then writes unit_price per line — with no cart lock, while Medusa's core
 * cart workflows hold one. A quantity edit that lands between our read and
 * our write would be priced at the stale quantity and nothing re-triggers
 * until the next mutation (±$470 on a 100-unit line at a tier boundary).
 *
 * Instead of taking the core lock (refreshCartItemsWorkflow re-acquires the
 * same key with the default owner, so we'd have to release before calling
 * it and every caller already runs after its own workflow returned), we
 * fingerprint the lines we priced and re-read right before the write: if any
 * (id, quantity, updated_at) differs, discard and recompute once more.
 * updated_at catches concurrent design edits too, not just quantity.
 */
export function cartItemsFingerprint(
  items: ReadonlyArray<{ id?: string; quantity?: number; updated_at?: unknown }>
): string {
  return items
    .filter((it) => !!it?.id)
    .map((it) => {
      const ts = it.updated_at instanceof Date ? it.updated_at.toISOString() : String(it.updated_at ?? "")
      return `${it.id}:${it.quantity ?? ""}:${ts}`
    })
    .sort()
    .join("|")
}

const CART_ITEM_FINGERPRINT_FIELDS = ["items.id", "items.quantity", "items.updated_at"]

const aggregationDisabled = (): boolean => {
  const raw = process.env[ENABLE_FLAG_ENV]
  if (raw === undefined) return false
  const normalized = raw.trim().toLowerCase()
  return normalized === "false" || normalized === "0" || normalized === "no"
}

const readScpServerBlock = (
  metadata: Record<string, unknown> | null | undefined
): {
  printSizeId: ScpPrintSizeId | null
  storedGarmentMajor: number | null
  screenHeavyGarment: boolean
  screenDarkGarment: boolean
  fullColourCard: "dtf" | "supacolour"
} | null => {
  if (!metadata || typeof metadata !== "object") return null
  const customizerDesign = metadata.customizerDesign as Record<string, unknown> | undefined
  if (!customizerDesign || typeof customizerDesign !== "object") return null

  const pricing = customizerDesign.pricing as Record<string, unknown> | undefined
  const server = (pricing?.server ?? null) as Record<string, unknown> | null
  if (!server || typeof server !== "object") return null

  const printSizeRaw = server.print_size_id
  const printSizeId = isScpPrintSizeId(printSizeRaw) ? printSizeRaw : null

  // Stamped at original add-time by `scp-line-items/route.ts`. Falls back to
  // null for older payloads — callers handle that by trying variant tiers.
  const storedGarmentRaw = server.garment_unit_major
  const storedGarmentMajor =
    typeof storedGarmentRaw === "number" && Number.isFinite(storedGarmentRaw)
      ? storedGarmentRaw
      : null

  // Heavy-garment surcharge as resolved server-side at add time (from
  // product.metadata.screen_heavy) — reuse the stamped breakdown so the
  // recompute doesn't need another product lookup.
  const screenHeavyGarment = screenHeavyFromStoredBreakdown(server)
  const screenDarkGarment = screenDarkGarmentFromStoredBreakdown(server)
  const fullColourCard = fullColourCardFromStoredServer(server)

  return { printSizeId, storedGarmentMajor, screenHeavyGarment, screenDarkGarment, fullColourCard }
}

const isLineEligible = (line: CartLineForRecompute): boolean => {
  const variantMeta = line.variant?.metadata ?? null
  // Negotiated quote price: a line materialised from an accepted quote carries
  // the staff-agreed unit_price. It must NEVER be silently re-tiered by the
  // bulk ladder if the customer later edits their cart (qty bump / remove line
  // both trigger a cart-wide recompute), or we'd charge an amount they never
  // agreed to. Stamped by the quote-accept route.
  if ((line.metadata as any)?.quote_locked_price === true) return false
  // Standalone embroidery-panel line (`embroidery-line-items` route): its
  // unit_price bakes in a stitch-priced embroidery add-on that this helper
  // can't reconstruct (breakdown lives on `metadata.decorationDesign`, not
  // the customizerDesign server block). Re-tiering it here would strip the
  // embroidery charge down to bare garment — keep the add-time price.
  if ((line.metadata as any)?.decorationDesign) return false
  // Opt-out applies regardless of metadata shape.
  if (variantMeta?.exclude_from_bulk_aggregation === true) return false
  // Path A: variant carries a bulk-pricing ladder → standard garment line.
  if (variantMeta) {
    const tiers = normalizeBulkPricingTiersFromVariantMetadata(variantMeta)
    if (tiers.length > 0) return true
  }
  // Path B: customizer line whose variant has no ladder (e.g. some caps).
  // The garment portion is fixed at add-time; we only re-tier the print
  // surcharge. Still eligible to participate in cart-wide aggregation so
  // it benefits from (and contributes to) the aggregated qty.
  const scpBlock = readScpServerBlock(line.metadata)
  return Boolean(scpBlock && scpBlock.printSizeId)
}

/**
 * Cart-wide digitizing amortisation. Digitizing is charged per distinct
 * FILE (artwork + size within the ~5% resize tolerance) — the same logo at
 * the same size across a size fan-out or across different garments shares
 * ONE fee, amortised over every garment that carries it; the same logo
 * resized beyond tolerance is a new file and a new fee. Returns, per line,
 * the amortisation base for each of that line's digitizing-unit keys.
 */
const buildDigitizingAmortByLine = (
  lines: CartLineForRecompute[]
): Map<string, Map<string, number>> => {
  const tagged: Array<{ entry: DigitizingUnitEntry; lineId: string; qty: number }> = []
  for (const line of lines) {
    if (!line?.id) continue
    const qty = Math.max(0, Math.floor(line.quantity || 0))
    for (const entry of embroideryDigitizingUnits(line.metadata, line.id)) {
      tagged.push({ entry, lineId: line.id, qty })
    }
  }
  if (!tagged.length) return new Map()

  const clustersByKey = clusterDigitizingEntries(tagged.map((t) => t.entry))
  const taggedByEntry = new Map(tagged.map((t) => [t.entry, t]))

  // Sum quantities per cluster — each LINE counts once even if two of its
  // sides share the cluster (the garments are the same physical units).
  const clusterQty = new Map<DigitizingUnitEntry[], number>()
  for (const cluster of new Set(clustersByKey.values())) {
    const seenLines = new Set<string>()
    let qty = 0
    for (const member of cluster) {
      const t = taggedByEntry.get(member)
      if (!t || seenLines.has(t.lineId)) continue
      seenLines.add(t.lineId)
      qty += t.qty
    }
    clusterQty.set(cluster, Math.max(1, qty))
  }

  const byLine = new Map<string, Map<string, number>>()
  for (const t of tagged) {
    const cluster = clustersByKey.get(t.entry.key)
    if (!cluster) continue
    const amort = clusterQty.get(cluster) ?? Math.max(1, t.qty)
    if (!byLine.has(t.lineId)) byLine.set(t.lineId, new Map())
    byLine.get(t.lineId)!.set(t.entry.key, amort)
  }
  return byLine
}

const computeNewUnitPriceMajor = (
  line: CartLineForRecompute,
  aggregatedQty: number,
  screenJobQty: number,
  tier?: Tier | null,
  digitizingAmortQtyByKey?: Map<string, number>,
  bundleDiscountPct?: number
): number | null => {
  const variantMeta = line.variant?.metadata ?? null
  // Tier customers get a flat garment price (cost × multiplier), quantity-
  // independent — it replaces the aggregated bulk-tier lookup. The print/
  // embroidery surcharge below still tiers on aggregated quantity (decoration
  // is a service, not covered by the garment-cost tier).
  const garmentFromTiers = garmentMajorWithTier(variantMeta, aggregatedQty, tier)
  const scpBlock = readScpServerBlock(line.metadata)

  // Garment portion: prefer the live tier lookup when the variant has a
  // ladder; otherwise fall back to the garment amount stamped at add-time.
  // Either is fine — we just need a stable garment baseline.
  const garmentMajor =
    garmentFromTiers !== null
      ? garmentFromTiers
      : scpBlock?.storedGarmentMajor ?? null

  if (garmentMajor === null) return null

  // No customizer metadata → plain garment line, no print component.
  if (!scpBlock || !scpBlock.printSizeId) {
    return applyBundleDiscount(round2(Math.max(0, garmentMajor)), bundleDiscountPct)
  }

  // Canonical decoration math — shared with the add descriptor and the
  // update-design route (see scp-decoration-pricing.ts). Recompute
  // semantics: the DTF print tier uses the AGGREGATED cart quantity
  // (cross-line tier aggregation — gang sheets fall as the whole cart
  // grows); the screen tier uses the design-group (supplier JOB) quantity —
  // DSP prices each job by its own count, so unrelated cart lines must not
  // lift a 30-piece screen run into the 50-99 band; embroidery uses the
  // line's OWN quantity so this recompute reproduces the add-time price
  // bit-for-bit (the digitizing fee is amortised per line). Order #44
  // shipped garment-only because an earlier copy of this math dropped the
  // embroidery term entirely.
  const totals = computeDecorationTotals({
    metadata: line.metadata,
    printSizeId: scpBlock.printSizeId,
    printTierQuantity: aggregatedQty,
    screenTierQuantity: screenJobQty,
    embroideryQuantity: Math.max(1, Math.floor(line.quantity || 1)),
    screenHeavyGarment: scpBlock.screenHeavyGarment,
    screenDarkGarment: scpBlock.screenDarkGarment,
    fullColourCard: scpBlock.fullColourCard,
    digitizingAmortQtyByKey,
  })

  // Pack discount (bundle bought in full) — last, over garment + decoration.
  return applyBundleDiscount(
    round2(
      Math.max(0, garmentMajor) +
        totals.printTotalMajor +
        totals.embroideryTotalMajor +
        totals.screenTotalMajor
    ),
    bundleDiscountPct
  )
}

const buildUpdatedServerBlock = (
  existingMetadata: Record<string, unknown> | null | undefined,
  newUnitPriceMajor: number,
  aggregatedQty: number,
  screenJobQty: number,
  bundleDiscountPct?: number
): Record<string, unknown> | null => {
  if (!existingMetadata || typeof existingMetadata !== "object") return null
  const customizerDesign = existingMetadata.customizerDesign as
    | Record<string, unknown>
    | undefined
  if (!customizerDesign || typeof customizerDesign !== "object") return null
  const pricing = (customizerDesign.pricing ?? {}) as Record<string, unknown>
  const server = (pricing.server ?? {}) as Record<string, unknown>
  // Mirror the new aggregated tier so admin/order-detail widgets can show "tier
  // applied: 50-99 (aggregated)". Garment + print breakdown is recomputed by
  // the caller — we only stamp the new unit_price and aggregated_quantity.
  const updatedServer: Record<string, unknown> = {
    ...server,
    unit_price_major: newUnitPriceMajor,
    aggregated_quantity: aggregatedQty,
    tier_index: resolveScpTierIndexForQuantity(aggregatedQty),
    // Screen job (design-group) quantity the screen tier was priced at —
    // what DSP will bill this run on, so staff can reconcile the invoice.
    screen_job_quantity: screenJobQty,
    // Pack discount actually applied this pass (0 once the pack is broken up).
    bundle_discount_pct: bundleDiscountPct ?? 0,
  }
  return {
    ...existingMetadata,
    customizerDesign: {
      ...customizerDesign,
      pricing: {
        ...pricing,
        server: updatedServer,
      },
    },
  }
}

/**
 * Inspect every line on a cart and rewrite `unit_price` on eligible lines
 * so they reflect the aggregated-quantity tier. Returns a summary of what
 * changed (useful for tests and telemetry). Safe to call repeatedly; the
 * second invocation will return `updates: []` when prices are already
 * aligned.
 *
 * `scope` must be a Medusa container scope (req.scope or subscriber
 * container). The helper resolves the Remote Query and the workflow runner
 * from it.
 */
export async function recomputeScpCartPricing(
  cartId: string,
  scope: { resolve: (key: string) => unknown },
  opts: RecomputeOptions = {}
): Promise<RecomputeResult> {
  const empty: RecomputeResult = {
    aggregated_quantity: 0,
    eligible_line_ids: [],
    excluded_line_ids: [],
    updates: [],
  }

  if (!cartId) return empty

  // One retry when the cart changed under us (see cartItemsFingerprint).
  for (let attempt = 0; ; attempt++) {
    const outcome = await recomputeOnce(cartId, scope, empty, opts)
    if (outcome !== "stale") return outcome
    if (attempt >= 1) {
      // eslint-disable-next-line no-console
      console.warn(
        `[recompute-scp-cart-pricing] cart ${cartId} changed during both recompute passes — leaving prices for the next mutation to re-trigger`
      )
      return empty
    }
    // eslint-disable-next-line no-console
    console.warn(`[recompute-scp-cart-pricing] cart ${cartId} changed during recompute — retrying once`)
  }
}

async function recomputeOnce(
  cartId: string,
  scope: { resolve: (key: string) => unknown },
  empty: RecomputeResult,
  opts: RecomputeOptions
): Promise<RecomputeResult | "stale"> {
  const perLine = opts.perLine === true || aggregationDisabled()
  const onlyLineIds = opts.lineIds?.length ? new Set(opts.lineIds) : null
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
      ...CART_ITEM_FINGERPRINT_FIELDS,
      "items.unit_price",
      "items.variant_id",
      "items.metadata",
    ],
  })

  const cart = carts?.[0] as
    | {
        id?: string
        customer_id?: string | null
        completed_at?: unknown
        items?: Array<{
          id?: string
          quantity?: number
          updated_at?: unknown
          unit_price?: unknown
          variant_id?: string | null
          metadata?: Record<string, unknown> | null
        }>
      }
    | undefined

  if (!cart || cart.completed_at) return empty

  // Tier customers get a flat garment price that replaces the bulk ladder.
  // Resolved once per recompute and applied to every eligible line.
  const tier = await resolveTierForCartCustomer(query as never, cart.customer_id ?? null)
  const rawItems = Array.isArray(cart.items) ? cart.items : []
  if (!rawItems.length) return empty

  // Batch-fetch variant metadata directly. Following `items.variant.metadata`
  // through the cart graph collapses to null in production (the join doesn't
  // hydrate metadata reliably), so every line would be skipped and the
  // recompute would no-op. Matches the pattern used by
  // `resolveGarmentUnitAmountMajor` in the add endpoint.
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

  const items: CartLineForRecompute[] = rawItems.map((raw) => ({
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

  const eligible: CartLineForRecompute[] = []
  const excluded: string[] = []
  for (const item of items) {
    if (!item || !item.id) continue
    if (onlyLineIds && !onlyLineIds.has(item.id)) continue
    if (isLineEligible(item)) {
      eligible.push(item)
    } else {
      excluded.push(item.id)
    }
  }

  if (!eligible.length) {
    return { ...empty, excluded_line_ids: excluded }
  }

  const aggregatedQty = eligible.reduce(
    (sum, line) => sum + Math.max(0, Math.floor(line.quantity || 0)),
    0
  )
  const effectiveQty = Math.max(1, aggregatedQty)
  const tierQtyFor = (line: CartLineForRecompute) =>
    perLine ? Math.max(1, Math.floor(line.quantity || 1)) : effectiveQty

  type PendingUpdate = {
    line_id: string
    old_unit_price: number
    new_unit_price: number
    updated_metadata: Record<string, unknown> | null
  }

  const digitizingAmortByLine = buildDigitizingAmortByLine(eligible)
  const screenJobQtyByLine = screenJobQuantityByLine(eligible)
  // Completeness is judged over ALL cart lines (an undiscountable bundle line
  // still proves the item is present).
  const bundleDiscounts = bundleDiscountByLine(
    items,
    await loadBundleDiscountDefs(scope, items)
  )
  const pending: PendingUpdate[] = []
  for (const line of eligible) {
    const oldUnitPrice = bnLikeToMajorAmount(line.unit_price) ?? 0
    const screenJobQty = screenJobQtyByLine.get(line.id) ?? Math.max(1, line.quantity)
    const newUnitPriceMajor = computeNewUnitPriceMajor(
      line,
      tierQtyFor(line),
      screenJobQty,
      tier,
      digitizingAmortByLine.get(line.id),
      bundleDiscounts.get(line.id)
    )
    if (newUnitPriceMajor === null) continue
    if (round2(oldUnitPrice) === round2(newUnitPriceMajor)) continue

    pending.push({
      line_id: line.id,
      old_unit_price: round2(oldUnitPrice),
      new_unit_price: newUnitPriceMajor,
      updated_metadata: buildUpdatedServerBlock(
        line.metadata,
        newUnitPriceMajor,
        tierQtyFor(line),
        screenJobQty,
        bundleDiscounts.get(line.id)
      ),
    })
  }

  // ONE batched write + ONE cart refresh. The old shape ran one
  // updateLineItemInCartWorkflow per line in parallel, but every run takes
  // the same per-cart lock (2s timeout) and does a full refresh, so on carts
  // with many changed lines (bundles, the bulk grid) the later runs failed
  // with "Failed to acquire lock" and those lines kept their add-time price.
  // A non-forced refresh doesn't reprice items — it only re-syncs shipping,
  // promotions and the payment collection, exactly what each per-line run did
  // after writing its price.
  if (pending.length) {
    // Re-read right before the write: a core workflow (quantity edit, design
    // update, remove) may have landed since our read above. Priced against
    // stale lines → discard; the caller retries once.
    const { data: freshCarts } = await query.graph({
      entity: "cart",
      filters: { id: cartId },
      fields: ["id", "completed_at", ...CART_ITEM_FINGERPRINT_FIELDS],
    })
    const fresh = freshCarts?.[0] as
      | { completed_at?: unknown; items?: Array<{ id?: string; quantity?: number; updated_at?: unknown }> }
      | undefined
    if (!fresh || fresh.completed_at) return empty
    if (cartItemsFingerprint(fresh.items ?? []) !== cartItemsFingerprint(rawItems)) {
      return "stale"
    }

    const cartModule = scope.resolve(Modules.CART) as ICartModuleService
    await cartModule.updateLineItems(
      pending.map((p) => ({
        id: p.line_id,
        unit_price: p.new_unit_price,
        is_custom_price: true,
        ...(p.updated_metadata ? { metadata: p.updated_metadata } : {}),
      }))
    )
    await refreshCartItemsWorkflow(scope as never).run({ input: { cart_id: cartId } })
  }

  return {
    aggregated_quantity: aggregatedQty,
    eligible_line_ids: eligible.map((l) => l.id),
    excluded_line_ids: excluded,
    updates: pending.map(({ line_id, old_unit_price, new_unit_price }) => ({
      line_id,
      old_unit_price,
      new_unit_price,
    })),
  }
}

/**
 * Test-friendly pure variant of the recompute logic. Given a list of lines
 * (with their variant metadata + per-line metadata), returns the new
 * `unit_price` map without touching any Medusa workflow. Used by unit tests
 * and could also be reused by an admin "what-if" preview widget later.
 */
export function recomputeScpCartPricingPure(
  lines: CartLineForRecompute[],
  tier?: Tier | null,
  /** Per-line pack discount % (bundleDiscountByLine). */
  bundleDiscounts?: Map<string, number>,
  opts: Pick<RecomputeOptions, "perLine"> = {}
): {
  aggregated_quantity: number
  prices: Map<string, number>
  excluded_line_ids: string[]
} {
  const prices = new Map<string, number>()
  const excluded: string[] = []
  const eligible: CartLineForRecompute[] = []
  for (const line of lines) {
    if (!line || !line.id) continue
    if (isLineEligible(line)) eligible.push(line)
    else excluded.push(line.id)
  }

  const aggregatedQty = eligible.reduce(
    (sum, line) => sum + Math.max(0, Math.floor(line.quantity || 0)),
    0
  )
  const effectiveQty = Math.max(1, aggregatedQty)

  const digitizingAmortByLine = buildDigitizingAmortByLine(eligible)
  const screenJobQtyByLine = screenJobQuantityByLine(eligible)
  for (const line of eligible) {
    const major = computeNewUnitPriceMajor(
      line,
      opts.perLine ? Math.max(1, Math.floor(line.quantity || 1)) : effectiveQty,
      screenJobQtyByLine.get(line.id) ?? Math.max(1, line.quantity),
      tier,
      digitizingAmortByLine.get(line.id),
      bundleDiscounts?.get(line.id)
    )
    if (major !== null) prices.set(line.id, major)
  }

  return { aggregated_quantity: aggregatedQty, prices, excluded_line_ids: excluded }
}
