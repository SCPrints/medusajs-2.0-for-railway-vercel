/**
 * Line item metadata must stay small enough for Medusa / DB limits. Fabric serializes
 * uploaded images as huge data URLs inside `sideLayouts`; strip those before add-to-cart.
 */
const MAX_INLINE_STRING = 240

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }
  if (typeof value === "string") {
    if (value.startsWith("data:") && value.length > MAX_INLINE_STRING) {
      return "[omitted-image-data]"
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue)
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeValue(v)
    }
    return out
  }
  return value
}

export function sanitizeCustomizerDesignForCart<T>(design: T): T {
  return sanitizeValue(design) as T
}
