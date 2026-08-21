import { ulid } from "ulid"
import { z } from "zod"

/**
 * Shared schema + mapper for design lines written onto a quote's
 * `line_items.items` JSON. Two write paths use it:
 *  - /store/quotes/:id/design-items (staff "Design in Studio" relay)
 *  - /store/quotes/poa-request (customer POA auto-quote, >12k-stitch embroidery)
 * Both must persist the exact same line shape the admin Kanban and the
 * accept-route read (see design-items route header for the shape contract).
 */
export const quoteDesignLineSchema = z.object({
  line_id: z.string().max(80).optional(),
  kind: z.enum(["standard", "customizer"]).default("customizer"),
  variant_id: z.string().nullable(),
  product_id: z.string(),
  product_title: z.string().max(300),
  variant_title: z.string().max(300).nullable().optional(),
  quantity: z.number().int().min(1).max(100_000),
  unit_price_cents: z
    .number()
    .int()
    .min(0)
    .max(100_000_000)
    .nullable()
    .optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type QuoteDesignLineInput = z.infer<typeof quoteDesignLineSchema>

export function mapQuoteDesignLines(
  lines: QuoteDesignLineInput[],
  groupId: string
) {
  return lines.map((l) => {
    const md = (l.metadata ?? {}) as Record<string, any>
    const unit_price =
      typeof l.unit_price_cents === "number"
        ? Math.round(l.unit_price_cents) / 100
        : null
    const quantity = l.quantity
    const total =
      unit_price != null && quantity != null
        ? Math.round(unit_price * quantity * 100) / 100
        : null
    const title = `${l.product_title}${
      l.variant_title ? ` — ${l.variant_title}` : ""
    }`
    const design =
      md.customizerDesign && typeof md.customizerDesign === "object"
        ? md.customizerDesign
        : null
    // Prefer a rendered mockup as the admin thumbnail so the quote line shows
    // what the customer designed, not the blank garment.
    const thumbnail =
      (Array.isArray(design?.artifacts)
        ? design.artifacts.find((a: any) => a?.mockupUrl)?.mockupUrl
        : null) ?? null

    return {
      id: l.line_id || ulid(),
      title,
      description: null,
      quantity,
      unit_price,
      total,
      product_id: l.product_id,
      variant_id: l.variant_id,
      product_handle:
        typeof md.product_handle === "string" ? md.product_handle : null,
      thumbnail,
      customizerDesign: design,
      print_size_id:
        typeof md.print_size_id === "string" ? md.print_size_id : null,
      group_id: groupId,
      // NOTE: `kind` is intentionally NOT persisted — nothing reads it on a
      // quote, and the admin save round-trip (DraftLineItem) doesn't carry it,
      // so storing it here would make it vanish on the first edit. Keep the
      // persisted line shape consistent across both write paths.
    }
  })
}
