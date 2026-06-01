/**
 * Normalise a fabric/composition string extracted from a supplier's HTML
 * description into a clean value suitable for the customer-facing PDP
 * "Material" line (storefront product-tabs).
 *
 * Supplier descriptions interleave the composition with feature bullets in a
 * single block, e.g.:
 *   "160gm 100% Polyester Features: Mini waffle knit Dri-wear antibacterial ..."
 *   "200gsm 65% Polyester 35% Cotton Wash-n-wear, pleat front. Sizes: 77R-112R"
 *
 * The composition is always at the START; the feature/spec text follows. This
 * helper keeps the composition and drops everything from the first feature /
 * spec boundary onward. Pure + deterministic so it's unit-tested and reused by
 * every supplier extractor (AP / Ramo / DNC) and the one-off cleanup script.
 */

/**
 * Section labels and feature-phrase starts that mark the end of the composition
 * and the start of feature/spec prose. Matched case-insensitively. Order does
 * not matter — we cut at the EARLIEST match.
 */
const FEATURE_BOUNDARY = new RegExp(
  [
    // Explicit section labels
    "\\s*Features\\s*:",
    "\\s*Size\\s*:",
    "\\s*Sizes\\s*:",
    "\\s*Specifications?\\s*:",
    "\\s*Wash[-\\s]?n[-\\s]?wear",
    // Common feature-phrase starts (no label) seen across AP / DNC / Ramo
    "\\s+Dri-wear",
    "\\s+Easy care fabric",
    "\\s+Antibacterial",
    "\\s+Self fabric",
    "\\s+Side splits?",
    "\\s+Side vents?",
    "\\s+\\d?\\s?button placket",
    "\\s+Three button",
    "\\s+Four button",
    "\\s+hood lining",
    "\\s+Brushed inner",
    "\\s+Mini waffle",
    "\\s+Moisture removal",
    "\\s+Snag resistant",
    "\\s+Larger sizes available",
    "\\s+Loose pocket",
    "\\s+Flat tie cord",
    "\\s+Kangaroo pocket",
    "\\s+Contrast ",
    "\\s+Jacquard",
    "\\s+Raglan sleeve",
    "\\s+Set in sleeve",
    "\\s+Birdseye knit",
    "\\s+New mesh knit",
    "\\s+Honeycomb knit",
    "\\s+reflective tab",
  ].join("|"),
  "i"
)

/** Minimum length for a plausible composition once trimmed. */
const MIN_LENGTH = 4

/**
 * Clean a raw material string. Returns the composition prefix with feature
 * prose removed, or null if the input is empty / too short to be useful.
 */
export function cleanMaterialString(
  raw: string | null | undefined
): string | null {
  if (!raw || typeof raw !== "string") return null

  let text = raw.replace(/\s+/g, " ").trim()
  if (!text) return null

  const m = text.match(FEATURE_BOUNDARY)
  if (m && typeof m.index === "number") {
    text = text.slice(0, m.index)
  }

  // Trim trailing connective punctuation left dangling by the cut.
  text = text.replace(/[\s,.:;\-]+$/g, "").trim()

  if (text.length < MIN_LENGTH) return null
  return text
}
