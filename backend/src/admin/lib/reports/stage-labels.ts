/**
 * Short operator-facing labels for the original 10-stage production flow,
 * as used by the report charts + production calendar. Distinct on purpose
 * from PRODUCTION_STAGE_LABEL in src/lib/production-stage.ts, whose copy is
 * customer-facing ("Awaiting your approval") and spans the three-track model.
 */
export const STAGE_LABELS: Record<string, string> = {
  // Three-track stage values (ARTWORK_STAGES / BLANKS_STAGES). Without these
  // the charts fell through to the raw key and rendered "in_review",
  // "not_started", "ordered". Track-prefixed because "ordered"/"arrived"
  // mean the same thing as the legacy blanks_* keys below and both appear.
  pending: "Artwork: not started",
  in_review: "Artwork: in review",
  not_started: "Blanks: not ordered",
  ordered: "Blanks: ordered",
  arrived: "Blanks: received",

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
