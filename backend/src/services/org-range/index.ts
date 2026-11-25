/**
 * "Our range" for an organisation (Docs/CUSTOMER_PORTAL_EXTRAS_2026_11.md § C):
 * the saved designs shared with it, what each costs this customer, and the
 * cart lines an order-form submit becomes. Routes:
 * api/store/customers/me/organisations/[id]/range/*.
 */
import { randomUUID } from "crypto"
import type { NamesNumbers } from "../../lib/names-numbers"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

import {
  buildRangeLines,
  mergeRangeItems,
  rangeDesignReadiness,
  variantColourSize,
  type RangeLine,
  type RangeRequestItem,
} from "../../lib/org-range"
import { recomputeScpCartPricingPure } from "../../lib/recompute-scp-cart-pricing"
import { setupFeesByGroup } from "../../lib/reorder-lines"
import { compactOrderRoster, garmentGroupFor, isPackingChoice, mergeOrderRoster, type RosterGarmentGroup } from "../../lib/roster"
import { computeScpLineDescriptor, type ScpLineDescriptor } from "../../lib/scp-line-descriptor"
import {
  resolveGarmentUnitAmountMajor,
  resolveTierForCartCustomer,
  type RemoteJoinerGraphLike,
} from "../../lib/scp-resolve-garment-unit-price"
import { colourFrontImage } from "../../lib/sizing-kit"
import { DESIGNS_MODULE } from "../../modules/designs"
import type DesignsModuleService from "../../modules/designs/service"
import { ORGANISATION_MODULE } from "../../modules/organisation"
import type OrganisationModuleService from "../../modules/organisation/service"

// The hidden setup-fee service products (same handles as order-again).
const SCREEN_SETUP_HANDLE = "screen-printing-setup-fee"
const SUPACOLOUR_SETUP_HANDLE = "supacolour-transfer-setup-fee"

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type ProductRow = {
  id: string
  handle: string | null
  title: string | null
  thumbnail: string | null
  status?: string | null
  type?: { value?: string | null } | null
  variants?: Array<{ id: string; title?: string | null }>
}

async function loadProducts(scope: MedusaContainer, ids: string[]): Promise<Map<string, ProductRow>> {
  const out = new Map<string, ProductRow>()
  if (ids.length === 0) return out
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    filters: { id: ids },
    fields: ["id", "handle", "title", "thumbnail", "status", "type.value", "variants.id", "variants.title"],
  })
  for (const p of (data ?? []) as ProductRow[]) {
    if (p.status === "published") out.set(p.id, p)
  }
  return out
}

export type RangeItem = {
  design_id: string
  name: string
  thumbnail_url: string | null
  product: { id: string; handle: string | null; title: string | null; thumbnail: string | null } | null
  /** Roster size slot this garment fills ("Fill from our people"). */
  garment_group: RosterGarmentGroup | null
  /** The colour the artwork was saved on (the thumbnail shows this one). */
  base_colour: string | null
  colours: string[]
  variants: Array<{ id: string; colour: string | null; size: string }>
  ready: boolean
  not_ready_reason: string | null
}

/**
 * Every design shared with the organisation, slim: the multi-MB canvas
 * payload never leaves Postgres — only the fragments readiness needs.
 */
export async function listRangeItems(scope: MedusaContainer, organisationId: string): Promise<RangeItem[]> {
  const pg = scope.resolve<any>("__pg_connection__")
  const { rows } = await pg.raw(
    `select id, name, thumbnail_url, base_product_id, base_variant_id,
            customizer_metadata->'prints' as prints,
            customizer_metadata->'artifacts' as artifacts
       from design
      where organisation_id = ? and deleted_at is null
      order by created_at desc
      limit 200`,
    [organisationId]
  )
  const designs = rows as Array<{
    id: string
    name: string
    thumbnail_url: string | null
    base_product_id: string | null
    base_variant_id: string | null
    prints: unknown
    artifacts: unknown
  }>
  const products = await loadProducts(
    scope,
    Array.from(new Set(designs.map((d) => d.base_product_id).filter((id): id is string => !!id)))
  )
  return designs.map((d) => {
    const product = d.base_product_id ? products.get(d.base_product_id) ?? null : null
    const variants = (product?.variants ?? []).map((v) => ({ id: v.id, ...variantColourSize(v.title) }))
    const colours = Array.from(new Set(variants.map((v) => v.colour).filter((c): c is string => !!c)))
    const readiness = rangeDesignReadiness({ prints: d.prints, artifacts: d.artifacts, has_product: !!product })
    return {
      design_id: d.id,
      name: d.name,
      thumbnail_url: d.thumbnail_url,
      product: product
        ? { id: product.id, handle: product.handle, title: product.title, thumbnail: product.thumbnail }
        : null,
      garment_group: product ? garmentGroupFor(`${product.type?.value ?? ""} ${product.title ?? ""}`) : null,
      base_colour: variants.find((v) => v.id === d.base_variant_id)?.colour ?? colours[0] ?? null,
      colours,
      variants,
      ready: readiness.ready,
      not_ready_reason: readiness.reason,
    }
  })
}

/**
 * Turn `{ design_id, variant_id, quantity }` rows into cart lines built from
 * the STORED designs. Throws unless every design is shared with THIS
 * organisation (404 — the caller already proved membership), orderable, and
 * every variant belongs to that design's garment.
 */
export async function buildRangeOrderLines(
  scope: MedusaContainer,
  organisationId: string,
  requested: RangeRequestItem[]
): Promise<RangeLine[]> {
  const items = mergeRangeItems(requested)
  if (items.length === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Type a quantity for at least one size.")
  }
  const designIds = Array.from(new Set(items.map((i) => i.design_id)))
  const designsService = scope.resolve<DesignsModuleService>(DESIGNS_MODULE)
  const designs = (await designsService.listDesigns(
    { id: designIds, organisation_id: organisationId } as any,
    { take: designIds.length }
  )) as any[]
  const designById = new Map(designs.map((d) => [d.id as string, d]))
  const products = await loadProducts(
    scope,
    Array.from(new Set(designs.map((d) => d.base_product_id).filter((id: unknown): id is string => !!id)))
  )

  // Each line's picture is its colour's front photo (the cart showed the
  // product's main photo otherwise: a blue tee for a White order).
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: imageRows } = products.size
    ? await query.graph({ entity: "product", filters: { id: [...products.keys()] }, fields: ["id", "images.url"] })
    : { data: [] }
  const imagesOf = new Map(((imageRows ?? []) as any[]).map((p) => [p.id as string, ((p.images ?? []) as any[]).map((i) => i?.url).filter(Boolean) as string[]]))

  const lines: RangeLine[] = []
  for (const designId of designIds) {
    const design = designById.get(designId)
    if (!design) throw new MedusaError(MedusaError.Types.NOT_FOUND, "That design isn't in this organisation's range.")
    const product = design.base_product_id ? products.get(design.base_product_id) : undefined
    const meta = (design.customizer_metadata ?? {}) as Record<string, unknown>
    const readiness = rangeDesignReadiness({ prints: meta.prints, artifacts: meta.artifacts, has_product: !!product })
    if (!readiness.ready || !product) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `"${design.name}": ${readiness.reason}`)
    }
    const wanted = items.filter((i) => i.design_id === designId)
    const variantIds = new Set((product.variants ?? []).map((v) => v.id))
    if (wanted.some((i) => !variantIds.has(i.variant_id))) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `"${design.name}": that size isn't available on this garment.`)
    }
    for (const line of buildRangeLines({
      design,
      product: { handle: product.handle, title: product.title, variants: product.variants ?? [] },
      items: wanted,
      groupId: randomUUID(),
      organisationId,
    })) {
      const colour = variantColourSize(product.variants?.find((v) => v.id === line.variant_id)?.title).colour
      const thumbnail = colourFrontImage(imagesOf.get(product.id) ?? [], colour)
      lines.push(thumbnail ? { ...line, thumbnail, metadata: { ...line.metadata, colour_thumbnail: true } } : line)
    }
  }
  return lines
}

type CartRow = {
  id: string
  customer_id?: string | null
  completed_at?: unknown
  currency_code?: string | null
  region_id?: string | null
  sales_channel_id?: string | null
  metadata?: Record<string, unknown> | null
  region?: { currency_code?: string | null } | null
  items?: Array<{
    id: string
    quantity?: number
    unit_price?: unknown
    variant_id?: string | null
    metadata?: Record<string, unknown> | null
  }>
}

/** The customer's own open cart, or 404 (never someone else's). */
export async function loadOwnCart(
  scope: MedusaContainer,
  cartId: string,
  customerId: string,
  withItems = false
): Promise<CartRow> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "customer_id",
      "completed_at",
      "currency_code",
      "region_id",
      "sales_channel_id",
      "metadata",
      "region.currency_code",
      ...(withItems
        ? ["items.id", "items.quantity", "items.unit_price", "items.variant_id", "items.metadata"]
        : []),
    ],
  })
  const cart = data?.[0] as CartRow | undefined
  if (!cart || cart.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.")
  }
  if (cart.completed_at) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "That cart has already been checked out.")
  }
  return cart
}

export type RangeFee = { variant_id: string | null; title: string; quantity: number; metadata: Record<string, unknown> }

/** Screen / Supacolour setup lines a fresh Studio add would create (as order-again). */
export async function rangeSetupFees(
  scope: MedusaContainer,
  lines: RangeLine[],
  descriptors: ScpLineDescriptor[]
): Promise<RangeFee[]> {
  const fees = setupFeesByGroup(lines.map((l, i) => ({ group_id: l.group_id, descriptor: descriptors[i] })))
  if (!fees.some((f) => f.screens > 0 || f.supacolour_designs > 0)) return []
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    filters: { handle: [SCREEN_SETUP_HANDLE, SUPACOLOUR_SETUP_HANDLE] },
    fields: ["handle", "variants.id"],
  })
  const variantOf = new Map<string, string>()
  for (const p of (data ?? []) as Array<{ handle: string; variants?: Array<{ id: string }> }>) {
    if (p.variants?.[0]?.id) variantOf.set(p.handle, p.variants[0].id)
  }
  const out: RangeFee[] = []
  for (const f of fees) {
    if (f.screens > 0) {
      out.push({
        variant_id: variantOf.get(SCREEN_SETUP_HANDLE) ?? null,
        title: "Screen printing setup",
        quantity: f.screens,
        metadata: { screen_setup_for_order: true, screen_setup_for_group: f.group_id },
      })
    }
    if (f.supacolour_designs > 0) {
      out.push({
        variant_id: variantOf.get(SUPACOLOUR_SETUP_HANDLE) ?? null,
        title: "Supacolour transfer setup",
        quantity: f.supacolour_designs,
        metadata: { supacolour_setup_for_order: true, supacolour_setup_for_group: f.group_id },
      })
    }
  }
  return out
}

export type RangePrice = {
  currency_code: string
  lines: Array<{ design_id: string; variant_id: string; quantity: number; unit_price: number; total: number }>
  setup_fees: Array<{ title: string; quantity: number; unit_price: number | null; total: number | null }>
  total_quantity: number
  /** Garments + setup, GST included. Delivery is worked out at checkout. */
  total: number
}

/**
 * What these lines will cost in THIS cart: each line priced by the same
 * descriptor an add uses, then run through the cart's own re-pricing together
 * with what is already in the cart (quantity breaks count the whole cart).
 * Nothing is written.
 */
export async function priceRangeLines(
  scope: MedusaContainer,
  cart: CartRow,
  lines: RangeLine[]
): Promise<RangePrice> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as unknown as RemoteJoinerGraphLike
  const tier = await resolveTierForCartCustomer(query, cart.customer_id ?? null)
  const descriptors = await Promise.all(
    lines.map((l) =>
      computeScpLineDescriptor({
        variantId: l.variant_id,
        quantity: l.quantity,
        metadata: l.metadata,
        printSizeIdRaw: l.print_size_id as string,
        cart,
        query,
        tier,
        container: scope,
      })
    )
  )

  const cartItems = cart.items ?? []
  const variantIds = Array.from(
    new Set([...lines.map((l) => l.variant_id), ...cartItems.map((i) => i.variant_id).filter((v): v is string => !!v)])
  )
  const { data: variantRows } = await query.graph({
    entity: "variants",
    filters: { id: variantIds },
    fields: ["id", "metadata"],
  })
  const variantMeta = new Map(
    ((variantRows ?? []) as Array<{ id: string; metadata?: Record<string, unknown> | null }>).map((v) => [v.id, v.metadata ?? null])
  )
  const withVariant = (id: string, quantity: number, unit_price: unknown, variantId: string | null, metadata: Record<string, unknown> | null) => ({
    id,
    quantity,
    unit_price,
    variant_id: variantId,
    metadata,
    variant: { id: variantId ?? undefined, metadata: variantId ? variantMeta.get(variantId) ?? null : null },
  })
  const { prices } = recomputeScpCartPricingPure(
    [
      ...cartItems.map((i) => withVariant(i.id, Number(i.quantity) || 0, i.unit_price, i.variant_id ?? null, i.metadata ?? null)),
      ...descriptors.map((d, i) => withVariant(`new_${i}`, d.quantity, d.unitPriceMajor, d.variantId, d.metadata)),
    ],
    tier
  )

  const priced = lines.map((l, i) => {
    const unit = prices.get(`new_${i}`) ?? descriptors[i].unitPriceMajor
    return { design_id: l.design_id, variant_id: l.variant_id, quantity: l.quantity, unit_price: unit, total: round2(unit * l.quantity) }
  })

  const fees = await rangeSetupFees(scope, lines, descriptors)
  const feeUnit = new Map<string, number>()
  for (const id of Array.from(new Set(fees.map((f) => f.variant_id).filter((v): v is string => !!v)))) {
    try {
      feeUnit.set(id, await resolveGarmentUnitAmountMajor({ query, variantId: id, quantity: 1, cart }))
    } catch {
      // Unknown fee price: shown as "to be confirmed", never as $0.
    }
  }
  const setup_fees = fees.map((f) => {
    const unit = f.variant_id ? feeUnit.get(f.variant_id) ?? null : null
    return { title: f.title, quantity: f.quantity, unit_price: unit, total: unit === null ? null : round2(unit * f.quantity) }
  })

  return {
    currency_code: (cart.currency_code ?? cart.region?.currency_code ?? "aud").toLowerCase(),
    lines: priced,
    setup_fees,
    total_quantity: priced.reduce((n, l) => n + l.quantity, 0),
    total: round2(priced.reduce((n, l) => n + l.total, 0) + setup_fees.reduce((n, f) => n + (f.total ?? 0), 0)),
  }
}

export type TeamDetailsInput = {
  /** "all" = every active person; a list = those roster ids; null = no roster on this order. */
  roster?: "all" | string[] | null
  packing?: string | null
  personalisation_requested?: boolean
  names_numbers?: NamesNumbers | null
}

/**
 * Stamp who the order is for on the cart: `organisation_id`, the roster (read
 * from OUR table, never from the request), the packing choice and the names /
 * numbers request. Merges — Medusa's cart update replaces metadata.
 */
export async function applyTeamDetailsToCart(
  scope: MedusaContainer,
  cart: CartRow,
  organisationId: string,
  details: TeamDetailsInput
): Promise<void> {
  const patch: Record<string, unknown> = { organisation_id: organisationId }
  // null ("just quantities") leaves the list alone: earlier adds on this cart still need theirs.
  if (details.roster) {
    const service = scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
    const people = (await service.listOrganisationRosterMembers(
      {
        organisation_id: organisationId,
        is_active: true,
        ...(details.roster === "all" ? {} : { id: details.roster }),
      } as any,
      { take: 1000, order: { name: "ASC" } }
    )) as any[]
    patch.roster = mergeOrderRoster(cart.metadata?.roster, people)
  }
  const hasRoster = patch.roster !== undefined ? !!patch.roster : !!compactOrderRoster(cart.metadata?.roster)
  if (details.packing !== undefined) {
    if (details.packing !== null && !isPackingChoice(details.packing)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unknown packing choice.")
    }
    if (details.packing === "individual" && !hasRoster) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Bagging per person needs your people list. Choose who the order is for.")
    }
    patch.packing = details.packing
  }
  if (details.personalisation_requested !== undefined) {
    patch.personalisation_requested = details.personalisation_requested === true
  }
  if (details.names_numbers !== undefined) {
    // Priced names / numbers are a names request too; "" clears it on the cart.
    patch.names_numbers = details.names_numbers ?? ""
    if (details.names_numbers) patch.personalisation_requested = true
  }
  const cartModule = scope.resolve(Modules.CART) as any
  await cartModule.updateCarts(cart.id, { metadata: { ...(cart.metadata ?? {}), ...patch } })
}
