import { SCP_PRINT_SIZE_OPTIONS, type ScpPrintSizeId } from "../../lib/scp-dtf-print-pricing"

/**
 * Customer-facing labels the job pricer writes onto a quote: `jp_` line
 * titles, the snapshot's group titles, design labels and position strings.
 * Optional staff names ("Bull shirt", "Bull (back)") tell two groups of the
 * same garment apart on the accept page; blank names keep the plain labels.
 */

const named = (name: string | null | undefined) => name?.trim() || ""

/** Supplier colours arrive SHOUTED ("BLACK"); named titles read as prose. */
const tidyColour = (c: string) => (c && c === c.toUpperCase() ? c.toLowerCase().replace(/\b\p{L}/gu, (ch) => ch.toUpperCase()) : c)

export type LineTitleInput = {
  groupName?: string | null
  supplied: boolean
  productTitle: string
  /** Supplied rows: their free label ("Black hoodies"). Catalogue rows: unused. */
  rowLabel: string
  colour: string | null
  /** "" = any size. */
  size: string
}

/** Blank name → "<product> — <COLOUR> / <size>"; named → "<name> — <product>, <Colour> / <size>". */
export function pricerLineTitle(i: LineTitleInput): string {
  const name = named(i.groupName)
  if (i.supplied) return name ? `${name} — Customer-supplied, ${i.rowLabel}` : `Customer-supplied — ${i.rowLabel}`
  const sizePart = i.size ? ` / ${i.size}` : " (any size)"
  if (!name) return `${i.productTitle} — ${`${i.colour ?? ""}${sizePart}`.trim()}`
  const variant = `${tidyColour(i.colour ?? "")}${sizePart}`.trim()
  return `${name} — ${i.productTitle}${variant ? `, ${variant}` : ""}`
}

export function pricerGroupTitle(g: { groupName?: string | null; supplied: boolean; productTitle?: string | null }): string {
  const base = g.supplied ? "Customer-supplied garments" : g.productTitle || "Garment"
  const name = named(g.groupName)
  return name ? `${name} — ${base}` : base
}

/** "A" or "A — Bull (back)". */
export const pricerDesignLabel = (d: { label: string; name?: string | null }) => (named(d.name) ? `${d.label} — ${named(d.name)}` : d.label)

export type PositionLabelInput = {
  sideLabel: string
  method: "print" | "screen" | "embroidery"
  /** Print only: short channel name, null = our default full-colour print. */
  channelShort?: string | null
  sizeId?: ScpPrintSizeId
  colours?: number
  stitches?: number
  dark?: boolean
  design?: { label: string; name?: string | null } | null
}

/** "up to A6 (10×15 cm)" — the transfer size the customer is buying. */
export const printSizePhrase = (id: ScpPrintSizeId) => {
  const o = SCP_PRINT_SIZE_OPTIONS.find((x) => x.id === id)
  if (!o) return id
  return `${o.label.charAt(0).toLowerCase()}${o.label.slice(1)} (${o.dimensionsLabel})`
}

/** "Back: Full-colour print up to A3 (29×42 cm) (design A)" or "… — Bull (back)" when the design is named. */
export function pricerPositionSummary(p: PositionLabelInput): string {
  const body =
    p.method === "screen"
      ? `Screen print ${p.colours || 1} col${p.dark ? " + underbase" : ""}`
      : p.method === "embroidery"
        ? `Embroidery ${p.stitches || 0} st`
        : `${p.channelShort || "Full-colour print"} ${p.sizeId ? printSizePhrase(p.sizeId) : ""}`.trim()
  const name = named(p.design?.name)
  return `${p.sideLabel}: ${body} ${name ? `— ${name}` : `(design ${p.design?.label ?? "?"})`}`
}
