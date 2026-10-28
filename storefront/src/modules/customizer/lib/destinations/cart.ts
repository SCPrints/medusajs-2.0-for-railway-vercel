/**
 * Shop destination: what "Add to cart" does with a finished Studio design.
 * The Studio core builds the design (sides, renders, metadataBase); this file
 * turns it into cart lines, sends them, and swaps out the lines being edited.
 * Quote / POS / proof keep their own branches in templates/index.tsx for now.
 */
import { addScpLineItemsBatchSafe, addScpLineItemToCartSafe, deleteLineItem } from "@lib/data/cart"

import { sanitizeCustomizerDesignForCart } from "../sanitize-cart-metadata"
import type { ScpPrintSizeId } from "../scp-dtf-print-pricing"
import type { CustomizerMetadata, GarmentSide } from "../types"

export type CartCell = {
  variant: { id: string }
  quantity: number
  /** Bulk-grid colour mockup for the front (older cells). */
  mockupDataUrl?: string | null
  /** Bulk-grid colour mockups per side; sides without one keep the base mockup. */
  mockupDataUrlsBySide?: Partial<Record<GarmentSide, string>>
}

export type CartBatchItem = {
  variantId: string
  quantity: number
  printSizeId: ScpPrintSizeId
  metadata: Record<string, unknown>
}

/** One cart line per (variant × quantity) cell, carrying the full design. */
export function buildCartBatchItems(input: {
  cells: CartCell[]
  metadataBase: Omit<CustomizerMetadata, "variantId">
  /** data: URL → hosted R2 URL for every upload, so lines never carry raw images. */
  hostedByDataUrl: Record<string, string>
  printSizeId: ScpPrintSizeId
  /** `?design=<id>` the customer started from (saved-design conversion reporting). */
  designId?: string | null
  product: { handle?: string | null; title?: string | null }
}): CartBatchItem[] {
  return input.cells.map((cell) => {
    // Bulk-grid cells carry colour-specific mockups so the cart shows the
    // colour actually ordered, not the design-reference colour.
    const overrides =
      cell.mockupDataUrlsBySide ?? (cell.mockupDataUrl ? { front: cell.mockupDataUrl } : null)
    const artifacts =
      overrides && Object.keys(overrides).length > 0
        ? (input.metadataBase.artifacts ?? []).map((artifact) => {
            const override = overrides[artifact.side as GarmentSide]
            return override ? { ...artifact, mockupUrl: override } : artifact
          })
        : input.metadataBase.artifacts
    // Keep sideLayouts: ?reorder= replays them onto the canvas (emptying them
    // once broke re-order). The sanitizer already strips big data: images.
    const design: CustomizerMetadata = { ...input.metadataBase, variantId: cell.variant.id, artifacts }
    // Identity entries keep the per-cell mockup data URLs through the sanitizer.
    const keep: Record<string, string> = { ...input.hostedByDataUrl }
    for (const value of Object.values(overrides ?? {})) {
      if (typeof value === "string" && value) keep[value] = value
    }
    return {
      variantId: cell.variant.id,
      quantity: cell.quantity,
      printSizeId: input.printSizeId,
      metadata: {
        customizerDesign: sanitizeCustomizerDesignForCart(design, keep),
        // Saved-design attribution: `source_design_id` (current) + `designId` (legacy reports).
        ...(input.designId ? { source_design_id: input.designId, designId: input.designId } : {}),
        // Fallback display fields if the cart loses the variant → product join.
        product_handle: input.product.handle ?? undefined,
        product_title: input.product.title ?? undefined,
      },
    }
  })
}

/**
 * Add the lines: one line goes through the single-line endpoint (unchanged
 * path for normal adds); a bulk grid goes in ONE batch request so the backend
 * re-prices the cart once, not once per cell. Throws with the server message.
 */
export async function addCartBatch(items: CartBatchItem[], countryCode: string): Promise<void> {
  if (items.length === 0) return
  if (items.length === 1) {
    const [only] = items
    const result = await addScpLineItemToCartSafe({ ...only, countryCode })
    if (!result.ok) throw new Error(result.error)
    return
  }
  const result = await addScpLineItemsBatchSafe({ countryCode, items })
  if (!result.ok) throw new Error(result.error)
}

/**
 * Edit-from-cart: after the new lines are in, delete the ones being replaced
 * (the edited group, the edited line's group siblings, or just the edited
 * line). Returns the ids that couldn't be deleted.
 */
export async function removeReplacedLines(input: {
  editLineItemId?: string | null
  editGroupId?: string | null
  editGroupLineIds: string[]
  siblingLineIds: string[]
}): Promise<{ attempted: number; failed: string[] }> {
  const ids =
    input.editGroupId && input.editGroupLineIds.length > 0
      ? input.editGroupLineIds
      : input.siblingLineIds.length > 0
        ? input.siblingLineIds
        : input.editLineItemId
          ? [input.editLineItemId]
          : []
  const failed: string[] = []
  for (const id of ids) {
    try {
      await deleteLineItem(id)
    } catch {
      failed.push(id)
    }
  }
  return { attempted: ids.length, failed }
}
