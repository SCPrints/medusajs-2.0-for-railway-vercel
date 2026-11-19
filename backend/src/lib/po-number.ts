/**
 * Customer purchase-order number. Checkout writes `cart.metadata.po_number`;
 * completeCartWorkflow copies cart metadata onto the order and the
 * order-placed-stamp-po-number subscriber writes the cleaned value. Pure (no
 * @medusajs/framework import) so the admin bundle can use it too.
 */
export const PO_NUMBER_MAX_LENGTH = 60

/** Trim, drop control / invisible characters, cap at 60. null when empty. */
export function cleanPoNumber(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null
  const cleaned = String(raw)
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PO_NUMBER_MAX_LENGTH)
    .trim()
  return cleaned || null
}

export const poNumberFromMetadata = (meta: unknown): string | null =>
  meta && typeof meta === "object" ? cleanPoNumber((meta as Record<string, unknown>).po_number) : null

/**
 * The order's PO number, falling back to its cart: the order.placed emails
 * and invoice PDF run alongside the stamp subscriber, so the order row may
 * not carry the cleaned value yet.
 */
export async function resolveOrderPoNumber(
  container: { resolve: (key: string) => unknown },
  orderId: string,
  orderMeta?: unknown
): Promise<string | null> {
  const own = poNumberFromMetadata(orderMeta)
  if (own) return own
  try {
    const query = container.resolve("query") as {
      graph: (q: Record<string, unknown>) => Promise<{ data?: any[] }>
    }
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: ["id", "cart_id", "metadata"],
    })
    const order = orders?.[0]
    const fromOrder = poNumberFromMetadata(order?.metadata)
    if (fromOrder || !order?.cart_id) return fromOrder
    const { data: carts } = await query.graph({
      entity: "cart",
      filters: { id: order.cart_id },
      fields: ["id", "metadata"],
    })
    return poNumberFromMetadata(carts?.[0]?.metadata)
  } catch {
    return null
  }
}
