/**
 * Pure helpers behind the customer's "Order again" and "Ask us to re-order"
 * routes (api/store/customers/me/orders/[id]/…). Which past lines can go
 * straight back in the cart, what metadata the copy carries (what a fresh
 * Studio add writes), and the setup-fee lines a fresh add would create.
 */
import type { MergeApprovedProofsResult } from "./approved-proof-design"

export type OrderLineLike = {
  id: string
  title?: string | null
  product_title?: string | null
  variant_title?: string | null
  product_handle?: string | null
  product_id?: string | null
  variant_id?: string | null
  quantity?: number | null
  unit_price?: number | null
  thumbnail?: string | null
  metadata?: Record<string, any> | null
}

export type NeedsStaff = { line_item_id: string; title: string; reason: string }

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)

export const lineTitle = (l: OrderLineLike): string =>
  [l.product_title || l.title || "Item", l.variant_title].filter(Boolean).join(" — ")

/** Setup / discount lines: rebuilt (fees) or never copied (discounts). */
export const isGeneratedLine = (l: OrderLineLike): boolean => {
  const m = l.metadata ?? {}
  return (
    m.screen_setup_for_order === true ||
    m.supacolour_setup_for_order === true ||
    m.pos_line_kind === "discount"
  )
}

/** Split the chosen lines into Studio lines the cart can take and lines staff must handle. */
export function classifyReorderLines(
  items: OrderLineLike[],
  lineIds?: string[] | null
): { design: OrderLineLike[]; needs_staff: NeedsStaff[] } {
  const wanted = lineIds?.length ? new Set(lineIds) : null
  const design: OrderLineLike[] = []
  const needs_staff: NeedsStaff[] = []
  for (const l of items) {
    if (wanted && !wanted.has(l.id)) continue
    if (isGeneratedLine(l)) continue
    const m = l.metadata ?? {}
    const push = (reason: string) => needs_staff.push({ line_item_id: l.id, title: lineTitle(l), reason })
    if (m.vectorization_for_order === true) push("Artwork vectorising is a one-off service. We'll check whether it's needed again.")
    else if (isObj(m.customizerDesign)) {
      if (!l.variant_id) push("This line has no size or the garment is no longer stocked.")
      else design.push(l)
    } else if (isObj(m.decorationDesign)) push("Embroidery set up outside the Studio. We'll re-quote it.")
    else push("No saved design on this line. We'll set it up for you.")
  }
  return { design, needs_staff }
}

/** Print size the original line was priced at. */
export const linePrintSizeId = (l: OrderLineLike, design: Record<string, any>): string | null => {
  const v =
    design.scpPrintSizeId ??
    design.pricing?.server?.print_size_id ??
    l.metadata?.print_size_id
  const original = typeof v === "string" && v ? v : null
  // Staff may have resized a print in the approved proof: charge the larger
  // of the original size and any approved size, never less than was printed.
  const RANK = ["up_to_a6", "up_to_a4", "up_to_a3", "oversize"]
  const approved = isObj(design.approvedPrintSizeBySide)
    ? Object.values(design.approvedPrintSizeBySide).filter((s): s is string => RANK.includes(s as string))
    : []
  return [original, ...approved]
    .filter((s): s is string => !!s)
    .reduce<string | null>((best, s) => (!best || RANK.indexOf(s) > RANK.indexOf(best) ? s : best), null)
}

/**
 * Cart metadata for the copy: what buildCartBatchItems writes on a fresh
 * Studio add (customizerDesign + product_handle/title), with a new group id,
 * no stale server pricing, the approved proof mockups on proofed sides, and
 * `reorder_of` pointing back at the source line.
 */
export function buildReorderLineMetadata(input: {
  line: OrderLineLike
  design: Record<string, any>
  appliedProofs: MergeApprovedProofsResult<unknown>["appliedProofs"]
  groupId: string
  groupSize: number
  order: { id: string; display_id: number | string | null }
}): Record<string, unknown> {
  const { line, design, appliedProofs } = input
  const proofBySide = new Map(appliedProofs.map((p) => [p.side, p]))
  const { server: _stale, ...pricing } = isObj(design.pricing) ? design.pricing : ({} as Record<string, any>)
  const customizerDesign: Record<string, any> = {
    ...design,
    variantId: line.variant_id,
    group_id: input.groupId,
    group_size: input.groupSize,
    pricing,
    // A proofed side's old print file is the artwork staff corrected — never
    // ship it. Production prints from the approved proof's artwork (as it did
    // for the original job); with none recorded the print file is left blank
    // so staff render it, rather than print the pre-correction version.
    ...(Array.isArray(design.artifacts) && proofBySide.size
      ? {
          artifacts: design.artifacts.map((a: any) => {
            const proof = isObj(a) ? proofBySide.get(a.side) : undefined
            if (!proof) return a
            const { printUrl: _stalePrint, ...rest } = a
            return {
              ...rest,
              ...(proof.url ? { mockupUrl: proof.url } : {}),
              ...(proof.artwork_url ? { printUrl: proof.artwork_url } : {}),
              approvedProofId: proof.proof_id,
            }
          }),
        }
      : {}),
  }
  const m = line.metadata ?? {}
  return {
    customizerDesign,
    product_handle: m.product_handle ?? line.product_handle ?? undefined,
    product_title: m.product_title ?? line.product_title ?? undefined,
    reorder_of: { order_id: input.order.id, display_id: input.order.display_id, line_item_id: line.id },
  }
}

type DescriptorLike = {
  screenBreakdown: Array<{ effectiveColours: number }>
  printSides: string[]
  metadata: Record<string, any>
}

/**
 * Setup-fee lines per design group, counted like the Studio does
 * (syncScreenSetupLine / syncSupacolourSetupLine): screens = colours incl.
 * underbase over the screen sides; Supacolour = one setup per full-colour
 * print side on a Supacolour garment. Taken from the server's pricing of
 * the copied lines, the max over the group (dark-colour underbase can
 * differ by colourway).
 */
export function setupFeesByGroup(
  lines: Array<{ group_id: string; descriptor: DescriptorLike }>
): Array<{ group_id: string; screens: number; supacolour_designs: number }> {
  const byGroup = new Map<string, { screens: number; supacolour_designs: number }>()
  for (const { group_id, descriptor } of lines) {
    const screens = descriptor.screenBreakdown.reduce((s, b) => s + (b.effectiveColours || 0), 0)
    const supa =
      descriptor.metadata?.customizerDesign?.pricing?.server?.full_colour_card === "supacolour"
        ? descriptor.printSides.length
        : 0
    const prev = byGroup.get(group_id) ?? { screens: 0, supacolour_designs: 0 }
    byGroup.set(group_id, {
      screens: Math.max(prev.screens, screens),
      supacolour_designs: Math.max(prev.supacolour_designs, supa),
    })
  }
  return Array.from(byGroup, ([group_id, v]) => ({ group_id, ...v }))
}
