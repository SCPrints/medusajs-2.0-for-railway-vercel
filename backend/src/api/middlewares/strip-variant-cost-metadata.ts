import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

/**
 * Supplier-cost keys the importers stamp on `variant.metadata`. They drive the
 * tier PriceList regen and margin reports (admin-only reads) and must never
 * leave the store API — the storefront used to ship them to every browser
 * (code review 2026-10, finding 4-1). `bulk_pricing` is retail and stays.
 */
export const VARIANT_COST_METADATA_KEYS = [
  "cost_price_ex_gst_minor",
  "raw_prices",
  "cost_adjustment",
] as const

/**
 * Delete the cost keys from every `variants[].metadata` reachable in `body`
 * (list, single, or the bundle route's `{ [handle]: product }` record).
 * Mutates in place — the body is about to be serialised and discarded; the
 * brand-products in-process cache holds the same object, which just means it
 * is stripped once and stays stripped.
 */
export function stripVariantCostMetadata<T>(body: T): T {
  walk(body)
  return body
}

function walk(value: unknown): void {
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) {
    for (const item of value) walk(item)
    return
  }
  const obj = value as Record<string, unknown>
  if (Array.isArray(obj.variants)) {
    for (const v of obj.variants) {
      const meta = (v as { metadata?: unknown } | null)?.metadata
      if (meta && typeof meta === "object") {
        for (const key of VARIANT_COST_METADATA_KEYS) {
          delete (meta as Record<string, unknown>)[key]
        }
      }
    }
  }
  for (const child of Object.values(obj)) walk(child)
}

/** Wraps `res.json` so every product-bearing store response is stripped on the way out. */
export function stripVariantCostMetadataMiddleware(
  _req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): void {
  const json = res.json.bind(res)
  res.json = ((body: unknown) => json(stripVariantCostMetadata(body))) as typeof res.json
  next()
}
