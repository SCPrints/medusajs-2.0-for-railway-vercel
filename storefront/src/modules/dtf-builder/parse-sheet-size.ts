import { HttpTypes } from "@medusajs/types"

export type SheetDimensionsCm = {
  widthCm: number
  heightCm: number
}

/**
 * Tries a few real-world label shapes (Admin titles, option values, SKUs).
 * Medusa often leaves variant.title empty or generic; size text lives in `options[].value`.
 */
const DIM_PATTERNS: RegExp[] = [
  // "58cm × 100cm", "58 cm x 100 cm", "58cm*200cm"
  /(\d+)\s*(?:cm)?\s*[×*xX\-–]\s*(\d+)\s*(?:cm)?/i,
  // "58 x 100 cm"
  /(\d+)\s*[×*xX]\s*(\d+)\s*cm\b/i,
  // "58x100" in SKU or option value
  /(\d{2,})\s*x\s*(\d{2,})/i,
]

const mergeVariantText = (variant: HttpTypes.StoreProductVariant): string => {
  const parts: string[] = []
  if (variant.title) {
    parts.push(String(variant.title))
  }
  const opts = (variant as { options?: Array<{ value?: string | null }> }).options
  if (Array.isArray(opts)) {
    for (const o of opts) {
      if (o?.value) {
        parts.push(String(o.value))
      }
    }
  }
  if (variant.sku) {
    parts.push(String(variant.sku))
  }
  return parts.join(" ")
}

const parseFromMetadata = (variant: HttpTypes.StoreProductVariant): SheetDimensionsCm | null => {
  const meta = (variant as { metadata?: Record<string, unknown> | null }).metadata
  if (!meta) {
    return null
  }
  const w = meta.dtf_sheet_width_cm ?? meta.sheet_width_cm
  const h = meta.dtf_sheet_height_cm ?? meta.sheet_height_cm
  if (typeof w === "string" || typeof w === "number") {
    if (typeof h === "string" || typeof h === "number") {
      const widthCm = Number(w)
      const heightCm = Number(h)
      if (Number.isFinite(widthCm) && Number.isFinite(heightCm) && widthCm > 0 && heightCm > 0) {
        return { widthCm, heightCm }
      }
    }
  }
  return null
}

const tryParseDimensions = (text: string): SheetDimensionsCm | null => {
  const t = String(text).trim()
  if (!t) {
    return null
  }
  for (const re of DIM_PATTERNS) {
    const m = t.match(re)
    if (m) {
      const widthCm = Number(m[1])
      const heightCm = Number(m[2])
      if (Number.isFinite(widthCm) && Number.isFinite(heightCm) && widthCm > 0 && heightCm > 0) {
        return { widthCm, heightCm }
      }
    }
  }
  return null
}

export function parseSheetDimensionsFromVariant(
  variant: HttpTypes.StoreProductVariant | undefined
): SheetDimensionsCm | null {
  if (!variant) {
    return null
  }

  const fromMeta = parseFromMetadata(variant)
  if (fromMeta) {
    return fromMeta
  }

  return tryParseDimensions(mergeVariantText(variant))
}
