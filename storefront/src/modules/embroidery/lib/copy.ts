/** Customer-facing strings for the embroidery estimator. Kept centralised so legal/marketing edits land in one place. */
export const COPY = {
  fontPreview:
    "Previews use web fonts for illustration. Your final embroidery will be digitized in the closest available match from our thread library — we'll confirm the exact font with you before production.",
  letteringPlacementNote:
    "This is an approximation of layout and style. Actual stitch output will vary based on your chosen font, thread colour, and garment placement.",
  locationVariables:
    "Estimate assumes a flat garment surface (e.g. shirt, jacket, bag). Caps, curved surfaces, and stretch fabrics may affect final pricing and design requirements.",
  resolutionNote:
    "For the most accurate estimate, upload the highest-resolution version of your artwork. Low-resolution images (under 300dpi) or screenshots may result in a broader price range.",
  specialty:
    "Estimate covers standard flat embroidery. 3D foam, appliqué, metallic threads, and other specialty techniques are priced on request.",
  finalEstimate:
    "Estimate based on your artwork and settings. All orders are reviewed by our digitizing team before production — if anything changes, we'll contact you before charging your card.",
  belowMinimum: (min: number) =>
    `Minimum order is ${min}. Quantities below this will require a manual quote.`,
  consolidatedHelp:
    "When checked, multiple placements of the same design across an order count toward the same quantity discount.",
} as const
