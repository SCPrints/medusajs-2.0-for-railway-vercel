/**
 * Home delivery for allowances (gift links, new-starter packs): each person
 * gives their own address on their link, and the buyer pays one postage line
 * ("Delivery to N addresses") priced per parcel. Garment lines carry
 * `metadata.home_delivery = true`, the postage line also
 * `home_delivery_postage = true` (both server-set only), and the addresses ride
 * on `cart.metadata.home_delivery` → the order. Pure — admin-safe.
 */

export const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const

export type HomeAddress = {
  name: string
  company: string | null
  address_1: string
  address_2: string | null
  city: string
  province: string
  postal_code: string
  phone: string | null
}

/** One person's parcel, snapshotted onto the cart / order for the job window. */
export type HomeDelivery = {
  name: string
  address: HomeAddress
  items: Array<{ title: string; size: string; quantity: number }>
  postage: number
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "")

/** A clean Australian address, or an error in plain words. */
export function cleanHomeAddress(raw: unknown): { ok: true; address: HomeAddress } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const province = text(r.province, 10).toUpperCase()
  const address: HomeAddress = {
    name: text(r.name, 120),
    company: text(r.company, 120) || null,
    address_1: text(r.address_1, 160),
    address_2: text(r.address_2, 160) || null,
    city: text(r.city, 80),
    province,
    postal_code: text(r.postal_code, 8),
    phone: text(r.phone, 30) || null,
  }
  if (!address.name) return { ok: false, error: "Enter the name for the parcel." }
  if (!address.address_1 || !address.city) return { ok: false, error: "Enter the street address and suburb." }
  if (!(AU_STATES as readonly string[]).includes(province)) return { ok: false, error: "Choose the state." }
  if (!/^\d{4}$/.test(address.postal_code)) return { ok: false, error: "Enter a 4-digit postcode." }
  return { ok: true, address }
}

export const homeAddressLine = (a: HomeAddress): string =>
  [a.company, a.address_1, a.address_2, `${a.city} ${a.province} ${a.postal_code}`].filter(Boolean).join(", ")

type LineLike = { metadata?: Record<string, unknown> | null }

/**
 * Lines that add no weight to the cart's own parcel: names/numbers (printed on
 * the garments already counted) and home-delivery garments whose postage line
 * is in the cart (they ship separately, already paid for).
 */
export function weightlessLine(line: LineLike, cartHasPostage: boolean): boolean {
  const m = line.metadata ?? {}
  return !!m.names_numbers || (cartHasPostage && m.home_delivery === true)
}

export const cartHasHomePostage = (items: LineLike[] | null | undefined): boolean =>
  (items ?? []).some((i) => i?.metadata?.home_delivery_postage === true)

/** Every line goes to people's homes and the postage is paid: the cart's own shipping is $0. */
export function isHomeDeliveryOnlyCart(items: LineLike[] | null | undefined): boolean {
  const list = items ?? []
  return list.length > 0 && cartHasHomePostage(list) && list.every((i) => i?.metadata?.home_delivery === true)
}

/** Grams for one person's parcel: their garments + packaging. */
export const parcelGrams = (garmentGrams: number[], overheadGrams: number): number =>
  garmentGrams.reduce((n, g) => n + (g > 0 ? g : 0), 0) + Math.max(0, overheadGrams)
