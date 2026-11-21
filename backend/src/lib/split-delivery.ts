/**
 * Split delivery: one organisation order sent to 2+ saved destinations, with
 * quantities per cart line. Stored as `cart.metadata.split_delivery`, copied to
 * the order. Pure — admin can import the type.
 */
export type SplitDelivery = Array<{
  destination_id: string
  /** Snapshots so the job window needs no lookups. */
  name: string
  address: string
  lines: Array<{ line_id: string; title: string; quantity: number }>
}>

export const SPLIT_MAX_DESTINATIONS = 12

export type SplitInput = Array<{ destination_id: string; lines: Array<{ line_id: string; quantity: number }> }>

/** Shape-clean a split from the browser. null = nothing usable (no split). */
export function cleanSplitInput(raw: unknown): SplitInput | null {
  if (!Array.isArray(raw)) return null
  const out: SplitInput = []
  for (const d of raw.slice(0, SPLIT_MAX_DESTINATIONS + 1)) {
    if (!d || typeof d !== "object" || typeof (d as any).destination_id !== "string") continue
    const lines: SplitInput[number]["lines"] = []
    for (const l of Array.isArray((d as any).lines) ? (d as any).lines.slice(0, 400) : []) {
      const q = Math.floor(Number(l?.quantity))
      if (typeof l?.line_id === "string" && Number.isFinite(q) && q > 0) lines.push({ line_id: l.line_id, quantity: q })
    }
    if (lines.length) out.push({ destination_id: d.destination_id.slice(0, 80), lines })
  }
  return out.length ? out : null
}

/**
 * Every destination once, 2 or more of them, each saved and active for THIS
 * organisation, and every cart line's quantities adding up to exactly the
 * line's quantity. Returns an error in plain words or null.
 */
export function validateSplit(
  split: SplitInput,
  cartLines: Array<{ id: string; quantity: number }>,
  allowedDestinationIds: ReadonlySet<string>
): string | null {
  if (split.length < 2) return "Choose at least two addresses, or deliver to one."
  if (split.length > SPLIT_MAX_DESTINATIONS) return `Up to ${SPLIT_MAX_DESTINATIONS} addresses.`
  const seen = new Set<string>()
  for (const d of split) {
    if (!allowedDestinationIds.has(d.destination_id)) return "One of those addresses isn't saved for your organisation."
    if (seen.has(d.destination_id)) return "Each address can only appear once."
    seen.add(d.destination_id)
  }
  const sent = new Map<string, number>()
  for (const d of split) {
    for (const l of d.lines) sent.set(l.line_id, (sent.get(l.line_id) ?? 0) + l.quantity)
  }
  for (const id of Array.from(sent.keys())) {
    if (!cartLines.some((l) => l.id === id)) return "Your cart changed. Set the split again."
  }
  for (const l of cartLines) {
    if ((sent.get(l.id) ?? 0) !== l.quantity) return "Each item's quantities must add up to what is in your cart."
  }
  return null
}
