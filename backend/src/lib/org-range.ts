/**
 * "Our range": a saved design shared with an organisation is a range item.
 * Pure helpers — is a design orderable from the one-screen form, and the cart
 * line a (design, variant, quantity) becomes. The DB side lives in
 * services/org-range.
 */
import { printSizeIdForDesign } from "./group-order-lines"
import type { ScpAddLineInput } from "./scp-add-lines"
import { decoratedSidesFromLineMetadata } from "./scp-dtf-print-pricing"

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)

/** "Colour / Size" variant title → parts (the catalogue's convention). */
export function variantColourSize(title: string | null | undefined): { colour: string | null; size: string } {
  const parts = String(title ?? "").split(" / ")
  return parts.length >= 2
    ? { colour: parts[0].trim(), size: parts.slice(1).join(" / ").trim() }
    : { colour: null, size: parts[0].trim() }
}

export type RangeReadiness = { ready: true; reason: null } | { ready: false; reason: string }

/**
 * Can the server price this design as it is stored? The pricing reads the
 * decorated positions from `prints` (every Studio save since per-print
 * pricing) or `artifacts` (designs that have been ordered). A design with
 * neither has nothing the pricing accepts — it is NOT guessed from the
 * canvas objects; the buyer opens it in the Studio once instead.
 */
export function rangeDesignReadiness(design: {
  prints?: unknown
  artifacts?: unknown
  has_product: boolean
}): RangeReadiness {
  if (!design.has_product) return { ready: false, reason: "This garment is no longer available." }
  const sides = decoratedSidesFromLineMetadata({
    customizerDesign: { prints: design.prints, artifacts: design.artifacts },
  })
  return sides.length > 0
    ? { ready: true, reason: null }
    : { ready: false, reason: "Open it in the Studio once to finish it." }
}

export type RangeRequestItem = { design_id: string; variant_id: string; quantity: number }

/** Same design + size sent twice = one line. Drops zero / junk quantities. */
export function mergeRangeItems(items: RangeRequestItem[]): RangeRequestItem[] {
  const byKey = new Map<string, RangeRequestItem>()
  for (const it of items) {
    const quantity = Math.floor(Number(it.quantity))
    if (!it.design_id || !it.variant_id || !Number.isFinite(quantity) || quantity < 1) continue
    const key = `${it.design_id}:${it.variant_id}`
    const prev = byKey.get(key)
    byKey.set(key, { design_id: it.design_id, variant_id: it.variant_id, quantity: (prev?.quantity ?? 0) + quantity })
  }
  return Array.from(byKey.values())
}

export type RangeLine = ScpAddLineInput & { design_id: string; group_id: string }

/**
 * Cart lines for one design: what a fresh Studio add writes (customizerDesign
 * + product_handle/title), built from the STORED design — never from anything
 * the browser sent. One group id per design, no stale pricing, and on a colour
 * other than the one the design was saved on, no mockup (it shows the old
 * colour; staff render the right one).
 */
export function buildRangeLines(input: {
  design: { id: string; customizer_metadata: unknown; base_variant_id?: string | null }
  product: { handle: string | null; title: string | null; variants: Array<{ id: string; title?: string | null }> }
  items: Array<{ variant_id: string; quantity: number }>
  groupId: string
  organisationId: string
}): RangeLine[] {
  const stored = isObj(input.design.customizer_metadata) ? input.design.customizer_metadata : {}
  const { pricing: _stale, ...rest } = stored
  const colourOf = (variantId: string | null | undefined) =>
    variantColourSize(input.product.variants.find((v) => v.id === variantId)?.title).colour
  const baseColour = colourOf(input.design.base_variant_id ?? (stored.variantId as string | undefined))
  const printSizeId = printSizeIdForDesign(stored)

  return input.items.map((it) => {
    const sameColour = !baseColour || colourOf(it.variant_id) === baseColour
    const customizerDesign: Record<string, unknown> = {
      ...rest,
      variantId: it.variant_id,
      group_id: input.groupId,
      group_size: input.items.length,
      ...(Array.isArray(rest.artifacts) && !sameColour
        ? {
            artifacts: rest.artifacts.map((a: unknown) => {
              if (!isObj(a)) return a
              const { mockupUrl: _otherColour, ...keep } = a
              return keep
            }),
          }
        : {}),
    }
    return {
      design_id: input.design.id,
      group_id: input.groupId,
      variant_id: it.variant_id,
      quantity: it.quantity,
      print_size_id: printSizeId,
      metadata: {
        customizerDesign,
        product_handle: input.product.handle ?? undefined,
        product_title: input.product.title ?? undefined,
        source_design_id: input.design.id,
        organisation_id: input.organisationId,
      },
    }
  })
}
