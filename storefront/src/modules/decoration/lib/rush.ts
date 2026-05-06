import type { DecorationMethod, RushTier, Turnaround } from "./types"

type RushFee = {
  priority: number
  /** null when express is not offered for this method (e.g. screen print). */
  express: number | null
}

export const RUSH_FEES: Record<DecorationMethod, RushFee> = {
  embroidery: { priority: 25, express: 50 },
  dtf: { priority: 15, express: 35 },
  screen: { priority: 40, express: null },
  uvdtf_sheet: { priority: 20, express: 40 },
  uvdtf_applied: { priority: 20, express: 40 },
  uv: { priority: 0, express: null },
}

export const TURNAROUNDS: Record<DecorationMethod, Turnaround> = {
  embroidery: {
    standard: "5–7 business days",
    priority: "3–4 business days",
    express: "Next business day",
  },
  dtf: {
    standard: "3–5 business days",
    priority: "2–3 business days",
    express: "Next business day",
  },
  screen: {
    standard: "7–10 business days",
    priority: "5–7 business days",
  },
  uvdtf_sheet: {
    standard: "3–5 business days",
    priority: "2–3 business days",
    express: "Next business day",
  },
  uvdtf_applied: {
    standard: "5–7 business days",
    priority: "3–4 business days",
    express: "Next business day",
  },
  uv: { standard: "Quote on request" },
}

export const getRushSurcharge = (
  method: DecorationMethod,
  tier: RushTier
): number => {
  if (tier === "standard") return 0
  const fees = RUSH_FEES[method]
  if (tier === "priority") return fees.priority
  return fees.express ?? 0
}

export const isRushAvailable = (
  method: DecorationMethod,
  tier: RushTier
): boolean => {
  if (tier === "standard") return true
  if (tier === "priority") return true
  return RUSH_FEES[method].express !== null
}
