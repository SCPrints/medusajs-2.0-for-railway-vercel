import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { HelpTooltip } from "../components/reports/help-tooltip"
import { withWidgetBoundary } from "../components/widget-error-boundary"

type Order = {
  id: string
  email?: string | null
  display_id?: string | number
}

type PaymentState = {
  total: number
  paid_total: number | null
  balance_due: number | null
  due_at: string | null
  currency_code: string
}

const fmtMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(value)

const OrderEmailInvoiceWidget = ({ data: order }: { data: Order }) => {
  const orderId = order?.id
  const [email, setEmail] = useState(order?.email ?? "")
  const [sending, setSending] = useState(false)
  const [pay, setPay] = useState<PaymentState | null>(null)
  const [amount, setAmount] = useState("")
  const [reference, setReference] = useState("")
  const [method, setMethod] = useState<"bank_transfer" | "cash" | "other">(
    "bank_transfer"
  )
  const [recording, setRecording] = useState(false)

  const loadPaymentState = useCallback(async () => {
    if (!orderId) return
    try {
      const res = await fetch(`/admin/orders/${orderId}/record-payment`, {
        credentials: "include",
      })
      if (!res.ok) return
      const json = (await res.json()) as PaymentState
      setPay(json)
      if (typeof json.balance_due === "number" && json.balance_due > 0) {
        setAmount(json.balance_due.toFixed(2))
      }
    } catch {
      /* widget stays send-only if the state fetch fails */
    }
  }, [orderId])

  useEffect(() => {
    loadPaymentState()
  }, [loadPaymentState])

  const recordPayment = async () => {
    if (!orderId || !pay) return
    const amountNum = Number.parseFloat(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Enter a valid amount")
      return
    }
    const label = method.replace("_", " ")
    if (
      !window.confirm(
        `Record ${fmtMoney(amountNum, pay.currency_code)} received via ${label}? This marks the amount as paid on the order.`
      )
    ) {
      return
    }
    setRecording(true)
    try {
      const res = await fetch(`/admin/orders/${orderId}/record-payment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: Math.round(amountNum * 100),
          method,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to record payment")
      toast.success(`Payment recorded — ${fmtMoney(amountNum, pay.currency_code)}`)
      setReference("")
      await loadPaymentState()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to record payment")
    } finally {
      setRecording(false)
    }
  }

  const viewInvoice = () => {
    if (!orderId) return
    window.open(
      `/admin/orders/${orderId}/invoice-pdf`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  const send = async () => {
    if (!orderId) return
    setSending(true)
    try {
      const res = await fetch(`/admin/orders/${orderId}/email-invoice`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email.trim() ? { email: email.trim() } : {}),
      })
      const json = (await res.json().catch(() => ({}))) as {
        to?: string[]
        failed?: Array<{ to: string; error: string }>
        error?: string
      }
      if (!res.ok) throw new Error(json.error ?? "Failed to send")
      const sentTo = json.to?.join(", ") ?? email
      if (json.failed && json.failed.length > 0) {
        toast.warning(
          `Sent to ${sentTo} — failed for ${json.failed.map((f) => f.to).join(", ")}`
        )
      } else {
        toast.success(`Tax invoice emailed to ${sentTo}`)
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send invoice")
    } finally {
      setSending(false)
    }
  }

  if (!orderId) return null

  return (
    <Container className="p-0">
      <div className="px-6 py-4 flex items-center justify-between">
        <Heading level="h2" className="flex items-center">
          Tax invoice
          <HelpTooltip
            text={{
              title: "Email the tax invoice",
              body: "Re-sends the branded tax-invoice PDF to the customer. The same invoice is also attached to the order-placed confirmation automatically — use this when they never received it, gave the wrong address, or need another copy.",
              bullets: [
                "Defaults to the order's email; edit the field to send elsewhere.",
                "Multiple recipients: separate addresses with commas.",
                "Every send is logged on the order's activity/audit trail.",
              ],
            }}
          />
        </Heading>
      </div>

      {pay && typeof pay.balance_due === "number" ? (
        <div className="px-6 pb-3 flex flex-col gap-y-2 border-b border-ui-border-base mb-3">
          <div className="flex items-center justify-between">
            <Text className="text-ui-fg-subtle text-sm">
              Paid {fmtMoney(pay.paid_total ?? 0, pay.currency_code)} of{" "}
              {fmtMoney(pay.total, pay.currency_code)}
            </Text>
            {pay.balance_due <= 0.005 ? (
              <Badge color="green" size="xsmall">
                Paid in full
              </Badge>
            ) : (
              <Badge color="orange" size="xsmall">
                {fmtMoney(pay.balance_due, pay.currency_code)} due
                {pay.due_at
                  ? ` by ${new Date(pay.due_at).toLocaleDateString("en-AU")}`
                  : ""}
              </Badge>
            )}
          </div>
          {pay.balance_due > 0.005 ? (
            <>
              <div className="flex gap-x-2">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={recording}
                  placeholder="Amount"
                />
                <select
                  className="txt-compact-small rounded-md border border-ui-border-base bg-ui-bg-field px-2"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                  disabled={recording}
                >
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <Input
                type="text"
                value={reference}
                placeholder="Reference (optional, e.g. EFT receipt no)"
                onChange={(e) => setReference(e.target.value)}
                disabled={recording}
              />
              <Button
                variant="secondary"
                onClick={recordPayment}
                isLoading={recording}
                disabled={recording}
              >
                Record payment received
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="px-6 pb-4 flex flex-col gap-y-2">
        <Button variant="secondary" onClick={viewInvoice} disabled={sending}>
          View invoice (PDF)
        </Button>
        <Input
          type="text"
          value={email}
          placeholder="customer@example.com, accounts@example.com"
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
        />
        <Button
          variant="primary"
          onClick={send}
          isLoading={sending}
          disabled={sending}
        >
          Email tax invoice
        </Button>
        {!order?.email ? (
          <Text className="text-ui-fg-muted text-xs">
            This order has no email on file — enter one above to send.
          </Text>
        ) : null}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default withWidgetBoundary(OrderEmailInvoiceWidget, "order-email-invoice")
