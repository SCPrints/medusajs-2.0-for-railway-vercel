/**
 * One-shot: publish every dnc-* product and attach it to the Default
 * Sales Channel. The earlier DNC importer left ~92 products in `draft`
 * status with no sales-channel link, so they don't show up on the
 * storefront even though everything else (variants, prices, brand) is
 * in place.
 *
 * Strategy:
 *   1. Resolve the Default Sales Channel id once.
 *   2. Walk every dnc-* product with its current `status` + linked
 *      `sales_channels`.
 *   3. For each row, build a patch with only the fields that need to
 *      change (avoid no-op updates that churn updated_at + fire
 *      product.updated events for no reason).
 *   4. Apply via the Product Module (no workflow needed — these are
 *      pure column-level changes, no side-effects we care about).
 *
 * Idempotent. Logs counts + the first 5 patched handles for visibility.
 *
 * Usage:
 *   pnpm --filter backend exec medusa exec src/scripts/_publish-dnc-products.ts
 *
 * Run on production:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/_publish-dnc-products.js
 *
 * Env:
 *   DNC_PUBLISH_LIMIT=N  cap how many products to process (testing)
 *   DNC_PUBLISH_APPLY=1  required — without it the script runs in dry mode
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const DEFAULT_SALES_CHANNEL_NAME = "Default Sales Channel"

const getApplyFlag = (args: string[] | undefined): boolean =>
  (args ?? []).includes("--apply") ||
  process.env.DNC_PUBLISH_APPLY === "1" ||
  process.env.DNC_PUBLISH_APPLY === "true"

type DncRow = {
  id: string
  handle: string
  status: string | null
  sales_channels: Array<{ id: string }> | null
}

export default async function publishDncProducts({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL) as any
  const link = container.resolve(ContainerRegistrationKeys.LINK) as any

  const apply = getApplyFlag(args)
  const limitEnv = Number.parseInt(process.env.DNC_PUBLISH_LIMIT ?? "", 10)
  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? limitEnv : Infinity

  logger.info(`DNC publish — ${apply ? "APPLY" : "DRY RUN"}`)

  const channels = await salesChannelService.listSalesChannels({
    name: DEFAULT_SALES_CHANNEL_NAME,
  })
  if (!channels.length) {
    logger.error(`"${DEFAULT_SALES_CHANNEL_NAME}" not found — aborting.`)
    return
  }
  const channelId = channels[0].id
  logger.info(`Default Sales Channel id: ${channelId}`)

  const { data: rows } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "status", "sales_channels.id"],
    filters: { handle: { $like: "dnc-%" } },
    pagination: { take: 5000 },
  })
  const products = (rows ?? []) as DncRow[]
  logger.info(`Found ${products.length} dnc-* products.`)

  let publishedCount = 0
  let linkedCount = 0
  let unchangedCount = 0
  let processed = 0
  const samplePatched: string[] = []

  for (const p of products) {
    if (processed >= limit) break
    processed++

    const needsPublish = (p.status ?? "").toLowerCase() !== "published"
    const currentChannelIds = new Set(
      (p.sales_channels ?? []).map((c) => c.id)
    )
    const needsChannel = !currentChannelIds.has(channelId)

    if (!needsPublish && !needsChannel) {
      unchangedCount++
      continue
    }

    if (apply) {
      try {
        if (needsPublish) {
          await productModule.updateProducts(p.id, { status: "published" })
          publishedCount++
        }
        if (needsChannel) {
          await link.create({
            [Modules.PRODUCT]: { product_id: p.id },
            [Modules.SALES_CHANNEL]: { sales_channel_id: channelId },
          })
          linkedCount++
        }
        if (samplePatched.length < 5) samplePatched.push(p.handle)
      } catch (err: any) {
        logger.warn(
          `  [${processed}] ${p.handle}: update failed — ${err?.message ?? err}`
        )
      }
    } else {
      if (needsPublish) publishedCount++
      if (needsChannel) linkedCount++
      if (samplePatched.length < 5) {
        const fixes = [
          needsPublish ? "publish" : null,
          needsChannel ? "+channel" : null,
        ]
          .filter(Boolean)
          .join(" ")
        samplePatched.push(`${p.handle} (${fixes})`)
      }
    }
  }

  logger.info("=== Summary ===")
  logger.info(`Processed:        ${processed}`)
  logger.info(`Already OK:       ${unchangedCount}`)
  logger.info(`Would publish:    ${publishedCount}${apply ? " (applied)" : " (dry)"}`)
  logger.info(`Would link:       ${linkedCount}${apply ? " (applied)" : " (dry)"}`)
  if (samplePatched.length) {
    logger.info(`Sample patched:   ${samplePatched.join(", ")}`)
  }
}
