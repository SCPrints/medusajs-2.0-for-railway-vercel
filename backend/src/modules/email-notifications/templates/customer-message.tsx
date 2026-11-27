import { Button, Section, Text } from "react-email"

import { Base, STYLES } from "./base"

export const CUSTOMER_MESSAGE = "customer-message"

/** A plain message a staff member writes to the customer from the Job page. */
export interface CustomerMessageProps {
  message: {
    body: string
    /** One button under the body, for emails whose whole point is a link (no raw URL in the text). */
    button?: { label: string; url: string } | null
    /** Small print under the button. */
    footnote?: string | null
    signature: string | null
  }
  preview?: string
}

export const isCustomerMessageData = (data: any): data is CustomerMessageProps =>
  typeof data?.message === "object" && typeof data?.message?.body === "string"

export const CustomerMessageEmail = ({ message, preview }: CustomerMessageProps) => (
  <Base preview={preview ?? message.body.slice(0, 120)}>
    <Text style={{ ...STYLES.body, whiteSpace: "pre-wrap" }}>{message.body}</Text>
    {message.button ? (
      <Section style={{ margin: "24px 0 0", textAlign: "center" }}>
        <Button href={message.button.url} style={STYLES.buttonPrimary}>
          {message.button.label}
        </Button>
      </Section>
    ) : null}
    {message.footnote ? (
      <Text style={{ ...STYLES.meta, whiteSpace: "pre-wrap", margin: "20px 0 0" }}>{message.footnote}</Text>
    ) : null}
    {message.signature ? (
      <Text style={{ ...STYLES.meta, whiteSpace: "pre-wrap", margin: "20px 0 0" }}>{message.signature}</Text>
    ) : null}
  </Base>
)

export default CustomerMessageEmail
