import { Hr, Section, Text } from "@react-email/components"

import { Base } from "./base"

export const CART_REMINDER = "cart-reminder"

type CartReminderItem = {
  title?: string | null
  quantity?: number | null
}

export interface CartReminderEmailProps {
  reminder: {
    cartId: string
    email: string
    itemCount: number
    currencyCode?: string | null
    cartTotal?: number | null
    countryCode?: string | null
    items?: CartReminderItem[]
  }
  preview?: string
}

export const isCartReminderData = (data: any): data is CartReminderEmailProps =>
  typeof data?.reminder === "object" &&
  typeof data?.reminder?.cartId === "string" &&
  typeof data?.reminder?.email === "string"

export const CartReminderEmail = ({
  reminder,
  preview = "Your cart is saved and ready when you are.",
}: CartReminderEmailProps) => {
  const formattedCurrencyTotal =
    typeof reminder.cartTotal === "number"
      ? `${(reminder.cartTotal / 100).toFixed(2)} ${String(reminder.currencyCode ?? "").toUpperCase()}`
      : "Unavailable"

  return (
    <Base preview={preview}>
      <Section>
        <Text style={{ fontSize: "24px", fontWeight: "bold", margin: "0 0 18px" }}>
          Your SC PRINTS Cart Reminder
        </Text>

        <Text style={{ margin: "0 0 8px" }}>
          We have saved your request to follow up on this cart.
        </Text>
        <Text style={{ margin: "0 0 8px" }}>
          <strong>Cart ID:</strong> {reminder.cartId}
        </Text>
        <Text style={{ margin: "0 0 8px" }}>
          <strong>Email:</strong> {reminder.email}
        </Text>
        <Text style={{ margin: "0 0 8px" }}>
          <strong>Items:</strong> {reminder.itemCount}
        </Text>
        <Text style={{ margin: "0 0 8px" }}>
          <strong>Estimated total:</strong> {formattedCurrencyTotal}
        </Text>
        <Text style={{ margin: "0 0 8px" }}>
          <strong>Country:</strong> {reminder.countryCode ?? "Unknown"}
        </Text>

        <Hr style={{ margin: "18px 0" }} />

        <Text style={{ fontWeight: "bold", margin: "0 0 6px" }}>Cart items</Text>
        {(reminder.items ?? []).slice(0, 8).map((item, index) => (
          <Text key={`${item.title ?? "item"}-${index}`} style={{ margin: "0 0 4px" }}>
            • {item.title || "Product"} x {item.quantity ?? 0}
          </Text>
        ))}

        <Hr style={{ margin: "18px 0" }} />

        <Text style={{ margin: "0" }}>
          Reply to this email if you would like help finalizing your order.
        </Text>
      </Section>
    </Base>
  )
}

export default CartReminderEmail
