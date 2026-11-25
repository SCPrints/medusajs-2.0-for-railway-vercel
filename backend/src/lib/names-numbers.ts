/**
 * Names / numbers printed on a team order's garments, priced like any other
 * print: each one is a DTF print of the size the customer picks, at the
 * order's quantity band (SCP_PRINT_UNIT_MATRIX). Charged as one service line
 * (qty = garments). Pure — admin-safe and shared with the storefront preview.
 */
import {
  SCP_PRINT_SIZE_OPTIONS,
  resolveScpTierIndexForQuantity,
  scpPrintUnitMajorForTier,
  type ScpPrintSizeId,
} from "./scp-dtf-print-pricing"

/** Sizes a name / number can be. Oversize isn't offered. */
export const NAME_PRINT_SIZES = ["up_to_a6", "up_to_a4", "up_to_a3"] as const
export type NamePrintSize = (typeof NAME_PRINT_SIZES)[number]

export type NamesNumbers = { names: NamePrintSize | null; numbers: NamePrintSize | null }

const size = (v: unknown): NamePrintSize | null =>
  (NAME_PRINT_SIZES as readonly string[]).includes(v as string) ? (v as NamePrintSize) : null

/** Clean a browser-sent choice. null = no names and no numbers. */
export function cleanNamesNumbers(raw: unknown): NamesNumbers | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const out = { names: size(r.names), numbers: size(r.numbers) }
  return out.names || out.numbers ? out : null
}

/** Per-garment price (AUD inc GST) for this many garments. */
export function namesNumbersUnitMajor(choice: NamesNumbers, garments: number): number {
  const tier = resolveScpTierIndexForQuantity(garments)
  const part = (s: NamePrintSize | null) => (s ? scpPrintUnitMajorForTier(s as ScpPrintSizeId, tier) : 0)
  return Math.round((part(choice.names) + part(choice.numbers)) * 100) / 100
}

// "Up to A4" → "up to A4": paper sizes keep their capital.
const sizeLabel = (s: NamePrintSize) => SCP_PRINT_SIZE_OPTIONS.find((o) => o.id === s)?.label.replace(/^Up /, "up ") ?? s

/** "Names (up to A4) + numbers (up to A6)". */
export function namesNumbersLabel(choice: NamesNumbers): string {
  return [
    choice.names ? `Names (${sizeLabel(choice.names)})` : null,
    choice.numbers ? `${choice.names ? "numbers" : "Numbers"} (${sizeLabel(choice.numbers)})` : null,
  ]
    .filter(Boolean)
    .join(" + ")
}
