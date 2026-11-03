/**
 * Plans the nightly tier-price rebuild as a diff against what the price list
 * already holds. Deleting and re-adding all ~50k prices × 8 tiers fired ~800k
 * price events a night and OOM-killed the backend every day (2026-10-29 → 11-03);
 * most nights almost nothing changes, so only the differences are written.
 */
export type ExistingTierPrice = {
  id: string
  price_set_id: string
  amount: number | string | null
  currency_code: string
}
export type WantedTierPrice = { price_set_id: string; amount: number; currency_code: string }

export type TierPricePlan = {
  add: WantedTierPrice[]
  update: Array<WantedTierPrice & { id: string }>
  remove: string[]
}

const cents = (amount: number | string | null) => Math.round(Number(amount) * 100)

export function planTierPriceSync(
  existing: ExistingTierPrice[],
  wanted: WantedTierPrice[]
): TierPricePlan {
  const current = new Map<string, ExistingTierPrice>()
  const remove: string[] = []
  for (const p of existing) {
    // A price set should have one price per list; extras are leftovers.
    if (current.has(p.price_set_id)) remove.push(p.id)
    else current.set(p.price_set_id, p)
  }

  const add: TierPricePlan["add"] = []
  const update: TierPricePlan["update"] = []
  const seen = new Set<string>()
  for (const w of wanted) {
    if (seen.has(w.price_set_id)) continue
    seen.add(w.price_set_id)
    const p = current.get(w.price_set_id)
    if (!p) add.push(w)
    else if (cents(p.amount) !== cents(w.amount) || p.currency_code !== w.currency_code)
      update.push({ ...w, id: p.id })
  }
  for (const [setId, p] of current) if (!seen.has(setId)) remove.push(p.id)

  return { add, update, remove }
}
