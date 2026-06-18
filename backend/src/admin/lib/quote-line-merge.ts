/**
 * Reconcile a polled server snapshot of quote line items into the local admin
 * draft while a Studio popup is open. Pure + generic so it can be unit-tested
 * without the React page.
 *
 * Rules:
 *  - Server rows are authoritative for design/linkage fields (customizerDesign,
 *    thumbnail, group_id, product/variant linkage, print_size_id).
 *  - For a row that already exists locally (same id), the operator's in-progress
 *    editable fields (title, quantity, unit_price, description) are PRESERVED —
 *    so a design landing doesn't clobber an unsaved edit.
 *  - A brand-new server row (id not seen locally) is adopted verbatim.
 *  - A re-edited design group mints FRESH line ids server-side, so the old local
 *    rows (stale ids, same group_id) are DROPPED rather than re-appended — which
 *    would otherwise duplicate the design.
 *  - Genuinely local-only rows (unsaved product/custom lines, group_id null) are
 *    kept.
 */
export type MergeableLine = {
  id: string
  title: string
  quantity: string
  unit_price: string
  description: string
  group_id?: string | null
}

export function mergeServerRows<T extends MergeableLine>(
  prev: T[],
  serverRows: T[]
): T[] {
  const prevById = new Map(prev.map((r) => [r.id, r]))
  const serverIds = new Set(serverRows.map((r) => r.id))
  const serverGroups = new Set(
    serverRows.map((r) => r.group_id).filter(Boolean) as string[]
  )

  const merged: T[] = serverRows.map((s) => {
    const local = prevById.get(s.id)
    if (!local) return s
    return {
      ...s,
      title: local.title,
      quantity: local.quantity,
      unit_price: local.unit_price,
      description: local.description,
    }
  })

  for (const r of prev) {
    if (serverIds.has(r.id)) continue
    if (r.group_id && serverGroups.has(r.group_id)) continue
    merged.push(r)
  }
  return merged
}
