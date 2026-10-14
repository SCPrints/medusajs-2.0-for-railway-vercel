/**
 * JB's Wear styles / colourways that must NOT be imported — discontinued,
 * clearance or sale lines (sale ≈ about to be discontinued). JB's SKU sheet
 * has no status column, so this list is the gate. Keeping them out up front
 * beats importing then hand-removing them later.
 *
 * Entries: a style code ("4LSW") drops the whole style; "STYLE/COLOURCODE"
 * ("1HT/NX") drops one colourway. Case-insensitive. Add JB's clearance /
 * discontinued list here before each import.
 */
export const JBS_WEAR_EXCLUDE: string[] = [
  // In the 2026 SKU sheet but 404 on jbswear.com.au (checked 2026-10-14) —
  // pulled from JB's own site, treat as discontinued.
  "4LSW", // Ladies L/S Original Poplin Shirt
  "4LSWS", // Ladies S/S Original Poplin Shirt
  "6DNS5", // HV (D+N) Safety Vest Print Security
  "6DNS7", // HV (D+N) Safety Vest Print Visitor
  "6HVS6", // HV Safety Vest Print Staff
  "9KPI", // Adjustable Sizing Knee Pad
]
