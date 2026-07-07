/**
 * Short operator-facing labels for the original 10-stage production flow,
 * as used by the report charts + production calendar. Distinct on purpose
 * from PRODUCTION_STAGE_LABEL in src/lib/production-stage.ts, whose copy is
 * customer-facing ("Awaiting your approval") and spans the three-track model.
 */
export const STAGE_LABELS: Record<string, string> = {
  received: "Received",
  art_review: "Art review",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  blanks_ordered: "Blanks ordered",
  blanks_arrived: "Blanks received",
  in_production: "In production",
  quality_check: "Quality check",
  shipped: "Shipped",
  delivered: "Delivered",
}
