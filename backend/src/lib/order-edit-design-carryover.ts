/**
 * Pure logic for carrying a customizer design across an order-edit garment
 * swap (staff remove the old line and add a replacement variant in one edit).
 *
 * Medusa's order edit creates the replacement as a plain catalog line with no
 * `metadata.customizerDesign`, which breaks the approval PDF, the customizer
 * downloads widget, the customer approval page, and the print files for that
 * line. The subscriber (order-edit-carry-customizer-design.ts) detects the
 * swap on `order-edit.confirmed` and copies the design + re-keys the
 * line-scoped proof metadata using these helpers.
 *
 * Kept pure (no container, no DB) so the pairing and re-keying rules are
 * unit-testable.
 */

export type CarryoverItem = {
  item_id: string
  has_design: boolean
}

export type CarryoverPlan = {
  from: string
  to: string
}

/**
 * Decide whether the version transition is an unambiguous garment swap.
 *
 * removed = in prev version but not current, WITH a design
 * added   = in current version but not prev, WITHOUT a design
 *
 * Only the single-removed + single-added case is handled — with multiple
 * candidates we can't know which design belongs to which new line, so we
 * return null and let staff sort it manually (the subscriber logs it).
 */
export function planDesignCarryover(
  prevItems: CarryoverItem[],
  currItems: CarryoverItem[]
): CarryoverPlan | null {
  const prevIds = new Set(prevItems.map((i) => i.item_id))
  const currIds = new Set(currItems.map((i) => i.item_id))

  const removedWithDesign = prevItems.filter(
    (i) => !currIds.has(i.item_id) && i.has_design
  )
  const addedWithoutDesign = currItems.filter(
    (i) => !prevIds.has(i.item_id) && !i.has_design
  )

  if (removedWithDesign.length !== 1 || addedWithoutDesign.length !== 1) {
    return null
  }
  return { from: removedWithDesign[0].item_id, to: addedWithoutDesign[0].item_id }
}

type RevisedProofRow = { line_item_id?: string } & Record<string, unknown>

/**
 * Re-key the line-scoped proof metadata on `order.metadata` from the removed
 * line to its replacement:
 *   - revised_proofs[]              — `line_item_id` field per row
 *   - mockup_print_dimensions       — keys `${lineItemId}:${side}`
 *   - mockup_proof_notes            — keys `${lineItemId}`
 *
 * Returns only the keys that changed (empty object = nothing to write), so
 * the caller can jsonb_set each key without touching the rest of metadata.
 */
export function rekeyLineScopedMetadata(
  meta: Record<string, unknown> | null | undefined,
  from: string,
  to: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!meta) return out

  const proofs = meta.revised_proofs
  if (Array.isArray(proofs) && proofs.some((p: RevisedProofRow) => p?.line_item_id === from)) {
    out.revised_proofs = proofs.map((p: RevisedProofRow) =>
      p?.line_item_id === from ? { ...p, line_item_id: to } : p
    )
  }

  for (const key of ["mockup_print_dimensions", "mockup_proof_notes"]) {
    const raw = meta[key]
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const obj = raw as Record<string, unknown>
    const hit = Object.keys(obj).some(
      (k) => k === from || k.startsWith(`${from}:`)
    )
    if (!hit) continue
    const next: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === from) next[to] = v
      else if (k.startsWith(`${from}:`)) next[`${to}${k.slice(from.length)}`] = v
      else next[k] = v
    }
    out[key] = next
  }

  return out
}
