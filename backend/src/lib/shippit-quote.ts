/**
 * Live "Standard Shipping (AU)" price from Shippit, with the weight ladder as
 * the fallback. The single scp_scp shipping option stays; only its price
 * source changes when SHIPPIT_API_KEY is set.
 *
 * Why: the 2026-10-19 probe (scripts/shippit-quote-compare.mjs) showed the
 * ladder is a Sydney-metro price charged nationally — Sydney over-recovers by
 * up to $37 while Dubbo/Darwin (flat $32 TNT) lose ~$21 on a one-garment order.
 *
 * Customer price = ceil(AusPost single-parcel price × parcel count), already
 * inc-GST (see SHIPPIT_QUOTE_GST_MULTIPLIER, WEBSITE_COURIER). Postage only —
 * the small-order / inbound-freight charge lives in the garment ladder
 * (commit 5cb0ad42), not here. Any failure (no key, non-AU, missing address,
 * timeout, every carrier refusing, $0 quote) returns the ladder amount —
 * checkout never dead-ends.
 */
import { normalizeAustralianState } from "../modules/auspost/mapping"
import { SHIPPIT_API_KEY, SHIPPIT_BASE_URL } from "./constants"
import { computeShippingAmount } from "./shipping-rate"

/**
 * Shippit's `price` is GST-INCLUSIVE — verified 2026-10-19 from the quote's
 * own `price_breakdown` (TNT Dubbo: courierCost 22.195 + fuelSurcharge 6.946
 * + gst 2.914 = 32.06, the headline price). The customer price is also
 * inc-GST, so no gross-up. Left as a named constant so the assumption is
 * visible; it was 1.1 for the first hour live and overcharged ~10%.
 */
export const SHIPPIT_QUOTE_GST_MULTIPLIER = 1

/**
 * Heaviest single carton we'll declare; heavier carts split into n parcels.
 * AusPost prices per parcel and by zone, so this decides how many parcels a
 * bulk order is charged for. 10 kg ≈ a real carton of ~50 tees or ~18
 * hoodies; the old 20 kg quoted 100 kg of tees as 6 cartons when it ships
 * as 10 and under-recovered ~$100 to Sydney.
 * ponytail: single number until Sean supplies carton sizes per garment type.
 */
export const SHIPPIT_MAX_PARCEL_KG = 10

/** 5 s — a slow carrier must not stall the delivery step. */
const SHIPPIT_TIMEOUT_MS = 5_000
/** Same cart is quoted several times per checkout (list, select, recompute). */
const CACHE_TTL_MS = 10 * 60_000

/**
 * Shippit matches `dropoff_suburb` against its gazetteer exactly: "Brisbane"
 * gets success:false from every carrier, "Brisbane City" quotes fine. Only
 * the capitals whose common name differs are mapped; anything else that
 * misses falls back to the ladder.
 */
const SUBURB_ALIASES: Record<string, string> = {
  brisbane: "Brisbane City",
  darwin: "Darwin City",
}

export const shippitSuburb = (city: string | null | undefined): string => {
  const c = (city || "").trim()
  return SUBURB_ALIASES[c.toLowerCase()] || c
}

export type ShippitParcel = { qty: number; weight: number }

/** grams → `parcel_attributes`, weight in kg, split into ≤20 kg cartons. */
export const shippitParcels = (grams: number): ShippitParcel[] => {
  const kg = Math.max(0.1, (Number.isFinite(grams) ? grams : 0) / 1000)
  const n = Math.max(1, Math.ceil(kg / SHIPPIT_MAX_PARCEL_KG))
  return [{ qty: n, weight: +(kg / n).toFixed(2) }]
}

/**
 * The ONLY carrier the website quotes (Shippit's courier_type). Staff still
 * book any carrier by hand in Shippit; web orders go AusPost after the
 * Aramex / CouriersPlease lost-parcel history (Sean, 2026-10-19). AusPost
 * via Shippit only quotes ONE parcel (≤22 kg) per call and prices per
 * parcel with no consignment discount, so a multi-carton order is quoted as
 * one carton × the carton count.
 */
export const WEBSITE_COURIER = "MyPostBusinessStandard"

export type ShippitStandardQuote = {
  /** Carrier price for ONE parcel as returned (AUD, inc-GST). */
  carrier_price: number
  courier: string
  transit?: string
}

/**
 * The `standard` quote for `courier` in a /quotes response (or, with no
 * courier given, the cheapest successful one), or null. `success:false`
 * entries and $0 prices (Shippit's "can't accept") are skipped.
 */
export const pickStandardQuote = (
  json: unknown,
  courier?: string
): ShippitStandardQuote | null => {
  const rows = (json as { response?: unknown[] })?.response
  if (!Array.isArray(rows)) return null
  let best: ShippitStandardQuote | null = null
  for (const row of rows as Array<Record<string, any>>) {
    if (row?.service_level !== "standard" || !row.success) continue
    if (courier && row.courier_type !== courier) continue
    for (const q of (row.quotes ?? []) as Array<Record<string, any>>) {
      const price = Number(q?.price)
      if (!Number.isFinite(price) || price <= 0) continue
      if (!best || price < best.carrier_price) {
        best = {
          carrier_price: price,
          courier: String(row.courier_type ?? "unknown"),
          transit: typeof q.estimated_transit_time === "string" ? q.estimated_transit_time : undefined,
        }
      }
    }
  }
  return best
}

/** What the customer pays: per-parcel carrier price × parcels, rounded up to whole dollars. */
export const customerAmountFromCarrierPrice = (carrierPrice: number, parcels = 1): number =>
  Math.ceil(carrierPrice * SHIPPIT_QUOTE_GST_MULTIPLIER * Math.max(1, parcels))

type Address = {
  postal_code?: string | null
  city?: string | null
  province?: string | null
  country_code?: string | null
}

export type ShippingRateResolution = {
  /** AUD dollars, inc-GST, what the customer pays. */
  amount: number
  rate_source: "shippit" | "ladder"
  /** Set when rate_source = "shippit". `parcels` × `parcel_kg` is what was priced. */
  shippit?: ShippitStandardQuote & {
    suburb: string
    postcode: string
    state: string
    parcels: number
    parcel_kg: number
  }
  /** Why the ladder was used (for the shipping_decision stamp / logs). */
  fallback_reason?: string
}

// ponytail: in-process cache; fine on one Fly machine. Move to Redis if we scale out.
const cache = new Map<string, { at: number; value: ShippitStandardQuote | null }>()

export const fetchShippitStandardQuote = async (input: {
  postcode: string
  suburb: string
  state: string
  grams: number
}): Promise<ShippitStandardQuote | null> => {
  const [{ weight }] = shippitParcels(input.grams)
  // One parcel only: AusPost via Shippit errors on qty > 1, and it prices per
  // parcel anyway, so the caller multiplies by the parcel count.
  const key = `${input.postcode}|${input.suburb.toLowerCase()}|${input.state}|${weight}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  const res = await fetch(`${SHIPPIT_BASE_URL}/quotes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SHIPPIT_API_KEY}`,
      "Content-Type": "application/json",
    },
    // Body must be wrapped in `quote` — unwrapped fields 400 with
    // "parcel_attributes can't be blank".
    body: JSON.stringify({
      quote: {
        dropoff_postcode: input.postcode,
        dropoff_suburb: input.suburb,
        dropoff_state: input.state,
        dropoff_country_code: "AU",
        parcel_attributes: [{ qty: 1, weight }],
        service_levels: ["standard"],
        // true = every carrier, so WEBSITE_COURIER is present even when a
        // cheaper courier would have won Shippit's own allocation.
        return_all_quotes: true,
      },
    }),
    signal: AbortSignal.timeout(SHIPPIT_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Shippit /quotes ${res.status}`)
  const value = pickStandardQuote(await res.json(), WEBSITE_COURIER)
  cache.set(key, { at: Date.now(), value })
  return value
}

/**
 * The one entry point both the scp provider's calculatePrice and the
 * cart-shipping-options route use, so the customer and the admin stamp always
 * agree. Never throws.
 */
export const resolveShippingRate = async (
  totalWeightGrams: number,
  address: Address | null | undefined,
  log?: (msg: string) => void
): Promise<ShippingRateResolution> => {
  const ladder = computeShippingAmount(totalWeightGrams)
  const fallback = (reason: string): ShippingRateResolution => ({
    amount: ladder,
    rate_source: "ladder",
    fallback_reason: reason,
  })

  if (!SHIPPIT_API_KEY) return fallback("no_api_key")
  const country = (address?.country_code || "au").trim().toLowerCase()
  if (country !== "au") return fallback("non_au")
  const postcode = (address?.postal_code || "").trim()
  const suburb = shippitSuburb(address?.city)
  const state = normalizeAustralianState(address?.province)
  if (!postcode || !suburb || !state) return fallback("address_incomplete")

  try {
    const quote = await fetchShippitStandardQuote({ postcode, suburb, state, grams: totalWeightGrams })
    if (!quote) return fallback("no_auspost_quote")
    const [{ qty: parcels, weight: parcel_kg }] = shippitParcels(totalWeightGrams)
    return {
      amount: customerAmountFromCarrierPrice(quote.carrier_price, parcels),
      rate_source: "shippit",
      shippit: { ...quote, suburb, postcode, state, parcels, parcel_kg },
    }
  } catch (err) {
    log?.(`shippit quote failed, using ladder: ${(err as Error).message}`)
    return fallback("error")
  }
}
