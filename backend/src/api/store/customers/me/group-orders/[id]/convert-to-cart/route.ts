import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { createCartWorkflow } from "@medusajs/medusa/core-flows"

import { GROUP_ORDER_MODULE } from "../../../../../../../modules/group-order"
import type GroupOrderModuleService from "../../../../../../../modules/group-order/service"
import { getPostHog } from "../../../../../../../lib/posthog"
import { requireCustomer } from "../../../../../../../lib/require-customer"
import {
  loadBundleGroupItems,
  rosterToBundleLines,
  type BundleGroupConfig,
} from "../../../../../../../lib/bundle-group-order"
import { buildBundleCartLines } from "../../../../../../../lib/bundle-lines"
import { addScpLinesToCart } from "../../../../../../../lib/scp-add-lines"
import { rosterToDesignLines } from "../../../../../../../lib/group-order-lines"

/**
 * POST /store/customers/me/group-orders/:id/convert-to-cart
 *   → { cart_id, lines_added, skipped: participants whose size didn't match }
 *
 * Builds a cart from a group order's participants. Each participant's
 * size_label is matched exactly against the base product's size options
 * (in the organiser's colour), the roster is aggregated per variant, and
 * every line is priced garment + decoration (lib/group-order-lines.ts).
 * Sizes that can't be matched are reported in `skipped`; the cart is still
 * created so the owner can fix sizes manually.
 *
 * Idempotent on the side of the group order:
 *   - If the group order is already `converted` AND we have a recorded
 *     cart_id in converted_order_ids, return it without re-adding.
 *   - Otherwise build a fresh cart and stamp the id.
 *
 * Edge cases handled:
 *   - 0 participants → 400 ("nothing to convert").
 *   - Missing base_product_id → 400.
 *   - Base design has been deleted → cart still works, no design pre-load.
 *   - No region matching the storefront → 500 with clear message.
 *   - Size_label doesn't match any variant → skip + report.
 *   - Multiple variants match → pick the first deterministically.
 *   - Caller isn't the owner → 404 (don't leak existence).
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = requireCustomer(req)
  const groupOrderId = req.params.id
  if (!groupOrderId) {
    return res.status(400).json({ error: "id required" })
  }

  const service = req.scope.resolve<GroupOrderModuleService>(GROUP_ORDER_MODULE)
  let groupOrder: any
  try {
    groupOrder = await service.retrieveGroupOrder(groupOrderId)
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Group order not found.")
  }
  if (groupOrder.owner_customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Group order not found.")
  }

  // ---- Idempotency: already-converted → return existing cart ----
  // Conversion state lives in `converted_order_ids` — group_order has no
  // `metadata` column (earlier code wrote there and the write was lost).
  const existingMeta =
    ((groupOrder.converted_order_ids ?? groupOrder.metadata) as Record<string, unknown>) ?? {}
  if (
    groupOrder.status === "converted" &&
    typeof existingMeta.cart_id === "string"
  ) {
    return res.json({
      cart_id: existingMeta.cart_id,
      lines_added: 0,
      skipped: [],
      already_converted: true,
    })
  }

  if (!groupOrder.base_product_id && !groupOrder.bundle_id) {
    return res.status(400).json({
      error: "missing_base_product",
      detail:
        "This group order has no base product set. Add one before converting.",
    })
  }

  // ---- Atomic conversion claim (prevents duplicate carts) ----
  // The idempotency check above is a read-then-write; two concurrent POSTs
  // (double-click / retry) both pass it and both build a full cart with real
  // reserved inventory. Flip status to a transient "converting" in ONE
  // statement so only one POST proceeds. A 'converting' row older than 5 min
  // is treated as a crashed prior attempt and may be re-claimed, so a failed
  // conversion self-heals without manual revert.
  const pg = req.scope.resolve<any>("__pg_connection__")
  if (pg?.raw) {
    let claimed = false
    try {
      const claim = await pg.raw(
        `update "group_order"
            set status = 'converting', updated_at = now()
          where id = ?
            and deleted_at is null
            and status <> 'converted'
            and (status <> 'converting' or updated_at < now() - interval '5 minutes')
          returning id`,
        [groupOrderId]
      )
      claimed = (claim?.rows?.length ?? 0) > 0
    } catch {
      // If the claim query itself fails, convert anyway — losing the race
      // guard is better than blocking every conversion.
      claimed = true
    }
    if (!claimed) {
      const fresh = await service
        .retrieveGroupOrder(groupOrderId)
        .catch(() => null)
      const m = ((fresh as any)?.converted_order_ids ?? {}) as Record<string, unknown>
      if (
        fresh &&
        (fresh as any).status === "converted" &&
        typeof m.cart_id === "string"
      ) {
        return res.json({
          cart_id: m.cart_id,
          lines_added: 0,
          skipped: [],
          already_converted: true,
        })
      }
      return res.status(409).json({
        error: "conversion_in_progress",
        detail:
          "This group order is already being converted — try again in a moment.",
      })
    }
  }

  const participants = await service.listGroupOrderParticipants(
    { group_order_id: groupOrderId },
    { take: 1000 }
  )
  if (participants.length === 0) {
    return res.status(400).json({
      error: "no_participants",
      detail: "Add at least one participant before converting.",
    })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // ---- Bundle team order: the whole pack per participant, priced ----
  if (groupOrder.bundle_id && groupOrder.bundle_config) {
    const config = groupOrder.bundle_config as BundleGroupConfig
    const items = await loadBundleGroupItems(req.scope, groupOrder.bundle_id, config)
    const roster = rosterToBundleLines(items, participants as any[])
    if (!roster.items.length) {
      await service.updateGroupOrders([{ id: groupOrderId, status: "closed" }])
      return res.status(400).json({
        error: "no_matching_variants",
        detail: "No participant had a valid size for every item in the pack.",
        skipped: roster.skipped,
      })
    }
    const { lines } = await buildBundleCartLines(req.scope, {
      bundle: { id: groupOrder.bundle_id },
      artworkUrl: config.artwork_url ?? null,
      notes: config.notes ?? null,
      items: roster.items,
    })
    const cart = await createGroupCart(query, req.scope, groupOrder, groupOrderId)
    if ("error" in cart) return res.status(500).json(cart)
    const result = await addScpLinesToCart(req.scope, cart.id, lines)
    await service.updateGroupOrders([
      {
        id: groupOrderId,
        status: "converted",
        converted_order_ids: {
          ...existingMeta,
          cart_id: cart.id,
          converted_at: new Date().toISOString(),
          converted_lines: result.items_added,
        },
      },
    ])
    getPostHog()?.capture({
      distinctId: groupOrder.owner_email,
      event: "group order converted to cart",
      properties: {
        group_order_id: groupOrderId,
        cart_id: cart.id,
        lines_added: result.items_added,
        lines_skipped: roster.skipped.length,
        bundle_team_order: true,
      },
    })
    return res.json({
      cart_id: cart.id,
      lines_added: result.items_added,
      skipped: roster.skipped,
    })
  }

  // ---- Resolve the base product's variants + match each participant ----
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "variants.id",
      "variants.title",
      "variants.options.value",
      "variants.options.option.title",
    ],
    filters: { id: groupOrder.base_product_id },
  })
  const product = (products as any[])?.[0]
  if (!product) {
    return res.status(404).json({
      error: "product_not_found",
      detail:
        "The base product for this group order no longer exists. Pick a new product.",
    })
  }

  // Load the design (if any) — it's what gets printed on every garment.
  let designMetadata: Record<string, unknown> | null = null
  if (groupOrder.base_design_id) {
    let d: any = null
    try {
      const { data: designs } = await query.graph({
        entity: "design",
        fields: ["id", "customer_id", "customizer_metadata"],
        filters: { id: groupOrder.base_design_id },
      })
      d = (designs as any[])?.[0] ?? null
    } catch {
      // Soft-fail; the cart still works without it (blank garments).
    }
    // Re-verify ownership here, not just at create time: a group order that
    // somehow points at someone else's design must never print it (4-2).
    if (d && d.customer_id !== groupOrder.owner_customer_id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Design not found.")
    }
    if (d?.customizer_metadata) {
      designMetadata = d.customizer_metadata as Record<string, unknown>
    }
  }

  // One priced line per variant (lib/group-order-lines.ts): garment +
  // decoration via the same descriptor + recompute as a Studio add.
  const { lines: cartLines, skipped } = rosterToDesignLines({
    variants: product.variants ?? [],
    baseVariantId: groupOrder.base_variant_id,
    participants: participants as any[],
    design: designMetadata,
    groupOrderId,
  })
  if (cartLines.length === 0) {
    await service.updateGroupOrders([{ id: groupOrderId, status: "closed" }])
    return res.status(400).json({
      error: "no_matching_variants",
      detail:
        "None of the participants' sizes matched the base product's variants.",
      skipped,
    })
  }

  // ---- Build the cart ----
  const cart = await createGroupCart(query, req.scope, groupOrder, groupOrderId)
  if ("error" in cart) return res.status(500).json(cart)

  let linesAdded = 0
  try {
    linesAdded = (await addScpLinesToCart(req.scope, cart.id, cartLines)).items_added
  } catch (err: any) {
    // e.g. a saved design with unconfirmed embroidery size — reopen so the
    // owner can fix the design and convert again.
    await service.updateGroupOrders([{ id: groupOrderId, status: "closed" }])
    return res.status(400).json({
      error: "pricing_failed",
      detail: err?.message ?? "Couldn't price this design. Contact us and we'll sort it.",
      skipped,
    })
  }

  // Stamp converted + cart_id on the group order itself.
  // Cast — the generated Medusa types for json-default fields are
  // narrower than what we actually store.
  await (service as any).updateGroupOrders([
    {
      id: groupOrderId,
      status: "converted",
      converted_order_ids: {
        ...existingMeta,
        cart_id: cart.id,
        converted_at: new Date().toISOString(),
        converted_lines: linesAdded,
      },
    },
  ])

  getPostHog()?.capture({
    distinctId: groupOrder.owner_email,
    event: "group order converted to cart",
    properties: {
      group_order_id: groupOrderId,
      cart_id: cart.id,
      lines_added: linesAdded,
      lines_skipped: skipped.length,
    },
  })

  res.json({
    cart_id: cart.id,
    lines_added: linesAdded,
    skipped,
  })
}

async function createGroupCart(
  query: any,
  scope: AuthenticatedMedusaRequest["scope"],
  groupOrder: any,
  groupOrderId: string
): Promise<{ id: string } | { error: string }> {
  let regionId: string | null = null
  let salesChannelId: string | null = null
  try {
    const { data: regions } = await query.graph({
      entity: "region",
      fields: ["id", "currency_code"],
      pagination: { take: 50, skip: 0 },
    })
    regionId = (regions as any[])?.[0]?.id ?? null
  } catch {
    /* fallthrough */
  }
  if (!regionId) return { error: "no_region_configured" }
  try {
    const { data: channels } = await query.graph({
      entity: "sales_channel",
      fields: ["id", "is_disabled"],
      pagination: { take: 20, skip: 0 },
    })
    const live =
      (channels as any[])?.find((c) => c.is_disabled !== true) ??
      (channels as any[])?.[0]
    salesChannelId = live?.id ?? null
  } catch {
    /* fallthrough */
  }

  const { result: cart } = await createCartWorkflow(scope).run({
    input: {
      region_id: regionId,
      sales_channel_id: salesChannelId ?? undefined,
      email: groupOrder.owner_email,
      currency_code: "aud",
      metadata: {
        source: "group_order_convert",
        group_order_id: groupOrderId,
        group_order_token: groupOrder.public_token,
      },
    },
  })
  return { id: cart.id }
}
