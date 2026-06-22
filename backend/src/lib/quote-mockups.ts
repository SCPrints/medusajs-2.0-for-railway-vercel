/**
 * Extract the Studio mockup images from a quote's line items — shared by the
 * customer-facing design-approval GET route and the admin "email approval link"
 * route so both surface the same images. Deduped by URL; label is the garment
 * title (+ side when not the front) so multi-line quotes read clearly.
 */

const SIDE_LABELS: Record<string, string> = {
  front: "Front",
  back: "Back",
  left_sleeve: "Left sleeve",
  right_sleeve: "Right sleeve",
  printed_tag: "Printed tag",
  bottle_label: "Label",
  bottle_back_label: "Back label",
}

export type QuoteMockup = {
  side: string
  sideLabel: string | null
  url: string
}

export function buildQuoteMockups(quote: any): QuoteMockup[] {
  const lines = Array.isArray(quote?.line_items?.items)
    ? (quote.line_items.items as Array<Record<string, any>>)
    : []
  const seen = new Set<string>()
  const out: QuoteMockup[] = []
  for (const li of lines) {
    const artifacts = Array.isArray(li?.customizerDesign?.artifacts)
      ? li.customizerDesign.artifacts
      : []
    for (const a of artifacts) {
      const url = a?.mockupUrl
      if (typeof url !== "string" || !url || seen.has(url)) continue
      seen.add(url)
      const side = typeof a?.side === "string" ? a.side : "front"
      const garment = typeof li?.title === "string" ? li.title : null
      const sideLabel = SIDE_LABELS[side] ?? null
      const label =
        garment && sideLabel && side !== "front"
          ? `${garment} — ${sideLabel}`
          : garment ?? sideLabel
      out.push({ side, sideLabel: label, url })
    }
  }
  return out
}
