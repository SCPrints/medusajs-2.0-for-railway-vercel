import { HttpTypes } from "@medusajs/types"

type AnyLineItem = HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem

export const getCustomizerMetadata = (item: AnyLineItem) => {
  const metadata = (item as any)?.metadata
  const payload = metadata?.customizerDesign

  if (!payload || typeof payload !== "object") {
    return null
  }

  const artifacts = Array.isArray((payload as any).artifacts) ? (payload as any).artifacts : []
  const sizes = Array.isArray((payload as any).sizes) ? (payload as any).sizes : []

  return {
    artifacts,
    sizes,
    pricing: (payload as any).pricing ?? null,
    type: String((payload as any).type ?? ""),
  }
}
