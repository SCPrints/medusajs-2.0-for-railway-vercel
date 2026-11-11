import { Section, Text, Button, Img } from "react-email"

import { Base, STYLES, NAVY } from "./base"

export const STAFF_SUGGESTION = "staff-suggestion"

export interface StaffSuggestionProps {
  suggestion: {
    message: string
    from: string
    pageUrl: string | null
    pageTitle: string | null
    screenshotUrl: string | null
  }
  preview?: string
}

export const isStaffSuggestionData = (data: any): data is StaffSuggestionProps =>
  typeof data?.suggestion?.message === "string" && typeof data?.suggestion?.from === "string"

export const StaffSuggestionEmail = ({ suggestion, preview }: StaffSuggestionProps) => (
  <Base preview={preview ?? `Suggestion from ${suggestion.from}`}>
    <Text style={STYLES.eyebrow}>Admin suggestion</Text>
    <Text style={STYLES.h1}>From {suggestion.from}</Text>
    <Text style={{ ...STYLES.body, whiteSpace: "pre-wrap" }}>{suggestion.message}</Text>

    {suggestion.pageUrl ? (
      <Text style={{ ...STYLES.meta, margin: "12px 0 0" }}>
        <strong style={{ color: NAVY }}>Page:</strong> {suggestion.pageTitle ? `${suggestion.pageTitle} — ` : ""}
        {suggestion.pageUrl}
      </Text>
    ) : null}

    {suggestion.screenshotUrl ? (
      <Section style={{ margin: "16px 0 0" }}>
        <Img src={suggestion.screenshotUrl} alt="Screenshot of the page" style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: "8px" }} />
        <Button href={suggestion.screenshotUrl} style={{ ...STYLES.buttonPrimary, marginTop: "12px" }}>
          Open full screenshot &rarr;
        </Button>
      </Section>
    ) : null}
  </Base>
)

export default StaffSuggestionEmail
