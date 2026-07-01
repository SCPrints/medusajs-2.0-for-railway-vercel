import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useState } from "react"

import { HelpTooltip } from "../components/reports/help-tooltip"
import { withWidgetBoundary } from "../components/widget-error-boundary"

type Order = {
  id: string
  email?: string | null
  display_id?: string | number
}

const OrderEmailInvoiceWidget = ({ data: order }: { data: Order }) => {
  const orderId = order?.id
  const [email, setEmail] = useState(order?.email ?? "")
  const [sending, setSending] = useState(false)

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
        to?: string
        error?: string
      }
      if (!res.ok) throw new Error(json.error ?? "Failed to send")
      toast.success(`Tax invoice emailed to ${json.to ?? email}`)
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
                "Every send is logged on the order's activity/audit trail.",
              ],
            }}
          />
        </Heading>
      </div>

      <div className="px-6 pb-4 flex flex-col gap-y-2">
        <Input
          type="email"
          value={email}
          placeholder="customer@example.com"
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
        />
        <Button
          variant="secondary"
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
