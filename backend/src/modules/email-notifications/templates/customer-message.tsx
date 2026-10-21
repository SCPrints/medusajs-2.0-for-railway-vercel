import { Text } from "@react-email/components"

import { Base, STYLES } from "./base"

export const CUSTOMER_MESSAGE = "customer-message"

/** A plain message a staff member writes to the customer from the Job page. */
export interface CustomerMessageProps {
  message: {
    body: string
    signature: string | null
  }
  preview?: string
}

export const isCustomerMessageData = (data: any): data is CustomerMessageProps =>
  typeof data?.message === "object" && typeof data?.message?.body === "string"

export const CustomerMessageEmail = ({ message, preview }: CustomerMessageProps) => (
  <Base preview={preview ?? message.body.slice(0, 120)}>
    <Text style={{ ...STYLES.body, whiteSpace: "pre-wrap" }}>{message.body}</Text>
    {message.signature ? (
      <Text style={{ ...STYLES.meta, whiteSpace: "pre-wrap", margin: "20px 0 0" }}>{message.signature}</Text>
    ) : null}
  </Base>
)

export default CustomerMessageEmail
