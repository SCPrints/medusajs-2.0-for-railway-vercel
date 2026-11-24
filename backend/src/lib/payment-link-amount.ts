/**
 * What a one-click payment link (job "Send payment link", Chase) should charge.
 * Pure, admin-safe. A job with an unpaid deposit asks for the deposit only;
 * before 24 Nov 2026 both buttons asked for the whole order.
 */
export type PaymentLinkMoney = {
  /** Dollars still owing on the order. */
  outstanding: number | null
  deposit_required_cents?: number | null
  deposit_paid?: boolean | null
}

export function paymentLinkAmount(
  m: PaymentLinkMoney,
  displayId: number | null
): { amount_cents: number; scenario: "deposit" | "balance" | "full"; label: string } | null {
  const owing = Math.round((m.outstanding ?? 0) * 100)
  const deposit = Math.max(0, Math.round(m.deposit_required_cents ?? 0))
  const order = `Order #${displayId ?? ""}`.trim()
  if (deposit > 0 && !m.deposit_paid) {
    const cents = Math.min(deposit, owing)
    return cents >= 50 ? { amount_cents: cents, scenario: "deposit", label: `Deposit — ${order}` } : null
  }
  if (owing < 50) return null
  return deposit > 0
    ? { amount_cents: owing, scenario: "balance", label: `Balance — ${order}` }
    : { amount_cents: owing, scenario: "full", label: order }
}
