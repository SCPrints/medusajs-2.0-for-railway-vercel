// One-off probe: what Shippit would charge SC Prints for typical cart weights
// to a spread of AU destinations, laid against the weight bands the customer
// pays today (backend/src/lib/shipping-rate.ts). Reads nothing from Medusa.
//
//   SHIPPIT_API_KEY=… node --experimental-strip-types scripts/shippit-quote-compare.mjs
//   SHIPPIT_STAGING=1 → app.staging.shippit.com
//
// Shippit quotes from the merchant's configured pickup location, so no origin
// is sent. Prices are what Shippit bills us (ex-GST); bands are postage only.
import { computeShippingAmount } from "../backend/src/lib/shipping-rate.ts"

const key = process.env.SHIPPIT_API_KEY
if (!key) {
  console.error("SHIPPIT_API_KEY is required")
  process.exit(1)
}
const host = process.env.SHIPPIT_STAGING
  ? "https://app.staging.shippit.com"
  : "https://app.shippit.com"

const DESTINATIONS = [
  { label: "Sydney CBD", postcode: "2000", suburb: "Sydney", state: "NSW" },
  { label: "Western Sydney", postcode: "2150", suburb: "Parramatta", state: "NSW" },
  { label: "Regional NSW", postcode: "2830", suburb: "Dubbo", state: "NSW" },
  { label: "Melbourne", postcode: "3000", suburb: "Melbourne", state: "VIC" },
  // Suburb must match Shippit's gazetteer exactly — "Brisbane" (not "Brisbane
  // City") returns success:false from every carrier. Same for "Darwin City".
  { label: "Brisbane", postcode: "4000", suburb: "Brisbane City", state: "QLD" },
  { label: "Adelaide", postcode: "5000", suburb: "Adelaide", state: "SA" },
  { label: "Perth", postcode: "6000", suburb: "Perth", state: "WA" },
  { label: "Hobart", postcode: "7000", suburb: "Hobart", state: "TAS" },
  { label: "Darwin", postcode: "0800", suburb: "Darwin City", state: "NT" },
]

// grams, incl. packaging — one per current band plus the overage zone
const WEIGHTS = [600, 1000, 2000, 3000, 5000, 10000, 15000, 22000, 30000]

// ponytail: split into ≤20 kg cartons; dims omitted (Shippit quotes on weight alone)
const parcels = (grams) => {
  const kg = grams / 1000
  const n = Math.max(1, Math.ceil(kg / 20))
  return [{ qty: n, weight: +(kg / n).toFixed(2) }]
}

const quote = async (dest, grams) => {
  const res = await fetch(`${host}/api/3/quotes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quote: {
        dropoff_postcode: dest.postcode,
        dropoff_suburb: dest.suburb,
        dropoff_state: dest.state,
        parcel_attributes: parcels(grams),
        service_levels: ["standard", "express"],
        return_all_quotes: true,
      },
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { error: `${res.status} ${JSON.stringify(json).slice(0, 120)}` }
  const out = {}
  for (const r of json.response ?? []) {
    if (!r.success) continue
    for (const q of r.quotes ?? []) {
      if (!q.price) continue
      const cur = out[r.service_level]
      if (!cur || q.price < cur.price) {
        out[r.service_level] = { price: q.price, courier: r.courier_type, eta: q.estimated_transit_time }
      }
    }
  }
  return out
}

const money = (n) => (n == null ? "—" : `$${n.toFixed(2)}`)
const pad = (s, w) => String(s).padEnd(w)

const rows = []
for (const dest of DESTINATIONS) {
  for (const grams of WEIGHTS) {
    const q = await quote(dest, grams)
    const customer = computeShippingAmount(grams)
    const postage = customer
    const std = q.standard?.price ?? null
    rows.push({
      dest: dest.label,
      kg: grams / 1000,
      postage,
      customer,
      std,
      stdCourier: q.standard?.courier ?? q.error ?? "no quote",
      exp: q.express?.price ?? null,
      gap: std == null ? null : postage - std,
    })
  }
}

console.log(
  pad("destination", 16), pad("kg", 5), pad("band postage", 13), pad("customer pays", 14),
  pad("shippit std", 12), pad("gap", 8), pad("shippit exp", 12), "std courier"
)
for (const r of rows) {
  console.log(
    pad(r.dest, 16), pad(r.kg, 5), pad(money(r.postage), 13), pad(money(r.customer), 14),
    pad(money(r.std), 12), pad(r.gap == null ? "—" : (r.gap >= 0 ? "+" : "") + r.gap.toFixed(2), 8),
    pad(money(r.exp), 12), r.stdCourier
  )
}

const quoted = rows.filter((r) => r.gap != null)
const under = quoted.filter((r) => r.gap < 0)
console.log(
  `\n${quoted.length}/${rows.length} quoted · band postage under Shippit cost on ${under.length} ` +
  `(worst ${under.length ? money(Math.min(...under.map((r) => r.gap))) : "—"}) · ` +
  `gap is band postage minus Shippit standard; negative = we lose money on postage alone`
)
