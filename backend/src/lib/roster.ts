/**
 * Organisation roster ("People"): the garment groups a person has a size for,
 * the compact copy an order carries (`metadata.roster`), packing choices and
 * packing-label rows. Pure — no @medusajs/framework import — so the admin
 * bundle can use it too.
 */

/** The fixed set of size slots on a roster member. One file owns it. */
import { cleanNamesNumbers, type NamesNumbers } from "./names-numbers"

export const ROSTER_GARMENT_GROUPS = [
  { key: "tops", label: "Tops" },
  { key: "bottoms", label: "Bottoms" },
  { key: "headwear", label: "Headwear" },
] as const

export type RosterGarmentGroup = (typeof ROSTER_GARMENT_GROUPS)[number]["key"]
export type RosterSizes = Partial<Record<RosterGarmentGroup, string>>

const GROUP_KEYS = ROSTER_GARMENT_GROUPS.map((g) => g.key) as RosterGarmentGroup[]

export const PACKING_OPTIONS = [
  { key: "bulk", label: "All together" },
  { key: "by_size", label: "Sorted by size" },
  { key: "by_unit", label: "Sorted by unit / team" },
  { key: "individual", label: "Bagged and labelled per person" },
] as const

export type PackingChoice = (typeof PACKING_OPTIONS)[number]["key"]

export const isPackingChoice = (v: unknown): v is PackingChoice =>
  PACKING_OPTIONS.some((o) => o.key === v)

export const packingLabel = (v: unknown): string =>
  PACKING_OPTIONS.find((o) => o.key === v)?.label ?? "All together"

/**
 * Which size slot a garment uses, from its product type / title. null = no
 * per-person size (bags, bottles, stickers).
 * "shorts?(?!\s*sleeve)" so "Short Sleeve Tee" is a top, not shorts.
 */
export function garmentGroupFor(typeOrTitle: string | null | undefined): RosterGarmentGroup | null {
  const s = String(typeOrTitle ?? "").toLowerCase()
  if (!s.trim()) return "tops"
  if (/\b(caps?|hats?|beanies?|visors?|bucket|headwear|snapback|trucker)\b/.test(s)) return "headwear"
  if (/\b(bags?|totes?|backpacks?|bottles?|stickers?|towels?|aprons?|socks?|stubby|mugs?)\b/.test(s)) return null
  if (/\b(shorts?(?!\s*sleeve)|pants?|trousers?|skirts?|leggings?|joggers?|trackpants?|jeans|skorts?)\b/.test(s)) return "bottoms"
  return "tops"
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
  return s || null
}

export function cleanRosterSizes(raw: unknown): RosterSizes {
  const out: RosterSizes = {}
  if (!raw || typeof raw !== "object") return out
  for (const key of GROUP_KEYS) {
    const v = text((raw as Record<string, unknown>)[key], 20)
    if (v) out[key] = v
  }
  return out
}

export type RosterMemberInput = {
  name: string
  unit: string | null
  number: string | null
  sizes: RosterSizes
  notes: string | null
  is_active: boolean
}

/** Clean one incoming roster row. null when it has no name. */
export function cleanRosterMember(raw: unknown): RosterMemberInput | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const name = text(r.name, 120)
  if (!name) return null
  return {
    name,
    unit: text(r.unit, 80),
    number: text(r.number, 12),
    sizes: cleanRosterSizes(r.sizes),
    notes: text(r.notes, 300),
    is_active: r.is_active !== false,
  }
}

export const ROSTER_MAX_MEMBERS = 1000

// ── The copy an order carries ───────────────────────────────────────────────

export type OrderRosterPerson = {
  name: string
  unit: string | null
  number: string | null
  sizes: RosterSizes
}

export type OrderRoster = { people: OrderRosterPerson[]; total: number; truncated: boolean }

/** A cart / order must stay small: at most this many people ride along. */
export const ORDER_ROSTER_MAX_PEOPLE = 400

/**
 * Compact roster for `cart.metadata.roster` / `order.metadata.roster`. Also
 * the cleaner for a value read back from a cart (the browser can write cart
 * metadata, so it is never trusted as-is). null when there is nobody.
 */
export function compactOrderRoster(people: unknown): OrderRoster | null {
  const list = Array.isArray(people)
    ? people
    : Array.isArray((people as { people?: unknown } | null)?.people)
    ? ((people as { people: unknown[] }).people)
    : []
  const cleaned: OrderRosterPerson[] = []
  for (const raw of list) {
    const m = cleanRosterMember(raw)
    if (m) cleaned.push({ name: m.name, unit: m.unit, number: m.number, sizes: m.sizes })
  }
  if (cleaned.length === 0) return null
  return {
    people: cleaned.slice(0, ORDER_ROSTER_MAX_PEOPLE),
    total: cleaned.length,
    truncated: cleaned.length > ORDER_ROSTER_MAX_PEOPLE,
  }
}

export type TeamOrderMeta = {
  organisation_id: string | null
  roster: OrderRoster | null
  packing: PackingChoice | null
  personalisation_requested: boolean
  /** Names / numbers the customer chose and paid for (sizes). null = none / unpriced request. */
  names_numbers: NamesNumbers | null
}

/** The team-order keys of a cart's / order's metadata, cleaned. */
export function teamOrderFromMetadata(meta: unknown): TeamOrderMeta {
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {}
  const roster = compactOrderRoster(m.roster)
  // "Bagged per person" needs people; without them it falls back to bulk.
  const packing = isPackingChoice(m.packing) ? (m.packing === "individual" && !roster ? "bulk" : m.packing) : null
  return {
    organisation_id: typeof m.organisation_id === "string" && m.organisation_id ? m.organisation_id.slice(0, 80) : null,
    roster,
    packing,
    personalisation_requested: m.personalisation_requested === true,
    names_numbers: cleanNamesNumbers(m.names_numbers),
  }
}

// ── Packing labels ──────────────────────────────────────────────────────────

const SIZE_ORDER = ["4xs", "3xs", "xxs", "2xs", "xs", "s", "m", "l", "xl", "xxl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl"]
const sizeRank = (s: string | undefined): number => {
  const k = String(s ?? "").trim().toLowerCase()
  const i = SIZE_ORDER.indexOf(k)
  if (i >= 0) return i
  const n = Number.parseFloat(k)
  return Number.isFinite(n) ? 100 + n : 1000
}

export const PACKING_LABEL_HEADERS = ["Name", "Unit / team", "Number", ...ROSTER_GARMENT_GROUPS.map((g) => g.label)]

/**
 * One row per person for the packing-label CSV, in the order the packer
 * works: by unit then name (by_unit / individual), by top size then name
 * (by_size), or as entered (bulk).
 */
export function packingLabelRows(roster: OrderRoster | null, packing: PackingChoice | null): string[][] {
  const people = [...(roster?.people ?? [])]
  const byName = (a: OrderRosterPerson, b: OrderRosterPerson) => a.name.localeCompare(b.name)
  if (packing === "by_unit" || packing === "individual") {
    people.sort((a, b) => (a.unit ?? "~").localeCompare(b.unit ?? "~") || byName(a, b))
  } else if (packing === "by_size") {
    people.sort((a, b) => sizeRank(a.sizes.tops) - sizeRank(b.sizes.tops) || byName(a, b))
  }
  return people.map((p) => [p.name, p.unit ?? "", p.number ?? "", ...GROUP_KEYS.map((k) => p.sizes[k] ?? "")])
}
