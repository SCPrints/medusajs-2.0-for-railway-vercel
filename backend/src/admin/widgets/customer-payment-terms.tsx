import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Heading, Input, Label, toast } from "@medusajs/ui"
import { useState } from "react"

import { HelpTooltip } from "../components/reports/help-tooltip"
import { withWidgetBoundary } from "../components/widget-error-boundary"

type CustomerData = {
  id: string
  metadata?: Record<string, unknown> | null
}

/**
 * B2B payment terms (days). Read by the quote → order conversion, which
 * stamps `order.metadata.balance_due_at = now + terms` so the tax invoice
 * prints "Due by …" and the receivables report can age the debt.
 */
const CustomerPaymentTermsWidget = ({ data: customer }: { data: CustomerData }) => {
  const customerId = customer?.id
  const meta = (customer?.metadata ?? {}) as Record<string, unknown>
  const initial =
    typeof meta.payment_terms_days === "number"
      ? String(meta.payment_terms_days)
      : typeof meta.payment_terms_days === "string"
        ? meta.payment_terms_days
        : ""
  const [terms, setTerms] = useState(initial)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!customerId) return
    const n = Number.parseInt(terms, 10)
    const value = Number.isFinite(n) && n > 0 ? n : null
    if (terms.trim() && value === null) {
      toast.error("Terms must be a positive number of days")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/admin/customers/${customerId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: { ...meta, payment_terms_days: value },
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(value ? `Terms saved — ${value} days` : "Terms cleared")
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (!customerId) return null
  const current = Number.parseInt(initial, 10)

  return (
    <Container className="p-0">
      <div className="px-6 py-4 flex items-center justify-between">
        <Heading level="h2" className="flex items-center">
          Payment terms
          <HelpTooltip
            text={{
              title: "On-account payment terms",
              body: "Give a B2B customer (school, club, business) payment terms. When staff convert a quote to an order, the invoice due date is stamped automatically (order date + terms) and printed on the tax invoice next to the bank-transfer details.",
              bullets: [
                "Leave empty for prepaid customers — no due date is stamped.",
                "Common values: 7, 14, 30.",
                "Per-order override: edit balance_due_at via the deposit widget on the order.",
              ],
            }}
          />
        </Heading>
        {Number.isFinite(current) && current > 0 ? (
          <Badge color="blue">Net {current}</Badge>
        ) : (
          <Badge color="grey">Prepaid</Badge>
        )}
      </div>
      <div className="px-6 pb-4">
        <Label size="xsmall">Days until payment is due</Label>
        <Input
          type="number"
          min={0}
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          onBlur={save}
          placeholder="e.g. 14"
          disabled={saving}
        />
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.side.after",
})

export default withWidgetBoundary(
  CustomerPaymentTermsWidget,
  "customer-payment-terms"
)
