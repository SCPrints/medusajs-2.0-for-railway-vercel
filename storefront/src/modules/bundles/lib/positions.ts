import type { BundleItem, BundlePrintPosition } from "@lib/data/bundles"

const SIDE_LABELS: Record<string, string> = {
  front: "front",
  back: "back",
  left_sleeve: "left sleeve",
  right_sleeve: "right sleeve",
  printed_tag: "neck tag",
}

const SIZE_LABELS: Record<string, string> = {
  up_to_a6: "logo size",
  up_to_a4: "A4",
  up_to_a3: "A3",
  oversize: "oversize",
}

// Mirrors resolvePrintPositions in backend/src/lib/bundle-lines.ts (which
// is what actually prices the line) — display only.
export function positionsFor(item: BundleItem): BundlePrintPosition[] {
  const explicit = item.print_positions?.positions ?? []
  if (explicit.length) return explicit
  if (item.decoration_type === "embroidery") return [{ side: "front", method: "embroidery" }]
  if (item.decoration_type === "print") return [{ side: "front", method: "print", size_id: "up_to_a4" }]
  return []
}

export function describePositions(item: BundleItem): string {
  const positions = positionsFor(item)
  if (!positions.length) return "No decoration"
  return positions
    .map((p) =>
      p.method === "embroidery"
        ? `Embroidered ${SIDE_LABELS[p.side] ?? p.side}`
        : `Printed ${SIDE_LABELS[p.side] ?? p.side} (${SIZE_LABELS[p.size_id ?? ""] ?? "A4"})`
    )
    .join(" · ")
}
