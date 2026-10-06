/**
 * Customer-facing "what we're decorating" summary for a quote — one row per
 * decoration (each print transfer, each embroidery side), read from the Studio
 * design on the quote lines. Shared by the quote-accept and design-approval
 * store routes so both pages tell the customer the technique + size of every
 * position they're signing off on. Deduped per design group (every size line
 * of a group carries the same design).
 */

const SIDE_LABELS: Record<string, string> = {
  front: "Front",
  back: "Back",
  left_sleeve: "Left sleeve",
  right_sleeve: "Right sleeve",
  printed_tag: "Neck tag",
}

const METHOD_LABELS: Record<string, string> = {
  print: "DTF print",
  embroidery: "Embroidery",
  screen: "Screen print",
}

export type QuoteDecoration = {
  garment: string | null
  side: string
  side_label: string
  method: string
  detail: string
}

const sideLabel = (s: string) => SIDE_LABELS[s] ?? s.replace(/_/g, " ")

export function buildQuoteDecorations(quote: any): QuoteDecoration[] {
  const lines = Array.isArray(quote?.line_items?.items)
    ? (quote.line_items.items as Array<Record<string, any>>)
    : []
  const seenGroups = new Set<string>()
  const out: QuoteDecoration[] = []
  for (const li of lines) {
    const d = li?.customizerDesign
    if (!d || typeof d !== "object") continue
    const groupKey = String(li.group_id ?? d.group_id ?? li.id)
    if (seenGroups.has(groupKey)) continue
    seenGroups.add(groupKey)
    // Garment name without the size suffix ("Hoodie — Black / S" → "Hoodie — Black").
    const garment =
      typeof li.title === "string" ? li.title.replace(/\s*\/\s*[^/]+$/, "") : null
    const methods = (d.sideDecorationMethods ?? {}) as Record<string, string>
    const emb = (d.sideEmbroideryConfigs ?? {}) as Record<string, any>
    const screen = (d.sideScreenConfigs ?? {}) as Record<string, any>

    for (const [side, cfg] of Object.entries(emb)) {
      if (methods[side] && methods[side] !== "embroidery") continue
      const parts = [
        cfg?.widthMm && cfg?.heightMm ? `approx. ${cfg.widthMm} × ${cfg.heightMm} mm` : null,
        cfg?.stitchCount ? `~${Number(cfg.stitchCount).toLocaleString("en-AU")} stitches` : null,
      ].filter(Boolean)
      out.push({
        garment,
        side,
        side_label: sideLabel(side),
        method: METHOD_LABELS.embroidery,
        detail: parts.join(", "),
      })
    }

    const prints = Array.isArray(d.prints) ? d.prints : []
    for (const p of prints) {
      const side = typeof p?.side === "string" ? p.side : "front"
      const method = methods[side] ?? "print"
      if (method === "embroidery") continue // covered by the embroidery row
      const w = Number(p?.approxCm?.width)
      const h = Number(p?.approxCm?.height)
      const parts = [
        w && h ? `approx. ${w.toFixed(1)} × ${h.toFixed(1)} cm` : null,
        method === "screen" && screen[side]?.colours
          ? `${screen[side].colours} colour${screen[side].colours > 1 ? "s" : ""}`
          : null,
      ].filter(Boolean)
      out.push({
        garment,
        side,
        side_label: sideLabel(side),
        method: METHOD_LABELS[method] ?? method,
        detail: parts.join(", "),
      })
    }
  }
  // Number repeats so "Back print 1 / Back print 2" reads as two transfers.
  const counts = new Map<string, number>()
  for (const r of out) counts.set(`${r.garment}|${r.side}`, (counts.get(`${r.garment}|${r.side}`) ?? 0) + 1)
  const seen = new Map<string, number>()
  for (const r of out) {
    const k = `${r.garment}|${r.side}`
    if ((counts.get(k) ?? 0) > 1) {
      const n = (seen.get(k) ?? 0) + 1
      seen.set(k, n)
      r.side_label = `${r.side_label} (${n} of ${counts.get(k)})`
    }
  }
  return out
}
