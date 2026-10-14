/**
 * Dispatch packing checklist — what staff confirm before an order ships.
 * Shared by the admin route (completion stamping) and the order widget
 * (labels + printed slip). Pure, no Node deps, so the admin bundle can import it.
 *
 * Stored on order.metadata.packing_check:
 *   { ticks: { "<key>": { at, by } }, completed_at?, completed_by? }
 * Keys: `line:<line_item_id>:<check>` per line, `order:<check>` once per order.
 */

export const PACKING_CHECK_KEY = "packing_check"

export const LINE_CHECKS = [
  { id: "items", label: "Correct garment, colour, sizes & quantity" },
  { id: "quality", label: "Print / embroidery quality OK (placement, no defects)" },
  { id: "packed", label: "Folded & bagged" },
] as const

export const ORDER_CHECKS = [
  { id: "complete", label: "Nothing missing — every line packed" },
  { id: "slip", label: "Packing slip in the box" },
  { id: "address", label: "Shipping label matches the order address" },
  { id: "sealed", label: "Box sealed" },
] as const

export type PackingTick = { at: string; by: string | null }
export type PackingCheckState = {
  ticks: Record<string, PackingTick>
  completed_at?: string | null
  completed_by?: string | null
}

export const lineKey = (lineId: string, check: string) => `line:${lineId}:${check}`
export const orderKey = (check: string) => `order:${check}`

export function requiredKeys(lineIds: string[]): string[] {
  return [
    ...lineIds.flatMap((id) => LINE_CHECKS.map((c) => lineKey(id, c.id))),
    ...ORDER_CHECKS.map((c) => orderKey(c.id)),
  ]
}

export function isValidKey(key: string, lineIds: string[]): boolean {
  return requiredKeys(lineIds).includes(key)
}

export function readPackingCheck(meta: Record<string, unknown> | null | undefined): PackingCheckState {
  const raw = meta?.[PACKING_CHECK_KEY] as PackingCheckState | undefined
  if (!raw || typeof raw !== "object" || typeof raw.ticks !== "object" || !raw.ticks) {
    return { ticks: {} }
  }
  return raw
}

export function isComplete(state: PackingCheckState, lineIds: string[]): boolean {
  return lineIds.length > 0 && requiredKeys(lineIds).every((k) => !!state.ticks[k])
}
