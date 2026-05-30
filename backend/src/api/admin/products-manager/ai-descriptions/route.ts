import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { generateProductDescriptions } from "../../../../services/ai-copy/generate"
import {
  AI_DESC_PRODUCT_FIELDS,
  isAiCopyConfigured,
  pickDraftByLength,
  productToContext,
} from "../../../../services/ai-copy/context"
import {
  revalidateStorefrontTags,
  tagsForProduct,
} from "../../../../lib/storefront-revalidate"
import { writeAudit } from "../../../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../lib/audit-entities"
import { captureEvent } from "../../../../lib/posthog"

/**
 * POST /admin/products-manager/ai-descriptions
 *
 * Bulk AI description generation for the "Browse & manage" tab. Unlike
 * the other bulk actions (fast DB writes in `/products-manager/bulk`),
 * this is one *paid LLM call per product*, so:
 *
 *   - The body is capped small (`MAX_BATCH`). The admin UI chunks the
 *     selection and loops, showing live progress — keeping each request
 *     well under any proxy/browser timeout.
 *   - Products in a batch are generated with bounded concurrency
 *     (`CONCURRENCY`) — faster than sequential, gentle on provider rate
 *     limits.
 *   - One generated draft (chosen by `length`) is applied directly to
 *     `product.description`; bulk can't surface 3 drafts per product for
 *     review the way the single-product widget does.
 *
 * Returns per-product `succeeded` / `failed` / `skipped` so the UI can
 * report "wrote 42, skipped 5 (already had copy), failed 1".
 */

const MAX_BATCH = 25
const CONCURRENCY = 5

const bodySchema = z.object({
  product_ids: z.array(z.string().min(1)).min(1).max(MAX_BATCH),
  length: z.enum(["short", "standard", "detailed"]).default("standard"),
  /** When false (default), products that already have a description are skipped. */
  overwrite: z.boolean().default(false),
})

type GenError =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "upstream"
  | "empty"

const ERROR_MESSAGE: Record<GenError, string> = {
  not_configured: "AI provider not configured.",
  timeout: "AI provider timed out.",
  rate_limited: "AI provider rate-limited us — retry shortly.",
  upstream: "AI provider error.",
  empty: "Model returned no usable draft.",
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = bodySchema.parse(req.body ?? {})
  const { product_ids, length, overwrite } = body

  // Fail the whole request once instead of N times when there's no provider.
  if (!isAiCopyConfigured()) {
    return res.status(503).json({
      error: "not_configured",
      detail:
        "Set AI_PROVIDER + the matching API key (OPENAI_API_KEY or ANTHROPIC_API_KEY) on the backend.",
    })
  }

  const container = req.scope as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }

  const actorId =
    (req as any).auth_context?.actor_id ?? (req as any).user?.id ?? null
  const actorEmail =
    (req as any).auth_context?.actor_email ?? (req as any).user?.email ?? null

  const { data: products = [] } = await query.graph({
    entity: "product",
    fields: [...AI_DESC_PRODUCT_FIELDS],
    filters: { id: product_ids },
    pagination: { take: product_ids.length, skip: 0 },
  })
  const byId = new Map<string, any>((products as any[]).map((p) => [p.id, p]))

  const succeeded: Array<{ id: string; handle: string | null }> = []
  const failed: Array<{ id: string; error: string }> = []
  const skipped: string[] = []

  await mapWithConcurrency(product_ids, CONCURRENCY, async (id) => {
    const product = byId.get(id)
    if (!product) {
      failed.push({ id, error: "Product not found." })
      return
    }
    if (!product.title || String(product.title).trim().length === 0) {
      failed.push({ id, error: "Product needs a title first." })
      return
    }
    const currentDesc =
      typeof product.description === "string" ? product.description.trim() : ""
    if (currentDesc.length > 0 && !overwrite) {
      skipped.push(id)
      return
    }

    let result
    try {
      result = await generateProductDescriptions(productToContext(product))
    } catch (err: any) {
      failed.push({ id, error: err?.message ?? "Generation threw." })
      return
    }
    if (result.ok === false) {
      failed.push({
        id,
        error: ERROR_MESSAGE[result.error as GenError] ?? result.error,
      })
      return
    }

    const draft = pickDraftByLength(result.drafts, length)
    if (!draft) {
      failed.push({ id, error: ERROR_MESSAGE.empty })
      return
    }

    try {
      await productModule.updateProducts(id, { description: draft })
      succeeded.push({
        id,
        handle: typeof product.handle === "string" ? product.handle : null,
      })
    } catch (err: any) {
      failed.push({ id, error: err?.message ?? "Update failed." })
    }
  })

  /* ─── audit + PostHog ─── */
  if (succeeded.length > 0) {
    for (const { id } of succeeded) {
      try {
        await writeAudit({
          container,
          entity: AUDIT_ENTITY.PRODUCT,
          entity_id: id,
          action: AUDIT_ACTION.BULK_DESCRIPTION_GENERATED as any,
          actor_id: actorId,
          actor_email: actorEmail,
          details: { length, overwrite, batch_total: product_ids.length },
        })
      } catch {
        /* writeAudit swallows internally; belt-and-braces */
      }
    }
    try {
      captureEvent(actorId ?? "system", "products_manager_ai_descriptions", {
        length,
        overwrite,
        succeeded: succeeded.length,
        failed: failed.length,
        skipped: skipped.length,
        total: product_ids.length,
      })
    } catch {
      /* best-effort */
    }

    /* ─── storefront cache invalidation ─── */
    const tags = new Set<string>(["products"])
    for (const { handle } of succeeded) {
      for (const t of tagsForProduct(handle ?? undefined)) tags.add(t)
    }
    void revalidateStorefrontTags([...tags])
  }

  res.json({
    succeeded: succeeded.map((s) => s.id),
    failed,
    skipped,
    total: product_ids.length,
  })
}
