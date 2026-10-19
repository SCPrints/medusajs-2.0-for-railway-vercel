/**
 * Live "Standard Shipping (AU)" price from Shippit, with the weight ladder as
 * the fallback. The single scp_scp shipping option stays; only its price
 * source changes when SHIPPIT_API_KEY is set.
 *
 * Why: the 2026-10-19 probe (scripts/shippit-quote-compare.mjs) showed the
 * ladder is a Sydney-metro price charged nationally — Sydney over-recovers by
 * up to $37 while Dubbo/Darwin (flat $32 TNT) lose ~$21 on a one-garment order.
 *
 * Customer price = ceil(cheapest standard carrier price × GST). Postage only —
 * the small-order / inbound-freight charge lives in the garment ladder
 * (commit 5cb0ad42), not here. Any failure (no key, non-AU, missing address,
 * timeout, every carrier refusing, $0 quote) returns the ladder amount —
 * checkout never dead-ends.
 */
import { normalizeAustralianState } from "../modules/auspost/mapping"
import { SHIPPIT_API_KEY, SHIPPIT_BASE_URL } from "./constants"
import { computeShippingAmount } from "./shipping-rate"

/**
 * Shippit's `price` is the carrier's ex-GST rate; Shippit adds GST on the
 * invoice. The customer price is inc-GST (HOLD cutover), so gross it up.
 * ponytail: constant not env — flip to 1 if an invoice line shows the quote
 * already included GST.
 */
export const SHIPPIT_QUOTE_GST_MULTIPLIER = 1.1

/** Heaviest single carton we'll declare; heavier carts split into n parcels. */
export const SHIPPIT_MAX_PARCEL_KG = 20

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

export type ShippitStandardQuote = {
  /** Carrier price as returned (AUD, ex-GST). */
  carrier_price: number
  courier: string
  transit?: string
}

/**
 * Cheapest successful `standard` quote in a /quotes response, or null.
 * `success:false` entries and $0 prices (Shippit's "can't accept") are
 * skipped, so a partial carrier outage still prices if anyone answered.
 */
export const pickStandardQuote = (json: unknown): ShippitStandardQuote | null => {
  const rows = (json as { response?: unknown[] })?.response
  if (!Array.isArray(rows)) return null
  let best: ShippitStandardQuote | null = null
  for (const row of rows as Array<Record<string, any>>) {
    if (row?.service_level !== "standard" || !row.success) continue
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

/** What the customer pays for a carrier price: GST gross-up, rounded up to whole dollars. */
export const customerAmountFromCarrierPrice = (carrierPrice: number): number =>
  Math.ceil(carrierPrice * SHIPPIT_QUOTE_GST_MULTIPLIER)

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
  /** Set when rate_source = "shippit". */
  shippit?: ShippitStandardQuote & { suburb: string; postcode: string; state: string }
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
  const parcels = shippitParcels(input.grams)
  const key = `${input.postcode}|${input.suburb.toLowerCase()}|${input.state}|${parcels[0].qty}x${parcels[0].weight}`
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
        parcel_attributes: parcels,
        service_levels: ["standard"],
        return_all_quotes: true,
      },
    }),
    signal: AbortSignal.timeout(SHIPPIT_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Shippit /quotes ${res.status}`)
  const value = pickStandardQuote(await res.json())
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
    if (!quote) return fallback("no_carrier_quote")
    return {
      amount: customerAmountFromCarrierPrice(quote.carrier_price),
      rate_source: "shippit",
      shippit: { ...quote, suburb, postcode, state },
    }
  } catch (err) {
    log?.(`shippit quote failed, using ladder: ${(err as Error).message}`)
    return fallback("error")
  }
}
