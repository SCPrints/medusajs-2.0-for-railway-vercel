/**
 * Task filter for a job. A converted job keeps the tasks raised while it was
 * still a quote (anchored on quote_id only), so match either id.
 */
export function jobTaskFilter(orderId: string | null, quoteId: string | null) {
  const status = ["open", "in_progress"]
  if (orderId && quoteId) {
    return { $or: [{ order_id: orderId }, { quote_id: quoteId }], status }
  }
  return { ...(orderId ? { order_id: orderId } : { quote_id: quoteId }), status }
}
