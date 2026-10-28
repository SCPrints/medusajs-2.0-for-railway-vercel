/**
 * Line shape shared by the non-cart destinations (POS, quote, price on
 * application): one line per (variant × quantity) cell of the finished design.
 */
export type DesignCell = {
  variant: { id: string; title?: string | null; calculated_price?: { calculated_amount?: number | string | null } | null }
  size?: string
  quantity: number
}

export type DesignProduct = { id: string; handle?: string | null; title?: string | null }

export type DesignLine = {
  kind: "customizer"
  variant_id: string
  product_id: string
  product_title: string
  variant_title: string | undefined
  quantity: number
  unit_price_cents: number | null
  metadata: Record<string, unknown>
}

/** Catalog garment price in cents (null when the variant has no usable price). */
export const variantPriceCents = (cell: DesignCell): number | null => {
  const raw = cell.variant.calculated_price?.calculated_amount
  const amount = typeof raw === "number" ? raw : Number(raw ?? 0)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null
}

export const designLine = (input: {
  cell: DesignCell
  product: DesignProduct
  printSizeId: string
  unitPriceCents: number | null
  /** Extra line metadata (e.g. the sanitized design for POS lines). */
  metadata?: Record<string, unknown>
}): DesignLine => ({
  kind: "customizer",
  variant_id: input.cell.variant.id,
  product_id: input.product.id,
  product_title: input.product.title ?? "Custom design",
  variant_title: input.cell.variant.title ?? input.cell.size,
  quantity: input.cell.quantity,
  unit_price_cents: input.unitPriceCents,
  metadata: {
    ...(input.metadata ?? {}),
    product_handle: input.product.handle ?? undefined,
    product_title: input.product.title ?? undefined,
    print_size_id: input.printSizeId,
  },
})

/** Fresh design-group id (staff "Edit design in Studio" replaces a group as a unit). */
export const newQuoteGroupId = () =>
  `qg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

/** Throw the server's message (or `fallback`) when a response isn't ok. */
export async function assertOk(res: Response, fallback: string): Promise<any> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.message ?? body?.error ?? `${fallback} (${res.status})`)
  return body
}
