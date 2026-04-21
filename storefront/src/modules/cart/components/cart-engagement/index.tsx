"use client"

import { Button, Text } from "@medusajs/ui"
import { HttpTypes } from "@medusajs/types"
import { useParams, useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import {
  SavedCartLineInput,
  deleteLineItem,
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

const CartEngagement = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode?: string | string[] }

  const normalizedCountryCode = Array.isArray(countryCode) ? countryCode[0] : countryCode
  const [isPending, startTransition] = useTransition()
  const [savedAtLabel, setSavedAtLabel] = useState<string | null>(null)
  const [savedItemCount, setSavedItemCount] = useState<number>(0)
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null)
  const [clearMessage, setClearMessage] = useState<string | null>(null)

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

  const handleClearCart = () => {
    const itemIds = (cart.items ?? []).map((item) => item.id).filter(Boolean)
    if (!itemIds.length) {
      setClearMessage("Your cart is already empty.")
      return
    }

    setClearMessage("Clearing your cart...")
    startTransition(async () => {
      try {
        await Promise.all(itemIds.map((id) => deleteLineItem(id)))
        setClearMessage("Your cart has been cleared.")
        router.refresh()
      } catch {
        setClearMessage("Could not clear your cart. Please try again.")
      }
    })
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
        <Text className="txt-compact-small-plus text-ui-fg-base">Clear cart</Text>
        <Text className="mt-2 text-sm text-ui-fg-subtle">
          Remove all items from this cart in one click.
        </Text>
        <div className="mt-4 flex">
          <Button
            type="button"
            variant="secondary"
            className="h-10"
            onClick={handleClearCart}
            disabled={isPending}
          >
            Clear cart
          </Button>
        </div>
        {clearMessage && <Text className="mt-3 text-xs text-ui-fg-subtle">{clearMessage}</Text>}
      </div>
    </div>
  )
}

export default CartEngagement
