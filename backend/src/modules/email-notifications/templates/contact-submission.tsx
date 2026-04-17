import { Hr, Section, Text } from "@react-email/components"
import { Base } from "./base"

export const CONTACT_SUBMISSION = "contact-submission"

export interface ContactSubmissionEmailData {
  id: string
  firstName?: string | null
  lastName?: string | null
  email: string
  subject?: string | null
  message: string
  sourceOrigin?: string | null
  sourceIp?: string | null
  userAgent?: string | null
}

export interface ContactSubmissionEmailProps {
  submission: ContactSubmissionEmailData
  preview?: string
}

export const isContactSubmissionData = (data: any): data is ContactSubmissionEmailProps =>
  typeof data?.submission === "object" &&
  typeof data?.submission?.id === "string" &&
  typeof data?.submission?.email === "string" &&
  typeof data?.submission?.message === "string"

export const ContactSubmissionEmail = ({
  submission,
  preview = "A new contact form submission was received.",
}: ContactSubmissionEmailProps) => {
  const senderName = [submission.firstName, submission.lastName].filter(Boolean).join(" ").trim()

  return (
    <Base preview={preview}>
      <Section>
        <Text style={{ fontSize: "24px", fontWeight: "bold", margin: "0 0 18px" }}>
          New Contact Submission
        </Text>

        <Text style={{ margin: "0 0 8px" }}>
          <strong>Submission ID:</strong> {submission.id}
        </Text>
        <Text style={{ margin: "0 0 8px" }}>
          <strong>Name:</strong> {senderName || "Not provided"}
        </Text>
        <Text style={{ margin: "0 0 8px" }}>
          <strong>Email:</strong> {submission.email}
        </Text>
        <Text style={{ margin: "0 0 8px" }}>
          <strong>Subject:</strong> {submission.subject || "Not provided"}
        </Text>

        <Hr style={{ margin: "18px 0" }} />

        <Text style={{ fontWeight: "bold", margin: "0 0 6px" }}>Message</Text>
        <Text style={{ whiteSpace: "pre-wrap", margin: "0 0 14px" }}>{submission.message}</Text>

        <Hr style={{ margin: "18px 0" }} />

        <Text style={{ margin: "0 0 6px" }}>
          <strong>Origin:</strong> {submission.sourceOrigin || "Unknown"}
        </Text>
        <Text style={{ margin: "0 0 6px" }}>
          <strong>IP:</strong> {submission.sourceIp || "Unknown"}
        </Text>
        <Text style={{ margin: "0" }}>
          <strong>User Agent:</strong> {submission.userAgent || "Unknown"}
        </Text>
      </Section>
    </Base>
  )
}

ContactSubmissionEmail.PreviewProps = {
  submission: {
    id: "01HTESTSUBMISSIONID",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    subject: "Order question",
    message: "Hi team,\nI need help with my latest order.",
    sourceOrigin: "https://medusajs-2-0-for-railway-vercel.vercel.app",
    sourceIp: "203.0.113.10",
    userAgent: "Mozilla/5.0",
  },
  preview: "A new contact form submission was received.",
} as ContactSubmissionEmailProps

export default ContactSubmissionEmail
