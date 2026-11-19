import type { CustomerQuoteLine } from "../../lib/customer-quotes"
import type { QuoteDecoration } from "../../lib/quote-decorations"
import { longDate, money, type DocSpec } from "./pdf"

export const CART_QUOTE_VALID_DAYS = 30

export type CartQuoteDocInput = {
  publicId: string
  issuedAt: Date
  currency: string
  /** Customer / organisation lines for the "For" block. */
  to: string[]
  poNumber: string | null
  lines: CustomerQuoteLine[]
  decorations: QuoteDecoration[]
  shipping: { name: string; amount: number } | null
  discount: number
  total: number
  /** GST inside the total. */
  gst: number
}

const priceRange = (l: CustomerQuoteLine, currency: string) =>
  l.unit_price == null
    ? ""
    : l.unit_price_max != null && l.unit_price_max > l.unit_price
    ? `${money(l.unit_price, currency)} – ${money(l.unit_price_max, currency)}`
    : money(l.unit_price, currency)

/** The formal quote a customer downloads from their cart. Pure layout data — unit-tested. */
export function cartQuoteDoc(input: CartQuoteDocInput): DocSpec {
  const { currency } = input
  const validUntil = new Date(input.issuedAt.getTime() + CART_QUOTE_VALID_DAYS * 86_400_000)
  const itemsTotal = input.lines.reduce((s, l) => s + (l.total ?? 0), 0)
  return {
    title: "Quote",
    subtitle: `${input.publicId}  ·  ${longDate(input.issuedAt)}`,
    to: input.to,
    facts: [
      ["Valid for", `${CART_QUOTE_VALID_DAYS} days (until ${longDate(validUntil)})`],
      ...(input.poNumber ? ([["PO number", input.poNumber]] as Array<[string, string]>) : []),
    ],
    tables: [
      {
        columns: [
          { label: "Item", width: 0.44 },
          { label: "Sizes", width: 0.2 },
          { label: "Qty", width: 0.08, align: "right" },
          { label: "Unit", width: 0.14, align: "right" },
          { label: "Total", width: 0.14, align: "right" },
        ],
        rows: input.lines.map((l) => {
          const decorations = input.decorations
            .filter((d) => d.garment && (d.garment === l.title || l.title.startsWith(d.garment)))
            .map((d) => `${d.side_label}: ${d.method}${d.detail ? `, ${d.detail}` : ""}`)
          return [
            [l.title, l.description, ...decorations].filter(Boolean).join("\n"),
            l.sizes ?? "",
            String(l.quantity),
            priceRange(l, currency),
            money(l.total, currency),
          ]
        }),
      },
    ],
    totals: [
      { label: "Items", value: money(itemsTotal, currency) },
      ...(input.discount > 0 ? [{ label: "Discount", value: `−${money(input.discount, currency)}` }] : []),
      ...(input.shipping ? [{ label: input.shipping.name || "Shipping", value: money(input.shipping.amount, currency) }] : []),
      { label: "Total (inc GST)", value: money(input.total, currency), bold: true },
      { label: "Includes GST of", value: money(input.gst, currency) },
    ],
    notes: [
      "All prices include GST.",
      ...(input.shipping ? [] : ["Shipping is not included. It is worked out from your delivery address at checkout."]),
      `This quote is valid for ${CART_QUOTE_VALID_DAYS} days. To go ahead, check out on scprints.com.au or reply to info@scprints.com.au with the quote number.`,
      "Artwork is checked before printing. If it needs changes we will tell you first.",
    ],
  }
}
