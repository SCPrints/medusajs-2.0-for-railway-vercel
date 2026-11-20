/**
 * Quote lines are one per size (each size is its own variant on the order),
 * but staff and customers must see one garment: one card, one design, one
 * mockup. Pure and admin-safe (no framework imports): used by the admin quote
 * editor and the customer mockup captions.
 */

// Trailing size on a line title: "… — Faded Brown / M" (product picker) or
// "… — Size M" (scripted quotes).
const SIZE_SUFFIX = /\s*(?:\/|[—–-]\s*size\b)\s*([^/—–]+)$/i

/** "Tee — Navy / M" → "Tee — Navy"; a title with no size comes back unchanged. */
export const titleWithoutSize = (title: string): string => title.replace(SIZE_SUFFIX, "").trim()

/** "Tee — Navy / M" → "M"; null when the title carries no size. */
export const sizeFromTitle = (title: string): string | null => title.match(SIZE_SUFFIX)?.[1]?.trim() ?? null

export type GroupableLine = {
  id: string
  title: string
  description?: string | null
  product_id?: string | null
  group_id?: string | null
}

/**
 * Which card a line belongs to: its Studio design group, else the same
 * garment + colour + description (the other sizes of it), else itself.
 * ponytail: two different undesigned decorations on one garment + colour need different descriptions to stay apart.
 */
export function garmentKey(l: GroupableLine): string {
  if (l.group_id) return l.group_id
  if (!l.product_id) return l.id
  return `p:${l.product_id}|${titleWithoutSize(l.title)}|${(l.description ?? "").trim()}`
}

/** Group lines by `garmentKey`, keeping the quote's order. */
export function groupLines<T extends GroupableLine>(lines: T[]): T[][] {
  const byKey = new Map<string, T[]>()
  const out: T[][] = []
  for (const l of lines) {
    const k = garmentKey(l)
    const existing = byKey.get(k)
    if (existing) existing.push(l)
    else {
      const g = [l]
      byKey.set(k, g)
      out.push(g)
    }
  }
  return out
}
