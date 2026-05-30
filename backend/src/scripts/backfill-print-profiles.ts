/**
 * Assign every product an explicit print profile (`metadata.print_profile`)
 * using the same precedence the storefront customizer used to infer at runtime
 * — beanie → cap → puffer → sleeveless → bag/front+back → long-sleeve →
 * short-sleeve (the default). This is the one-shot that makes the print rules
 * EXPLICIT on every product so the customizer stops guessing.
 *
 * Run AFTER seed-print-profiles.ts (the handles it assigns must exist).
 *
 * Idempotent + safe:
 *   - Never clobbers a manual assignment: products that already have
 *     `metadata.print_profile` set are skipped unless BACKFILL_FORCE=1.
 *   - Never clobbers a full-custom product (`print_profile === "custom"`).
 *   - Only operates on published products.
 *
 * Flags:
 *   DRY_RUN=1        — log the per-profile distribution, write nothing.
 *   BACKFILL_FORCE=1 — re-classify and overwrite even products that already
 *                      have a (non-custom) profile assigned.
 *
 * Local:  cd backend && DRY_RUN=1 npx medusa exec src/scripts/backfill-print-profiles.ts
 * Fly.io: cd /app/.medusa/server && npx medusa exec src/scripts/backfill-print-profiles.js
 */

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import {
  CUSTOM_PROFILE_HANDLE,
  inferPrintProfileHandle,
} from "../lib/print-profile"

const PAGE_SIZE = 200

type ProductRow = {
  id: string
  title: string | null
  handle: string | null
  subtitle: string | null
  description: string | null
  status: string | null
  type: { value: string | null } | null
  tags: Array<{ value: string }> | null
  metadata: Record<string, any> | null
}

export default async function backfillPrintProfiles({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any

  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"
  const force =
    process.env.BACKFILL_FORCE === "1" || process.env.BACKFILL_FORCE === "true"

  if (dryRun) logger.info("DRY_RUN=1 — no writes will be performed")
  if (force)
    logger.info("BACKFILL_FORCE=1 — re-classifying products that already have a profile")

  let offset = 0
  let scanned = 0
  let assigned = 0
  let skippedExisting = 0
  let skippedCustom = 0
  let failures = 0
  const distribution = new Map<string, number>()

  while (true) {
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "subtitle",
        "description",
        "status",
        "type.value",
        "tags.value",
        "metadata",
      ],
      pagination: { take: PAGE_SIZE, skip: offset },
    })
    const rows = (data ?? []) as ProductRow[]
    if (!rows.length) break
    offset += rows.length

    for (const product of rows) {
      scanned++
      if ((product.status ?? "") !== "published") continue

      const meta = (product.metadata ?? {}) as Record<string, unknown>
      const current =
        typeof meta.print_profile === "string" ? (meta.print_profile as string) : null

      // Never touch a product the customer/staff explicitly fully-customised.
      if (current === CUSTOM_PROFILE_HANDLE) {
        skippedCustom++
        continue
      }
      // Respect an existing assignment unless forced.
      if (current && !force) {
        skippedExisting++
        continue
      }

      const handle = inferPrintProfileHandle({
        title: product.title,
        handle: product.handle,
        subtitle: product.subtitle,
        description: product.description,
        metadata: product.metadata,
        tags: product.tags,
      })
      distribution.set(handle, (distribution.get(handle) ?? 0) + 1)

      if (current === handle) {
        // already correct
        continue
      }

      if (dryRun) {
        assigned++
        continue
      }

      try {
        await productModule.updateProducts(product.id, {
          metadata: { ...meta, print_profile: handle },
        })
        assigned++
      } catch (err: any) {
        failures++
        logger.warn(
          `  ! failed to assign ${product.handle ?? product.id}: ${err?.message ?? err}`
        )
      }
    }
  }

  logger.info("Print-profile distribution (this run):")
  for (const [handle, n] of [...distribution.entries()].sort((a, b) => b[1] - a[1])) {
    logger.info(`  ${handle}: ${n}`)
  }
  logger.info(
    `Backfill complete — scanned ${scanned}, assigned ${assigned}, skipped ${skippedExisting} (already set), skipped ${skippedCustom} (custom), failures ${failures}.`
  )
}
