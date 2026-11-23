import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"

import { classifyCartAddError, extractWorkflowErrorMessage } from "../../../../../lib/cart-workflow-error"
import { captureEvent } from "../../../../../lib/posthog"
import {
  buyerState,
  isTeamStoresEnabled,
  teamStoreCartMixError,
  variantItemError,
  variantSize,
} from "../../../../../lib/team-store"
import { printSizeIdForDesign } from "../../../../../lib/group-order-lines"
import { TEAM_STORE_MODULE } from "../../../../../modules/team-store"
import { verifyStorePassword } from "../../../../../services/team-store/sign"

const schema = z.object({
  team_store_id: z.string().min(1),
  password: z.string().max(100).optional(),
  lines: z
    .array(
      z.object({
        item_id: z.string().min(1),
        variant_id: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(200),
      })
    )
    .min(1)
    .max(40),
})

/**
 * POST /store/carts/:id/team-store-items
 *
 * Adds team-store items at the store's fixed price. The client sends only
 * which item, variant and quantity; price, design and store membership come
 * from the DB (bundle-items pattern). `team_store_locked_price` keeps the
 * cart recompute and the checkout invariant away from these lines, so a
 * qty-1 buyer pays the store price, never the small-order ladder.
 *
 * Refuses a cart that holds anything else (Decision 4).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!isTeamStoresEnabled()) return res.status(404).json({ message: "Not found" })
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues.map((i) => i.message).join(", "))
  }
  const body = parsed.data
  const cartId = req.params.id

  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const store = await service.retrieveTeamStore(body.team_store_id).catch(() => null)
  if (!store) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Team store not found.")
  if (buyerState(store, new Date()) !== "open") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This team store isn't taking orders right now.")
  }
  if (!verifyStorePassword(store.password_hash, body.password)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This team store needs its password.")
  }

  const itemIds = [...new Set(body.lines.map((l) => l.item_id))]
  const items: any[] = await service.listTeamStoreItems({ id: itemIds, team_store_id: store.id, is_active: true }, { take: itemIds.length })
  const itemById = new Map(items.map((i) => [i.id, i]))

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const [{ data: carts }, { data: variants }] = await Promise.all([
    query.graph({ entity: "cart", filters: { id: cartId }, fields: ["id", "completed_at", "metadata", "items.id", "items.metadata"] }),
    query.graph({
      entity: "variant",
      filters: { id: [...new Set(body.lines.map((l) => l.variant_id))] },
      fields: ["id", "title", "options.value", "options.option.title", "product.handle"],
    }),
  ])
  const cart = carts?.[0]
  if (!cart) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.")
  if (cart.completed_at) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cannot modify a completed cart.")
  const mix = teamStoreCartMixError(cart.items ?? [], store.id)
  if (mix) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, mix)

  const variantById = new Map((variants as any[]).map((v) => [v.id, v]))
  const closesAt = new Date(store.closes_at).toISOString()
  const toAdd = body.lines.map((line) => {
    const item = itemById.get(line.item_id)
    if (!item || !item.customizer_design || item.unit_price == null) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "That item isn't available in this store.")
    }
    const variant = variantById.get(line.variant_id)
    const why = variant ? variantItemError(item, variant) : "That size isn't available."
    if (why) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, why)
    const design = item.customizer_design as Record<string, unknown>
    return {
      variant_id: variant.id,
      quantity: line.quantity,
      unit_price: Number(item.unit_price),
      metadata: {
        customizerDesign: { ...design, variantId: variant.id },
        print_size_id: printSizeIdForDesign(design),
        product_handle: item.product_handle,
        team_store_id: store.id,
        team_store_item_id: item.id,
        team_store_title: store.title,
        team_store_size: variantSize(variant),
        team_store_closes_at: closesAt,
        team_store_delivery: store.delivery_mode,
        team_store_locked_price: true,
      },
    }
  })

  try {
    await addToCartWorkflow(req.scope as never).run({ input: { cart_id: cartId, items: toAdd } })
  } catch (err) {
    const { type, message } = classifyCartAddError(extractWorkflowErrorMessage(err))
    throw new MedusaError(type, message)
  }

  const cartModule = req.scope.resolve(Modules.CART) as any
  await cartModule.updateCarts(cartId, {
    metadata: { ...(cart.metadata ?? {}), team_store_id: store.id, team_store_delivery: store.delivery_mode },
  })

  captureEvent((req as any).auth_context?.actor_id ?? `cart_${cartId}`, "team_store_item_added", {
    team_store_id: store.id,
    cart_id: cartId,
    lines: toAdd.length,
    units: toAdd.reduce((n, l) => n + l.quantity, 0),
  })
  res.json({ ok: true, cart_id: cartId, items_added: toAdd.length })
}
