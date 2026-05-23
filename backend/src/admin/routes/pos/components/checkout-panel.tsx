import { Button, Heading, Input, Label, Select, Text, toast } from "@medusajs/ui"
import { useState } from "react"

import { HelpTooltip } from "../../../components/reports/help-tooltip"
import type {
  POSCheckoutResult,
  POSCustomer,
  POSDiscount,
  POSLineItem,
  POSRegion,
  POSSalesChannel,
} from "../types"
import { cartTotalCents, formatMoney } from "../utils"
import { CustomerLookup } from "./customer-lookup"

type Props = {
  sessionId: string
  items: POSLineItem[]
  region: POSRegion | null
  regions: POSRegion[]
  salesChannels: POSSalesChannel[]
  salesChannelId: string | null
  customer: POSCustomer | null
  walkInMode: boolean
  discount: POSDiscount
  onCustomerChange: (c: POSCustomer | null) => void
  onWalkInModeChange: (on: boolean) => void
  onDiscountChange: (next: POSDiscount) => void
  onRegionChange: (id: string) => void
  onSalesChannelChange: (id: string) => void
  onLoadLastOrder: () => void
  onParkSale: () => void
  onCheckoutSuccess: (result: POSCheckoutResult) => void
}

export const CheckoutPanel = ({
  sessionId,
  items,
  region,
  regions,
  salesChannels,
  salesChannelId,
  customer,
  walkInMode,
  discount,
  onCustomerChange,
  onWalkInModeChange,
  onDiscountChange,
  onRegionChange,
  onSalesChannelChange,
  onLoadLastOrder,
  onParkSale,
  onCheckoutSuccess,
}: Props) => {
  const [paying, setPaying] = useState<"cash" | "stripe_link" | null>(null)
  const [promoDraft, setPromoDraft] = useState("")
  const [discountDraft, setDiscountDraft] = useState<string>(() =>
    discount.manual_discount_cents
      ? (discount.manual_discount_cents / 100).toFixed(2)
      : ""
  )
  const currency = region?.currency_code.toUpperCase() ?? "AUD"
  const subtotal = cartTotalCents(items)
  const finalTotal = Math.max(0, subtotal - discount.manual_discount_cents)
  const customerReady = customer !== null || walkInMode
  const canCheckout = items.length > 0 && customerReady && Boolean(region)

  const addPromo = () => {
    const code = promoDraft.trim().toUpperCase()
    if (!code) return
    if (discount.promo_codes.includes(code)) return
    onDiscountChange({
      ...discount,
      promo_codes: [...discount.promo_codes, code],
    })
    setPromoDraft("")
  }

  const removePromo = (code: string) => {
    onDiscountChange({
      ...discount,
      promo_codes: discount.promo_codes.filter((c) => c !== code),
    })
  }

  const commitDiscount = () => {
    const parsed = Number(discountDraft)
    if (!Number.isFinite(parsed) || parsed < 0) {
      onDiscountChange({ ...discount, manual_discount_cents: 0 })
      return
    }
    onDiscountChange({
      ...discount,
      manual_discount_cents: Math.round(parsed * 100),
    })
  }

  const checkout = async (paymentMethod: "cash" | "stripe_link") => {
    if (!canCheckout) {
      toast.error("Add items and select a customer (or tick Walk-in)")
      return
    }
    setPaying(paymentMethod)
    try {
      const res = await fetch("/admin/pos/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pos_session_id: sessionId,
          items: items.map((it) => ({
            kind: it.kind,
            variant_id: it.variant_id,
            product_id: it.product_id,
            product_title: it.product_title,
            variant_title: it.variant_title,
            quantity: it.quantity,
            unit_price_cents: it.unit_price_cents,
            metadata: it.metadata,
          })),
          customer_id: customer?.id ?? null,
          email: customer?.email ?? null,
          region_id: region!.id,
          sales_channel_id: salesChannelId,
          currency_code: region!.currency_code,
          payment_method: paymentMethod,
          promo_codes: discount.promo_codes,
          discount_cents: discount.manual_discount_cents,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? `Checkout failed (${res.status})`)
      }
      const result = (await res.json()) as POSCheckoutResult
      onCheckoutSuccess(result)
    } catch (err: any) {
      toast.error(err?.message ?? "Checkout failed")
    } finally {
      setPaying(null)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-ui-border-base flex items-center justify-between">
        <Heading level="h2">Checkout</Heading>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="small" onClick={onParkSale}>
            Park sale
          </Button>
          <HelpTooltip
            text={{
              title: "Park sale",
              body: "Saves the current cart against the active session and opens a fresh empty session for the next walk-in. The parked sale appears in the ‘Parked (N)’ dropdown at the top of the page until you resume it.",
              bullets: [
                "Useful when a customer asks to think about it, or another walk-in interrupts mid-sale.",
                "Each staff member only sees their own parked sales.",
                "Parked sales auto-expire after 4 hours and tidy hourly so the picker stays clean.",
              ],
            }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-ui-fg-muted flex items-center">
              Customer
              <HelpTooltip
                text={{
                  title: "Customer or walk-in",
                  body: "Pick or create a customer to attach the order to their profile. Toggle ‘Walk-in’ for a true scan-and-go cash sale that doesn't need an email upfront.",
                  bullets: [
                    "With a customer: order counts toward their LTV, fires the customer-facing emails (order-placed, production stages), and a ‘Repeat last order’ button appears.",
                    "Walk-in: order lands against the configured walk-in inbox (default walkin@scprints.com.au). You can still email a receipt to the customer after payment from the receipt modal.",
                  ],
                }}
              />
            </Label>
            <button
              type="button"
              className="text-xs text-ui-fg-muted hover:underline"
              onClick={() => onWalkInModeChange(!walkInMode)}
            >
              {walkInMode ? "× Walk-in (no email)" : "+ Walk-in (no email)"}
            </button>
          </div>
          {walkInMode ? (
            <div className="border border-ui-border-base rounded-lg p-3 bg-ui-bg-subtle">
              <Text size="small" className="font-medium">
                Walk-in customer
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted">
                No email captured. Receipt can be emailed after checkout.
              </Text>
            </div>
          ) : (
            <>
              <CustomerLookup customer={customer} onSelect={onCustomerChange} />
              {customer && (
                <div className="flex items-center gap-1 mt-1">
                  <Button
                    variant="transparent"
                    size="small"
                    className="text-xs"
                    onClick={onLoadLastOrder}
                  >
                    Repeat last order
                  </Button>
                  <HelpTooltip
                    text={{
                      title: "Repeat last order",
                      body: "Pulls the line items from this customer's most recent non-cancelled order and appends them to the cart. Useful for regulars who walk in with ‘the usual’.",
                      bullets: [
                        "Standard items repeat as-is.",
                        "Custom designs are skipped (Fabric metadata can't be rebuilt server-side) — the success toast tells you how many were skipped.",
                        "Quantities + unit prices from the original order are preserved; you can still edit them in the cart.",
                      ],
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <Label className="text-xs text-ui-fg-muted mb-1 block">Region</Label>
          <Select value={region?.id ?? ""} onValueChange={onRegionChange}>
            <Select.Trigger>
              <Select.Value placeholder="Select region" />
            </Select.Trigger>
            <Select.Content>
              {regions.map((r) => (
                <Select.Item key={r.id} value={r.id}>
                  {r.name} ({r.currency_code.toUpperCase()})
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>

        {salesChannels.length > 0 && (
          <div>
            <Label className="text-xs text-ui-fg-muted mb-1 block">
              Sales channel
            </Label>
            <Select
              value={salesChannelId ?? ""}
              onValueChange={onSalesChannelChange}
            >
              <Select.Trigger>
                <Select.Value placeholder="Select sales channel" />
              </Select.Trigger>
              <Select.Content>
                {salesChannels.map((s) => (
                  <Select.Item key={s.id} value={s.id}>
                    {s.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        )}

        <div className="border-t border-ui-border-base pt-3">
          <Label className="text-xs text-ui-fg-muted mb-1 flex items-center">
            Promo codes
            <HelpTooltip
              text={{
                title: "Promo codes",
                body: "Apply any saved Medusa promotion (set up under Promotions in the admin). Multiple codes can stack — the promotion engine resolves overlaps using your existing precedence rules.",
                bullets: [
                  "Codes are uppercased on input and applied during checkout, not while typing.",
                  "Click a chip to remove a code before paying.",
                  "Codes that don't exist or aren't applicable to the cart will surface a validation error from Medusa when you click Pay.",
                ],
              }}
            />
          </Label>
          <div className="flex gap-1">
            <Input
              placeholder="CODE"
              value={promoDraft}
              onChange={(e) => setPromoDraft(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") addPromo()
              }}
            />
            <Button variant="secondary" size="small" onClick={addPromo}>
              Add
            </Button>
          </div>
          {discount.promo_codes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {discount.promo_codes.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="text-xs bg-ui-bg-subtle rounded px-2 py-1 hover:bg-ui-bg-base border border-ui-border-base"
                  onClick={() => removePromo(c)}
                >
                  {c} ×
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label className="text-xs text-ui-fg-muted mb-1 flex items-center">
            Manual discount ({currency})
            <HelpTooltip
              text={{
                title: "Manual discount",
                body: "An ad-hoc whole-of-sale markdown in dollars. Lands on the order as a transparent ‘Walk-in discount’ line with a negative price, so the original line prices stay intact for the bookkeeping audit.",
                bullets: [
                  "Different from a promo code — use this when there's no saved promotion that applies (e.g. ‘take $10 off because the print smudged’).",
                  "Stacks with promo codes; promo + manual discount can both apply to the same sale.",
                  "Total is clamped to never go below zero.",
                ],
              }}
            />
          </Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={discountDraft}
            onChange={(e) => setDiscountDraft(e.target.value)}
            onBlur={commitDiscount}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            }}
          />
        </div>
      </div>

      <div className="px-4 py-4 border-t border-ui-border-base bg-ui-bg-subtle">
        <div className="flex items-center justify-between mb-3">
          <Text size="base" className="font-semibold flex items-center">
            Total
            <HelpTooltip
              text={{
                title: "Payment options",
                body: "Both buttons create a real Medusa order with the studio's tax address attached so GST computes correctly. Pick the one matching what the customer is doing at the till.",
                bullets: [
                  "Pay cash — marks the order paid immediately. Receipt modal opens with the order number.",
                  "Card (QR link) — mints a Stripe Payment Link; the receipt modal shows a QR code the customer scans on their phone (Apple Pay / Google Pay / banking app). The modal polls Stripe and auto-flips to ‘Payment received’ when the webhook fires.",
                  "Cash payments are tagged ‘pos_cash’ in the payment-mix report so revenue buckets under Cash, not Stripe.",
                ],
              }}
            />
          </Text>
          <Heading level="h2">{formatMoney(finalTotal, currency)}</Heading>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            isLoading={paying === "cash"}
            disabled={!canCheckout || paying !== null}
            onClick={() => checkout("cash")}
          >
            Pay cash
          </Button>
          <Button
            variant="secondary"
            isLoading={paying === "stripe_link"}
            disabled={!canCheckout || paying !== null}
            onClick={() => checkout("stripe_link")}
          >
            Card (QR link)
          </Button>
        </div>
        {!canCheckout && (
          <Text size="xsmall" className="text-ui-fg-muted mt-2 text-center">
            {items.length === 0
              ? "Add items first"
              : !customerReady
                ? "Select a customer or tick Walk-in"
                : !region
                  ? "Select a region"
                  : ""}
          </Text>
        )}
      </div>
    </div>
  )
}
