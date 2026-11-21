/**
 * "Estimated delivery" window: production ETA (GET /store/production-eta, business days)
 * plus the transit the shipping policy promises for standard shipping
 * (3-6 business days metro). No public holidays, same as the backend's business-days.ts.
 */
export const TRANSIT_BUSINESS_DAYS = { low: 3, high: 6 }

export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from)
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added += 1
  }
  return d
}

export function deliveryWindow(from: Date, eta: { low_days: number; high_days: number }) {
  return {
    earliest: addBusinessDays(from, eta.low_days + TRANSIT_BUSINESS_DAYS.low),
    latest: addBusinessDays(from, eta.high_days + TRANSIT_BUSINESS_DAYS.high),
  }
}

const fmt = (d: Date) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })

export const formatDeliveryWindow = (w: { earliest: Date; latest: Date }) => `${fmt(w.earliest)} – ${fmt(w.latest)}`
