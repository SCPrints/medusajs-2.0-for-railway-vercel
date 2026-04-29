import type { HttpTypes } from "@medusajs/types"

/** Cart may include gift_cards from API though types omit it in some SDK versions. */
function paidByGiftcard(cart: HttpTypes.StoreCart): boolean {
  const giftCards = (
    cart as HttpTypes.StoreCart & { gift_cards?: unknown[] | null }
  ).gift_cards
  return Boolean(giftCards && giftCards.length > 0 && cart.total === 0)
}

export type VerticalTimelineStep = {
  id: string
  label: string
  state: "complete" | "current" | "upcoming"
}

export type CheckoutUrlStep =
  | "address"
  | "delivery"
  | "payment"
  | "review"

export function normalizeCheckoutStep(
  cart: HttpTypes.StoreCart,
  raw: string | null
): CheckoutUrlStep {
  const addressDone = Boolean(
    cart.shipping_address?.address_1 && cart.email
  )
  const deliveryDone = (cart.shipping_methods?.length ?? 0) > 0
  const paymentDone = Boolean(
    cart.payment_collection || paidByGiftcard(cart)
  )

  const suggested = (): CheckoutUrlStep => {
    if (!addressDone) return "address"
    if (!deliveryDone) return "delivery"
    if (!paymentDone) return "payment"
    return "review"
  }

  const fallback = suggested()
  if (!raw) return fallback
  if (
    raw !== "address" &&
    raw !== "delivery" &&
    raw !== "payment" &&
    raw !== "review"
  ) {
    return fallback
  }

  const url = raw as CheckoutUrlStep
  if (url === "address") return "address"
  if (url === "delivery") return addressDone ? "delivery" : fallback
  if (url === "payment") {
    return addressDone && deliveryDone ? "payment" : fallback
  }
  if (url === "review") {
    return addressDone && deliveryDone && paymentDone ? "review" : fallback
  }
  return fallback
}

export function buildCheckoutProgressSteps(
  cart: HttpTypes.StoreCart,
  rawStep: string | null
): VerticalTimelineStep[] {
  const current = normalizeCheckoutStep(cart, rawStep)

  const addressDone = Boolean(
    cart.shipping_address?.address_1 && cart.email
  )
  const deliveryDone = (cart.shipping_methods?.length ?? 0) > 0
  const paymentDone = Boolean(
    cart.payment_collection || paidByGiftcard(cart)
  )

  const milestones = [
    { id: "address" as const, label: "Shipping address", done: addressDone },
    { id: "delivery" as const, label: "Delivery", done: deliveryDone },
    { id: "payment" as const, label: "Payment", done: paymentDone },
    { id: "review" as const, label: "Review", done: false },
  ]

  return milestones.map((m) => {
    const state: VerticalTimelineStep["state"] =
      m.id === current ? "current" : m.done ? "complete" : "upcoming"
    return { id: m.id, label: m.label, state }
  })
}

/** Illustrative post-dispatch journey — not live order data. */
export const FULFILLMENT_PREVIEW_STEPS: VerticalTimelineStep[] = [
  { id: "ordered", label: "Ordered", state: "complete" },
  { id: "shipped", label: "Shipped", state: "complete" },
  { id: "transit", label: "In transit", state: "current" },
  { id: "delivered", label: "Delivered", state: "upcoming" },
]
