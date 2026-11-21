import { Button, Column, Hr, Img, Row, Section, Text } from "react-email"

import { Base, STYLES } from "./base"

export const REORDER_REMINDER = "reorder-reminder"

export interface ReorderReminderEmailProps {
  reminder: {
    firstName: string | null
    lastOrderDisplayId: number | null
    daysSinceLast: number
    medianGapDays: number
    /** What they ordered that time. No prices: they are worked out again on re-order. */
    lines: Array<{ title: string; quantity: number; thumbnail: string | null }>
    reorderUrl: string | null
  }
  preview?: string
  unsubscribeUrl?: string
}

export const isReorderReminderData = (
  data: any
): data is ReorderReminderEmailProps =>
  typeof data?.reminder === "object" &&
  typeof data?.reminder?.daysSinceLast === "number"

export const ReorderReminderEmail = ({
  reminder,
  preview,
  unsubscribeUrl,
}: ReorderReminderEmailProps) => {
  const greeting = reminder.firstName ? `Hey ${reminder.firstName},` : "Hey,"
  const previewText =
    preview ??
    `It's been about ${Math.round(reminder.daysSinceLast)} days since your last SC Prints order — fancy a reorder?`

  return (
    <Base preview={previewText} unsubscribeUrl={unsubscribeUrl}>
      <Text style={STYLES.eyebrow}>Time for another run?</Text>
      <Text style={STYLES.h1}>{greeting}</Text>
      <Text style={STYLES.body}>
        It&apos;s been about {Math.round(reminder.daysSinceLast)} days since
        your last SC Prints order
        {reminder.lastOrderDisplayId
          ? ` (#${reminder.lastOrderDisplayId})`
          : ""}
        .
        {reminder.daysSinceLast >= reminder.medianGapDays
          ? ` That's around when you usually come back —`
          : ""}{" "}
        if you&apos;re due for another, we&apos;ve got everything saved on
        file. You&apos;ll sign in and can set your sizes before you pay.
      </Text>

      {reminder.lines.length ? (
        <Section style={{ margin: "16px 0 0" }}>
          <Text style={{ ...STYLES.meta, margin: "0 0 8px" }}>Last time you ordered</Text>
          {reminder.lines.map((l, i) => (
            <Row key={i} style={{ margin: "0 0 8px" }}>
              {l.thumbnail ? (
                <Column style={{ width: "56px" }}>
                  <Img src={l.thumbnail} width="48" height="48" alt="" style={{ borderRadius: "6px" }} />
                </Column>
              ) : null}
              <Column>
                <Text style={{ ...STYLES.body, margin: 0 }}>
                  {l.title} &times; {l.quantity}
                </Text>
              </Column>
            </Row>
          ))}
        </Section>
      ) : null}

      {reminder.reorderUrl ? (
        <Section style={{ margin: "24px 0 0" }}>
          <Button href={reminder.reorderUrl} style={STYLES.buttonPrimary}>
            Order again &rarr;
          </Button>
        </Section>
      ) : null}

      <Hr style={STYLES.divider} />

      <Text style={STYLES.meta}>
        You&apos;re getting this because you&apos;ve ordered from us before. Reply with
        &ldquo;stop reorder reminders&rdquo; if you&apos;d rather we
        didn&apos;t.
      </Text>
    </Base>
  )
}

export default ReorderReminderEmail
