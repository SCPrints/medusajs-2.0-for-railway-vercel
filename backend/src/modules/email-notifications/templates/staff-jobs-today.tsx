import { Button, Link, Section, Text } from "react-email"

import { Base, STYLES, NAVY, MUTED, BORDER } from "./base"

export const STAFF_JOBS_TODAY = "staff-jobs-today"

export type StaffJobLine = {
  /** "#114" or "Q-4GY0KD74V2". */
  label: string
  customer: string
  subject: string | null
  /** The job's one next action, e.g. "Send proof". */
  next: string
  /** "Waiting on you · 3 days", "Customer · 2 days", "Late · needed Fri 7 Nov". */
  note: string | null
  url: string
}

export interface StaffJobsTodayProps {
  name: string | null
  ours: StaffJobLine[]
  theirs: StaffJobLine[]
  unowned: number
  listUrl: string
}

export const isStaffJobsTodayData = (data: any): data is StaffJobsTodayProps =>
  Array.isArray(data?.ours) && Array.isArray(data?.theirs) && typeof data?.listUrl === "string"

const Row = ({ j, hot }: { j: StaffJobLine; hot: boolean }) => (
  <Section style={{ borderTop: `1px solid ${BORDER}`, padding: "10px 0" }}>
    <Text style={{ ...STYLES.body, margin: 0 }}>
      <Link href={j.url} style={{ color: NAVY, fontWeight: 600, textDecoration: "none" }}>
        {j.customer}
      </Link>
      <span style={{ color: MUTED }}> · {j.subject ? `${j.subject} · ` : ""}{j.label}</span>
    </Text>
    <Text style={{ ...STYLES.meta, margin: "2px 0 0" }}>
      <Link href={j.url} style={{ color: hot ? "#dc2626" : NAVY, fontWeight: 600 }}>
        {j.next} &rarr;
      </Link>
      {j.note ? <span style={{ color: MUTED }}> · {j.note}</span> : null}
    </Text>
  </Section>
)

/** Weekday morning list of one staff member's open jobs (jobs/send-staff-jobs-today.ts). */
export const StaffJobsTodayEmail = ({ name, ours, theirs, unowned, listUrl }: StaffJobsTodayProps) => (
  <Base preview={ours.length ? `${ours.length} job${ours.length === 1 ? "" : "s"} waiting on you` : "Your jobs today"}>
    <Text style={STYLES.eyebrow}>Your jobs today</Text>
    <Text style={STYLES.greeting}>
      {name ? `Morning ${name}. ` : ""}
      {ours.length ? `${ours.length} of your jobs ${ours.length === 1 ? "needs" : "need"} you.` : "Nothing of yours is waiting on you."}
    </Text>

    {ours.length ? (
      <Section style={{ margin: "8px 0 0" }}>
        {ours.map((j) => <Row key={j.url} j={j} hot />)}
      </Section>
    ) : null}

    {theirs.length ? (
      <>
        <Text style={{ ...STYLES.eyebrow, margin: "20px 0 0" }}>Waiting on someone else</Text>
        <Section>{theirs.map((j) => <Row key={j.url} j={j} hot={false} />)}</Section>
      </>
    ) : null}

    {unowned ? (
      <Text style={{ ...STYLES.meta, margin: "20px 0 0" }}>
        {unowned} open job{unowned === 1 ? " has" : "s have"} no owner yet. Press “Take it” on the ones that are yours.
      </Text>
    ) : null}

    <Section style={{ margin: "20px 0 0" }}>
      <Button href={listUrl} style={STYLES.buttonPrimary}>Open my jobs &rarr;</Button>
    </Section>
  </Base>
)

export default StaffJobsTodayEmail
