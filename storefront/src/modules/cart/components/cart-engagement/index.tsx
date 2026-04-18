"use client"

import { Button, Input, Text } from "@medusajs/ui"
import { HttpTypes } from "@medusajs/types"
import { useParams, useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import {
  SavedCartLineInput,
  replaceCartWithSavedItems,
} from "@lib/data/cart"

const SAVED_CART_KEY = "scprints-saved-cart-v1"

type SavedCartPayload = {
  cart_id: string
  country_code: string
  saved_at: string
  item_count: number
  items: SavedCartLineInput[]
}

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const CartEngagement = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode?: string | string[] }

  const normalizedCountryCode = Array.isArray(countryCode) ? countryCode[0] : countryCode
  const [isPending, startTransition] = useTransition()
  const [savedAtLabel, setSavedAtLabel] = useState<string | null>(null)
  const [savedItemCount, setSavedItemCount] = useState<number>(0)
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null)
  const [email, setEmail] = useState(cart.email ?? "")
  const [followupMessage, setFollowupMessage] = useState<string | null>(null)
  const [isSubmittingFollowup, setIsSubmittingFollowup] = useState(false)

  const savedCartItems: SavedCartLineInput[] = useMemo(
    () =>
      (cart.items ?? [])
        .filter((item) => item.variant_id && item.quantity > 0)
        .map((item) => ({
          variant_id: item.variant_id!,
          quantity: item.quantity,
          metadata: item.metadata ?? {},
        })),
    [cart.items]
  )

  const handleSaveCart = () => {
    if (!savedCartItems.length || !normalizedCountryCode) {
      setRestoreMessage("There are no cart items to save yet.")
      return
    }

    const payload: SavedCartPayload = {
      cart_id: cart.id,
      country_code: normalizedCountryCode,
      saved_at: new Date().toISOString(),
      item_count: savedCartItems.reduce((sum, item) => sum + item.quantity, 0),
      items: savedCartItems,
    }

    localStorage.setItem(SAVED_CART_KEY, JSON.stringify(payload))

    const readableDate = new Date(payload.saved_at).toLocaleString()
    setSavedAtLabel(readableDate)
    setSavedItemCount(payload.item_count)
    setRestoreMessage(`Saved ${payload.item_count} item(s) on this device.`)
  }

  const handleRestoreCart = () => {
    const raw = localStorage.getItem(SAVED_CART_KEY)

    if (!raw) {
      setRestoreMessage("No saved cart found on this device.")
      return
    }

    let payload: SavedCartPayload | null = null

    try {
      payload = JSON.parse(raw) as SavedCartPayload
    } catch {
      setRestoreMessage("Saved cart data is invalid. Please save your cart again.")
      return
    }

    if (!payload?.items?.length || !payload.country_code) {
      setRestoreMessage("Saved cart is empty. Please save your cart again.")
      return
    }

    setRestoreMessage("Restoring saved cart...")

    startTransition(async () => {
      try {
        await replaceCartWithSavedItems({
          countryCode: payload!.country_code,
          items: payload!.items,
        })
        setRestoreMessage("Saved cart restored successfully.")
        router.refresh()
      } catch {
        setRestoreMessage("Could not restore saved cart. Please try again.")
      }
    })
  }

  const submitCartFollowup = async (notifyCustomer: boolean) => {
    const normalizedEmail = email.trim().toLowerCase()

    if (!isValidEmail(normalizedEmail)) {
      setFollowupMessage("Please enter a valid email for follow-up.")
      return
    }

    setIsSubmittingFollowup(true)
    setFollowupMessage(
      notifyCustomer ? "Sending cart reminder..." : "Submitting follow-up request..."
    )

    const items = (cart.items ?? []).map((item) => ({
      line_item_id: item.id,
      variant_id: item.variant_id,
      product_id: item.product_id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price ?? null,
      subtotal: item.subtotal ?? null,
    }))

    try {
      const response = await fetch("/api/abandoned-cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cart_id: cart.id,
          email: normalizedEmail,
          country_code: normalizedCountryCode ?? null,
          currency_code: cart.currency_code ?? null,
          cart_total: cart.total ?? null,
          item_count: items.reduce((sum, item) => sum + item.quantity, 0),
          items,
          notify_customer: notifyCustomer,
        }),
      })

      const body = await response.json().catch(() => null)

      if (!response.ok) {
        setFollowupMessage(body?.message ?? "Could not save follow-up request right now.")
        return
      }

      setFollowupMessage(
        body?.message ??
          (notifyCustomer
            ? "Cart saved and reminder email sent."
            : "We saved your cart for follow-up.")
      )
    } catch {
      setFollowupMessage("Could not save follow-up request right now.")
    } finally {
      setIsSubmittingFollowup(false)
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
        <Text className="txt-compact-small-plus text-ui-fg-base">Saved cart</Text>
        <Text className="mt-2 text-sm text-ui-fg-subtle">
          Save this cart on your current device and restore it later.
        </Text>
        {savedAtLabel && (
          <Text className="mt-2 text-xs text-ui-fg-subtle">
            Last saved: {savedAtLabel} ({savedItemCount} item(s))
          </Text>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-9"
            onClick={handleSaveCart}
            disabled={isPending}
          >
            Save cart
          </Button>
          <Button
            type="button"
            variant="transparent"
            className="h-9"
            onClick={handleRestoreCart}
            disabled={isPending}
          >
            Restore saved cart
          </Button>
        </div>
        {restoreMessage && <Text className="mt-3 text-xs text-ui-fg-subtle">{restoreMessage}</Text>}
      </div>

      <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
        <Text className="txt-compact-small-plus text-ui-fg-base">Abandoned-cart follow-up</Text>
        <Text className="mt-2 text-sm text-ui-fg-subtle">
          Share your email and we will keep a record of this cart for follow-up.
        </Text>
        <div className="mt-4 flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
          <Button
            type="button"
            className="h-10 shrink-0"
            onClick={() => submitCartFollowup(false)}
            disabled={isSubmittingFollowup}
          >
            Save follow-up
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-10 shrink-0"
            onClick={() => submitCartFollowup(true)}
            disabled={isSubmittingFollowup}
          >
            Email me this cart
          </Button>
        </div>
        {followupMessage && (
          <Text className="mt-3 text-xs text-ui-fg-subtle">{followupMessage}</Text>
        )}
      </div>
    </div>
  )
}

export default CartEngagement
