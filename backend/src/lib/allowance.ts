/**
 * Uniform allowance: the organisation says "each person on the roster gets
 * these items" and every person picks their own sizes on a private link.
 * Pure rules only (entitlement, pick validation, turning picks into the range
 * add-to-cart request) — the DB side is in api/store/allowance and
 * api/store/customers/me/organisations/[id]/allowances.
 */
export const ALLOWANCE_MAX_ITEMS = 20
export const ALLOWANCE_MAX_PER_PERSON = 20

export type AllowanceItem = { design_id: string; per_person: number }
export type AllowancePick = { design_id: string; size: string; quantity: number }
/** One cart line's worth of picks, with who chose it. */
export type AllowanceRangeItem = {
  design_id: string
  variant_id: string
  quantity: number
  people: Array<{ name: string; quantity: number }>
}

/** Drop junk, merge a design listed twice, cap sizes. */
export function cleanAllowanceItems(raw: unknown): AllowanceItem[] {
  const byDesign = new Map<string, number>()
  for (const i of Array.isArray(raw) ? raw : []) {
    const id = typeof i?.design_id === "string" ? i.design_id.trim().slice(0, 80) : ""
    const n = Math.floor(Number(i?.per_person))
    if (!id || !Number.isFinite(n) || n < 1) continue
    byDesign.set(id, Math.min(ALLOWANCE_MAX_PER_PERSON, (byDesign.get(id) ?? 0) + n))
  }
  return Array.from(byDesign, ([design_id, per_person]) => ({ design_id, per_person })).slice(0, ALLOWANCE_MAX_ITEMS)
}

/** Closed by staff, by the date, or because it is already in a cart. */
export function allowanceClosed(
  a: { status?: string | null; closes_at?: Date | string | null; cart_id?: string | null },
  now: Date = new Date()
): boolean {
  if (a.status === "closed" || a.cart_id) return true
  if (!a.closes_at) return false
  const t = new Date(a.closes_at).getTime()
  return Number.isFinite(t) && t < now.getTime()
}

/** The size (as the garment spells it) that matches what the roster holds, or null. */
export function matchSize(wanted: string | null | undefined, sizes: string[]): string | null {
  const w = String(wanted ?? "").trim().toLowerCase()
  if (!w) return null
  return sizes.find((s) => s.trim().toLowerCase() === w) ?? null
}

/**
 * Check a person's picks against what they are entitled to. Never more than
 * `per_person` of an item, only sizes the garment has, only items on the
 * allowance. Fewer is fine (they may not want everything). Same size twice
 * merges.
 */
export function validatePicks(
  items: AllowanceItem[],
  picks: AllowancePick[],
  sizesByDesign: Record<string, string[]>
): { ok: true; picks: AllowancePick[] } | { ok: false; error: string } {
  const merged = new Map<string, AllowancePick>()
  const perDesign = new Map<string, number>()
  for (const p of picks) {
    const item = items.find((i) => i.design_id === p.design_id)
    if (!item) return { ok: false, error: "That item isn't part of this allowance." }
    const quantity = Math.floor(Number(p.quantity))
    if (!Number.isFinite(quantity) || quantity < 0) return { ok: false, error: "Quantities must be whole numbers." }
    if (quantity === 0) continue
    const size = (sizesByDesign[p.design_id] ?? []).find((s) => s === p.size)
    if (!size) return { ok: false, error: "That size isn't available for this item." }
    const total = (perDesign.get(p.design_id) ?? 0) + quantity
    if (total > item.per_person) return { ok: false, error: `You can choose up to ${item.per_person} of each item.` }
    perDesign.set(p.design_id, total)
    const key = `${p.design_id}:${size}`
    const prev = merged.get(key)
    merged.set(key, { design_id: p.design_id, size, quantity: (prev?.quantity ?? 0) + quantity })
  }
  return { ok: true, picks: Array.from(merged.values()) }
}

/**
 * Everyone's picks → the `{ design_id, variant_id, quantity }` rows the range
 * add-to-cart takes. Picks whose size no longer maps to a variant come back in
 * `unmatched` so the owner is told, never dropped quietly.
 */
export function picksToRangeItems(
  people: Array<{ name: string; picks: AllowancePick[] }>,
  variantFor: (designId: string, size: string) => string | null
): { items: AllowanceRangeItem[]; unmatched: string[] } {
  const totals = new Map<string, AllowanceRangeItem>()
  const unmatched: string[] = []
  for (const person of people) {
    for (const p of person.picks) {
      const variant_id = variantFor(p.design_id, p.size)
      if (!variant_id) {
        unmatched.push(person.name)
        continue
      }
      const key = `${p.design_id}:${variant_id}`
      const row = totals.get(key) ?? { design_id: p.design_id, variant_id, quantity: 0, people: [] }
      row.quantity += p.quantity
      // Who the line is for: names (e.g. on fleeces) must reach production.
      const same = row.people.find((x) => x.name === person.name)
      if (same) same.quantity += p.quantity
      else row.people.push({ name: person.name, quantity: p.quantity })
      totals.set(key, row)
    }
  }
  for (const row of totals.values()) row.people.sort((a, b) => a.name.localeCompare(b.name))
  return { items: Array.from(totals.values()), unmatched: Array.from(new Set(unmatched)) }
}
