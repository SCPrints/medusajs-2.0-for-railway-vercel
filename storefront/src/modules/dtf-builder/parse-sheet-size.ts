import { HttpTypes } from "@medusajs/types"

const SHEET_DIM_RE = /(\d+)\s*cm\s*[×x]\s*(\d+)\s*cm/i

export type SheetDimensionsCm = {
  widthCm: number
  heightCm: number
}

export function parseSheetDimensionsFromVariant(
  variant: HttpTypes.StoreProductVariant | undefined
): SheetDimensionsCm | null {
  if (!variant) {
    return null
  }

  const label = variant.title ?? ""
  const fromTitle = label.match(SHEET_DIM_RE)
  if (fromTitle) {
    return {
      widthCm: Number(fromTitle[1]),
      heightCm: Number(fromTitle[2]),
    }
  }

  const fromSku = variant.sku?.match(/(\d+)x(\d+)/i)
  if (fromSku) {
    return {
      widthCm: Number(fromSku[1]),
      heightCm: Number(fromSku[2]),
    }
  }

  return null
}
