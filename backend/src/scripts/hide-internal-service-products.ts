/**
 * Hide internal service products (setup-fee lines) from the public catalog.
 *
 * These products must stay PUBLISHED (add-to-cart rejects unpublished
 * variants) but should never appear in listings or search. Hiding works on
 * two axes:
 *   1. Sales channels — this script moves them to a dedicated "Internal
 *      Services" channel (created if missing) and dismisses every other
 *      product↔sales_channel link, which removes them from all
 *      publishable-key-scoped store API listings (All Products page, PDP by
 *      handle, sitemap). Add-to-cart by variant id does NOT validate channel
 *      membership, so the customizer's automatic setup lines keep working.
 *      NOTE: Medusa only applies channel scoping on /store/products when the
 *      store has MORE THAN ONE sales channel (single-channel stores skip the
 *      link-filter join entirely — see applyMaybeLinkFilterIfNecessary in
 *      @medusajs/medusa store products middlewares). The Internal Services
 *      channel therefore does double duty: it holds the hidden products AND
 *      flips that optimization off so scoping actually runs.
 *   2. Meilisearch — stamps metadata.internal_service = true, which the
 *      config transformer indexes and every storefront search/listing query
 *      filters out (`internal_service != true`).
 *
 * Also normalises variants to manage_inventory=false / allow_backorder=true
 * (service lines have no stock; inventory confirmation must never block).
 *
 * Idempotent. DRY_RUN=1 previews without writing.
 *
 * Fly: cd /app/.medusa/server && npx medusa exec src/scripts/hide-internal-service-products.js
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const KNOWN_HANDLES = [
  "screen-printing-setup-fee",
  "supacolour-transfer-setup-fee",
]

// The embroidery setup product was created by hand in admin — no known
// handle, so match it by title.
const TITLE_PATTERN = /embroidery.*setup|setup.*embroidery/i

export default async function hideInternalServiceProducts({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const productModule = container.resolve(Modules.PRODUCT)
  const dryRun = process.env.DRY_RUN === "1"

  const { data: all } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "status",
      "metadata",
      "sales_channels.id",
      "sales_channels.name",
      "variants.id",
      "variants.title",
      "variants.manage_inventory",
      "variants.allow_backorder",
      "variants.metadata",
    ],
    filters: {},
    pagination: { take: 5000, skip: 0 },
  })

  const targets = (all as any[]).filter(
    (p) =>
      KNOWN_HANDLES.includes(p.handle) ||
      TITLE_PATTERN.test(p.title ?? "") ||
      p.metadata?.internal_service === true
  )

  if (!targets.length) {
    logger.warn("[hide-internal-service] No matching products found.")
    return
  }

  // Dedicated channel for hidden service products. Its existence also makes
  // the store multi-channel, which is what activates Medusa's channel scoping
  // on /store/products (single-channel stores skip it — see header).
  const INTERNAL_CHANNEL_NAME = "Internal Services"
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  let internalChannel = (
    await salesChannelModule.listSalesChannels({ name: INTERNAL_CHANNEL_NAME })
  )[0]
  if (!internalChannel && !dryRun) {
    internalChannel = await salesChannelModule.createSalesChannels({
      name: INTERNAL_CHANNEL_NAME,
      description:
        "Hidden service products (setup fees). Not linked to any publishable key — never storefront-visible.",
    })
    logger.info(
      `[hide-internal-service] created sales channel "${INTERNAL_CHANNEL_NAME}" (${internalChannel.id})`
    )
  }

  for (const p of targets) {
    const channels = (p.sales_channels ?? []).filter(Boolean)
    logger.info(
      `[hide-internal-service] ${p.handle} (${p.id}) "${p.title}" — status=${p.status}, channels=[${channels.map((c: any) => c.name).join(", ")}], internal_service=${p.metadata?.internal_service === true}`
    )
    if (dryRun) continue

    // Metadata: merge, never replace (Medusa update() replaces the jsonb).
    if (p.metadata?.internal_service !== true) {
      await productModule.updateProducts(p.id, {
        metadata: { ...(p.metadata ?? {}), internal_service: true },
      })
      logger.info(`[hide-internal-service]   stamped metadata.internal_service`)
    }

    for (const v of p.variants ?? []) {
      if (v.manage_inventory !== false || v.allow_backorder !== true) {
        await productModule.updateProductVariants(v.id, {
          manage_inventory: false,
          allow_backorder: true,
        })
        logger.info(
          `[hide-internal-service]   variant ${v.id} → manage_inventory=false, allow_backorder=true`
        )
      }
    }

    for (const c of channels) {
      if (internalChannel && c.id === internalChannel.id) continue
      await link.dismiss({
        [Modules.PRODUCT]: { product_id: p.id },
        [Modules.SALES_CHANNEL]: { sales_channel_id: c.id },
      })
      logger.info(`[hide-internal-service]   removed from channel "${c.name}"`)
    }

    if (
      internalChannel &&
      !channels.some((c: any) => c.id === internalChannel.id)
    ) {
      await link.create({
        [Modules.PRODUCT]: { product_id: p.id },
        [Modules.SALES_CHANNEL]: { sales_channel_id: internalChannel.id },
      })
      logger.info(
        `[hide-internal-service]   linked to "${INTERNAL_CHANNEL_NAME}"`
      )
    }
  }

  if (dryRun) {
    logger.info("[hide-internal-service] DRY_RUN — no writes performed.")
    return
  }

  // Purge the storefront product cache so listings drop them promptly.
  const storefrontUrl = process.env.STOREFRONT_URL?.replace(/\/$/, "")
  const secret = process.env.REVALIDATE_SECRET
  if (storefrontUrl && secret) {
    try {
      const res = await fetch(`${storefrontUrl}/api/revalidate-products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ tags: ["products"] }),
      })
      logger.info(`[hide-internal-service] storefront cache purge → ${res.status}`)
    } catch (err: any) {
      logger.warn(
        `[hide-internal-service] cache purge failed (purge manually): ${err?.message ?? err}`
      )
    }
  } else {
    logger.warn(
      "[hide-internal-service] STOREFRONT_URL/REVALIDATE_SECRET unset — purge storefront cache manually."
    )
  }

  logger.info(
    `[hide-internal-service] Done — ${targets.length} product(s) hidden. Run reindex-meilisearch.ts (or wait for next boot sync) so the internal_service flag lands in the search index.`
  )
}
