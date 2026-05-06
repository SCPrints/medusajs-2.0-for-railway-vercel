import { HttpTypes } from "@medusajs/types"
import type { EmbroideryDesign } from "./types"

type AnyLineItem = HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem

const METADATA_KEY = "embroideryDesign"

export const getEmbroideryMetadata = (item: AnyLineItem): EmbroideryDesign | null => {
  const metadata = (item as any)?.metadata
  const payload = metadata?.[METADATA_KEY]
  if (!payload || typeof payload !== "object") return null
  return payload as EmbroideryDesign
}

export const buildEmbroideryMetadata = (design: EmbroideryDesign) => ({
  [METADATA_KEY]: design,
})

/** True when the line item carries an embroidery decoration (used for cart badges). */
export const hasEmbroideryDecoration = (item: AnyLineItem): boolean =>
  Boolean(getEmbroideryMetadata(item))
