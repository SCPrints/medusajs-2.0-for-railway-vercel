import { HttpTypes } from "@medusajs/types"
import type { DecorationDesign } from "./types"

type AnyLineItem = HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem

const METADATA_KEY = "decorationDesign"

export const getDecorationMetadata = (item: AnyLineItem): DecorationDesign | null => {
  const metadata = (item as any)?.metadata
  const payload = metadata?.[METADATA_KEY]
  if (!payload || typeof payload !== "object") return null
  return payload as DecorationDesign
}

export const buildDecorationMetadata = (design: DecorationDesign) => ({
  [METADATA_KEY]: design,
})

export const hasDecoration = (item: AnyLineItem): boolean =>
  Boolean(getDecorationMetadata(item))
