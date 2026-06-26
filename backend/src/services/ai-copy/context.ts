import {
  AI_PROVIDER,
  ANTHROPIC_API_KEY,
  OPENAI_API_KEY,
} from "../../lib/constants"

import type { ProductContext } from "./prompt"

/**
 * Shared product → ProductContext plumbing for AI description generation.
 *
 * Lives apart from the HTTP routes so the single-product generator
 * (`/admin/products/:id/generate-description`) and the bulk generator
 * (`/admin/products-manager/ai-descriptions`) build identical context
 * from the same graph shape — no drift in what we send the model.
 */

/** Metadata keys safe to feed an LLM — never pricing / SKU / stock. */
export const SAFE_METADATA_KEYS = [
  "fabric_blend",
  "fabric",
  "gsm",
  "fit",
  "neckline",
  "season",
  "country_of_origin",
  "care_instructions",
  "decoration_methods",
] as const

/** Graph fields required to build a ProductContext. */
export const AI_DESC_PRODUCT_FIELDS = [
  "id",
  "title",
  "handle",
  "description",
  "weight",
  "metadata",
  "type.value",
  "tags.value",
  "variants.title",
  "brand.name",
  "brand.handle",
] as const

/** Length keys the bulk generator exposes; match the draft labels the prompt emits. */
export type DescriptionLength = "short" | "standard" | "detailed"

/**
 * True when the configured AI provider has its API key set. Lets a caller
 * 503 the whole request once instead of failing every product with
 * `not_configured`.
 */
export function isAiCopyConfigured(): boolean {
  if (AI_PROVIDER === "openai") return Boolean(OPENAI_API_KEY)
  if (AI_PROVIDER === "anthropic") return Boolean(ANTHROPIC_API_KEY)
  return false
}

/**
 * Builds the LLM context from a graph product row. `hint` is an optional
 * operator bias (e.g. "winter casual") folded into safe metadata.
 */
export function productToContext(
  product: any,
  hint?: string | null
): ProductContext {
  const rawMeta = (product?.metadata as Record<string, unknown> | undefined) ?? {}
  const safeMeta: Record<string, string | number | boolean | null> = {}
  for (const k of SAFE_METADATA_KEYS) {
    const v = rawMeta[k]
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      safeMeta[k] = v
    }
  }
  if (hint && hint.trim()) safeMeta.hint = hint.trim()

  const brand = Array.isArray(product?.brand) ? product.brand[0] : product?.brand

  return {
    title: String(product?.title ?? ""),
    handle: typeof product?.handle === "string" ? product.handle : null,
    brand_name: brand?.name ?? null,
    brand_handle: brand?.handle ?? null,
    description_current:
      typeof product?.description === "string" ? product.description : null,
    type_value:
      typeof product?.type?.value === "string" ? product.type.value : null,
    weight_grams:
      typeof product?.weight === "number" && product.weight > 0
        ? product.weight
        : null,
    tags: Array.isArray(product?.tags)
      ? product.tags
          .map((t: any) => (typeof t?.value === "string" ? t.value : null))
          .filter((v: any): v is string => typeof v === "string")
      : null,
    variant_titles: Array.isArray(product?.variants)
      ? product.variants
          .map((v: any) => (typeof v?.title === "string" ? v.title : null))
          .filter((v: any): v is string => typeof v === "string")
      : null,
    safe_metadata: safeMeta,
  }
}

/**
 * Picks one draft body for the requested length. Drafts are labelled
 * Short / Standard / Detailed by the prompt; we match on label substring
 * and fall back to the middle draft (then the first) if the label is
 * absent so the bulk apply never ends up empty.
 */
export function pickDraftByLength(
  drafts: Array<{ label: string; body: string }>,
  length: DescriptionLength
): string | null {
  if (!Array.isArray(drafts) || drafts.length === 0) return null
  const want = length
  const match = drafts.find((d) =>
    (d.label ?? "").toLowerCase().includes(want)
  )
  if (match?.body?.trim()) return match.body.trim()
  const mid = drafts[Math.floor(drafts.length / 2)]
  if (mid?.body?.trim()) return mid.body.trim()
  return drafts[0]?.body?.trim() || null
}
