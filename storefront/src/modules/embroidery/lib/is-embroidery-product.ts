import { HttpTypes } from "@medusajs/types"

/**
 * Embroidery estimator only renders when a product opts in via metadata flag.
 * Set `embroidery_enabled` to a truthy value (true / "true" / 1 / "1") on the
 * product in Medusa admin.
 */
export const isEmbroideryProduct = (product: HttpTypes.StoreProduct | null | undefined): boolean => {
  const flag = (product?.metadata as Record<string, unknown> | undefined)?.embroidery_enabled
  if (flag === true || flag === 1) return true
  if (typeof flag === "string") return /^(true|1|yes|on)$/i.test(flag.trim())
  return false
}
