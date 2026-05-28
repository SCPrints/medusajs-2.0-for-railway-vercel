import type { CartAddressDTO, StockLocationAddressDTO } from "@medusajs/framework/types"
import type { AusPostAddress } from "./types"

/** AU state name → 3-letter code AusPost wants. */
const AU_STATE_ALIASES: Record<string, string> = {
  // Already-correct codes
  nsw: "NSW", vic: "VIC", qld: "QLD", wa: "WA",
  sa: "SA", tas: "TAS", nt: "NT", act: "ACT",
  // Full names
  "new south wales": "NSW",
  "victoria": "VIC",
  "queensland": "QLD",
  "western australia": "WA",
  "south australia": "SA",
  "tasmania": "TAS",
  "northern territory": "NT",
  "australian capital territory": "ACT",
  // Common shorthand
  "n.s.w.": "NSW", "vic.": "VIC", "qld.": "QLD", "w.a.": "WA",
  "s.a.": "SA", "tas.": "TAS", "n.t.": "NT", "a.c.t.": "ACT",
}

/** Normalises a Medusa province string to a 3-letter AusPost state code. */
export function normalizeAustralianState(raw: string | null | undefined): string {
  const k = (raw || "").trim().toLowerCase()
  if (!k) return ""
  return AU_STATE_ALIASES[k] || raw?.trim().toUpperCase() || ""
}

/** Medusa often stores country lowercase (`au`); AusPost expects uppercase. */
export function normalizeCountryCode(raw: string | null | undefined): string {
  return (raw || "").trim().toUpperCase()
}

/**
 * Converts a Medusa cart shipping address into an AusPost address.
 * Throws if the bare minimum (postcode, country, suburb) isn't present —
 * AusPost rate quotes 4xx silently on missing fields.
 */
export function buildAusPostAddressFromCart(
  to: Pick<
    CartAddressDTO,
    "first_name" | "last_name" | "company" | "address_1" | "address_2" |
    "city" | "province" | "postal_code" | "country_code" | "phone"
  > & { email?: string | null }
): AusPostAddress {
  const country = normalizeCountryCode(to.country_code)
  const postcode = (to.postal_code || "").trim()
  const suburb = (to.city || "").trim()

  if (!country) {
    throw new Error("AusPost destination missing country_code")
  }
  if (!postcode) {
    throw new Error("AusPost destination missing postal_code")
  }
  if (!suburb) {
    throw new Error("AusPost destination missing city (suburb)")
  }

  const lines = [to.address_1, to.address_2].filter((l): l is string => !!l && l.trim().length > 0)
  const fullName = [to.first_name, to.last_name]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(" ")
    .trim()

  return {
    name: fullName || null,
    business_name: to.company?.trim() || null,
    lines: lines.length ? lines : [""],
    suburb,
    state: country === "AU" ? normalizeAustralianState(to.province) : (to.province || "").trim(),
    postcode,
    // The v1 API doesn't expect `country` on domestic shipments — only send
    // it for international destinations.
    ...(country === "AU" ? {} : { country }),
    phone: to.phone?.trim() || null,
    email: to.email?.trim() || null,
  }
}

/**
 * Builds the AusPost ship-from address from a Medusa stock location address,
 * with the AUSPOST_WAREHOUSE_* env vars as fallbacks for any missing field.
 */
export function buildAusPostShipFromAddress(input: {
  name?: string
  address?: Omit<StockLocationAddressDTO, "created_at" | "updated_at" | "deleted_at">
  fallbacks: {
    address_1?: string
    city?: string
    state?: string
    postcode?: string
    country?: string
    phone?: string
    name?: string
  }
}): AusPostAddress {
  const a = input.address
  const f = input.fallbacks

  const country = normalizeCountryCode(a?.country_code || f.country)
  const postcode = (a?.postal_code || f.postcode || "").trim()
  const suburb = (a?.city || f.city || "").trim()
  const stateRaw = (a?.province || f.state || "").trim()
  const state = country === "AU" ? normalizeAustralianState(stateRaw) : stateRaw
  const addressLine1 = (a?.address_1 || f.address_1 || "").trim()
  const phone = (a?.phone || f.phone || "").trim()

  if (!country) throw new Error("AusPost warehouse missing country_code")
  if (!postcode) throw new Error("AusPost warehouse missing postcode")
  if (!suburb) throw new Error("AusPost warehouse missing suburb (city)")
  if (!state) throw new Error("AusPost warehouse missing state")
  if (!addressLine1) throw new Error("AusPost warehouse missing address line 1")
  if (!phone) throw new Error("AusPost warehouse missing phone (mandatory for ship-from)")

  return {
    name: input.name || f.name || "Warehouse",
    lines: [addressLine1],
    suburb,
    state,
    postcode,
    // Ship-from is always AU for AusPost, so country is omitted (domestic).
    ...(country === "AU" ? {} : { country }),
    phone,
  }
}

/**
 * Builds an AusPost tracking URL from a tracking ID. AusPost uses a single
 * public tracking page regardless of service type.
 */
export function buildAusPostTrackingUrl(trackingId: string): string {
  return `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(trackingId)}`
}

/**
 * Parses an AusPost price (decimal string "9.95" or number) into a dollar
 * amount (MAJOR units) — Medusa's calculated_amount for a shipping option is
 * in major units, matching how the ShipStation provider returns it. Do NOT
 * convert to cents here or shipping is charged 100×.
 *
 * Returns 0 on invalid or negative input — callers treat zero as "unknown"
 * and don't bill. AusPost rates are always positive, so a negative value
 * means an upstream bug.
 */
export function priceToNumber(raw: string | number | null | undefined): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 0 ? 0 : raw
  }
  if (typeof raw !== "string") return 0
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}
