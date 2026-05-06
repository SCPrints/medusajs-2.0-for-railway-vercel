/**
 * Phase 1 ergonomics shim. Embroidery metadata is now stored under the unified
 * `decorationDesign` key (see `@modules/decoration/lib/metadata`). Helpers below
 * project the embroidery slice out of the unified payload so existing callers
 * keep compiling.
 */
import { HttpTypes } from "@medusajs/types"
import {
  buildDecorationMetadata,
  getDecorationMetadata,
} from "@modules/decoration/lib/metadata"
import type { DecorationDesign } from "@modules/decoration/lib/types"
import type { EmbroideryDesign } from "./types"

type AnyLineItem = HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem

export const getEmbroideryMetadata = (item: AnyLineItem): EmbroideryDesign | null => {
  const decoration = getDecorationMetadata(item)
  if (!decoration || decoration.method !== "embroidery") return null
  return (decoration as unknown as { embroideryDesign?: EmbroideryDesign }).embroideryDesign ?? null
}

export const buildEmbroideryMetadata = (
  design: EmbroideryDesign,
  decoration: DecorationDesign
) => ({
  ...buildDecorationMetadata({
    ...decoration,
    // Stash the raw embroidery payload alongside the unified breakdown.
    ...({ embroideryDesign: design } as Record<string, unknown>),
  } as DecorationDesign),
})

export const hasEmbroideryDecoration = (item: AnyLineItem): boolean =>
  Boolean(getEmbroideryMetadata(item))
