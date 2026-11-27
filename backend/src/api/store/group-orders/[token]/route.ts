import type {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { GROUP_ORDER_MODULE } from "../../../../modules/group-order"
import type GroupOrderModuleService from "../../../../modules/group-order/service"
import { BUNDLES_MODULE } from "../../../../modules/bundles"
import type BundlesModuleService from "../../../../modules/bundles/service"
import { loadBundleGroupItems, type BundleGroupConfig } from "../../../../lib/bundle-group-order"
import { sizesForBaseColour } from "../../../../lib/group-order-lines"

/**
 * GET /store/group-orders/:token
 *   → { group_order: {...}, participant_count, participants: [...] }
 *
 * Public — no auth needed — so anyone with the share link sees the group
 * order details and how many people have joined. Names, sizes and notes
 * (`participants`) go only to the signed-in organiser; everyone else gets
 * an empty list. Never the owner_customer_id or internal notes.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const token = req.params.token
  if (!token) return res.status(400).json({ error: "token required" })

  const service = req.scope.resolve<GroupOrderModuleService>(GROUP_ORDER_MODULE)
  const [groupOrder] = await service.listGroupOrders({ public_token: token })
  if (!groupOrder) return res.status(404).json({ error: "not_found" })

  // Optional customer auth runs on this route (middlewares.ts).
  const viewerId = (req as AuthenticatedMedusaRequest).auth_context?.actor_id
  const isOrganiser = !!viewerId && viewerId === groupOrder.owner_customer_id

  const participants = await service.listGroupOrderParticipants(
    { group_order_id: groupOrder.id },
    { order: { created_at: "ASC" }, take: 1000 }
  )

  // ---- Hydrate design preview + product info for the public page.
  // Safe-to-expose subset only: thumbnail, design name, base product
  // title + handle + available variant sizes. Never the customizer
  // metadata's source-file URLs (which can leak customer originals).
  let designPreview: {
    name: string | null
    thumbnail_url: string | null
  } | null = null
  let productPreview: {
    title: string | null
    handle: string | null
    thumbnail: string | null
    available_sizes: string[]
  } | null = null
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    if (groupOrder.base_design_id) {
      const { data: designs } = await query.graph({
        entity: "design",
        fields: ["id", "name", "thumbnail_url"],
        filters: { id: groupOrder.base_design_id },
      })
      const design = (designs as any[])?.[0]
      if (design) {
        designPreview = {
          name: typeof design.name === "string" ? design.name : null,
          thumbnail_url:
            typeof design.thumbnail_url === "string"
              ? design.thumbnail_url
              : null,
        }
      }
    }
    if (groupOrder.base_product_id) {
      const { data: products } = await query.graph({
        entity: "product",
        fields: [
          "id",
          "title",
          "handle",
          "thumbnail",
          "variants.id",
          "variants.title",
          "variants.options.value",
          "variants.options.option.title",
        ],
        filters: { id: groupOrder.base_product_id },
      })
      const product = (products as any[])?.[0]
      if (product) {
        productPreview = {
          title: typeof product.title === "string" ? product.title : null,
          handle: typeof product.handle === "string" ? product.handle : null,
          thumbnail:
            typeof product.thumbnail === "string" ? product.thumbnail : null,
          available_sizes: sizesForBaseColour(product.variants ?? [], groupOrder.base_variant_id),
        }
      }
    }
  } catch {
    // Soft fail — the public page renders fine without previews.
  }

  // Bundle team order: the pack items + sizes available in the owner's
  // chosen colours. Never the artwork URL.
  let bundlePreview: {
    title: string | null
    items: Array<{
      bundle_item_id: string
      label: string
      quantity_per_unit: number
      product_title: string | null
      thumbnail: string | null
      color: string | null
      sizes: string[]
    }>
  } | null = null
  if (groupOrder.bundle_id && groupOrder.bundle_config) {
    const items = await loadBundleGroupItems(
      req.scope,
      groupOrder.bundle_id,
      groupOrder.bundle_config as unknown as BundleGroupConfig
    )
    const bundles = await req.scope
      .resolve<BundlesModuleService>(BUNDLES_MODULE)
      .listBundles({ id: groupOrder.bundle_id }, { take: 1 })
    bundlePreview = {
      title: bundles[0]?.title ?? null,
      items: items.map(({ variantBySize, defaultVariantId, product_handle, ...safe }) => safe),
    }
  }

  res.json({
    group_order: {
      id: groupOrder.id,
      public_token: groupOrder.public_token,
      status: groupOrder.status,
      title: groupOrder.title,
      organisation_name: groupOrder.organisation_name,
      owner_name: groupOrder.owner_name,
      base_product_id: groupOrder.base_product_id,
      base_variant_id: groupOrder.base_variant_id,
      // No base_design_id (the public page only needs design_preview) and no
      // raw customizer_metadata — it can contain MinIO URLs to customer
      // source artwork.
      deadline_at: groupOrder.deadline_at,
      notes: groupOrder.notes,
    },
    design_preview: designPreview,
    product_preview: productPreview,
    bundle_preview: bundlePreview,
    participant_count: participants.length,
    participants: (isOrganiser ? (participants as any[]) : []).map((p) => ({
      id: p.id,
      name: p.name,
      size_label: p.size_label,
      quantity: p.quantity,
      player_number: p.player_number,
      custom_notes: p.custom_notes,
      bundle_sizes: p.bundle_sizes ?? null,
      created_at: p.created_at,
    })),
  })
}
