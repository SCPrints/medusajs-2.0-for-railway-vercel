import { Section, Text } from "react-email"

import { Base, BORDER, STYLES } from "./base"

export const DSP_JOB = "dsp-job"

/**
 * The job we send DSP (our screen-print / Supacolour supplier). Kept short:
 * what to print, on what, how many, by when. Everything else is on the
 * attached art proof (their own template) and artwork files.
 */
export interface DspJobProps {
  po: string
  customer: string
  due: string | null
  note: string | null
  garments: Array<{
    garment: string
    sizes: string
    positions: Array<{ where: string; what: string; size: string }>
  }>
  attachments: string[]
  /** Some PMS colours were matched off the artwork, not given by the customer. */
  pmsConfirm?: boolean
}

export const isDspJobData = (data: any): data is DspJobProps =>
  typeof data?.po === "string" && Array.isArray(data?.garments)

const cell = { padding: "6px 8px", borderBottom: `1px solid ${BORDER}`, fontSize: "14px", verticalAlign: "top" as const }

export const DspJobEmail = ({ po, customer, due, note, garments, attachments, pmsConfirm }: DspJobProps) => (
  <Base preview={`New job — SC Prints PO ${po}`}>
    <Section>
      <Text style={STYLES.h2}>New job — SC Prints PO {po}</Text>
      <Text style={{ margin: "0 0 16px", fontSize: "14px" }}>
        Customer: {customer}
        {due ? ` · Due: ${due}` : ""}
      </Text>
      {note ? <Text style={{ margin: "0 0 16px", fontSize: "14px" }}>{note}</Text> : null}
      {garments.map((g, i) => (
        <Section key={i} style={{ margin: "0 0 16px" }}>
          <Text style={{ margin: "0 0 2px", fontSize: "15px", fontWeight: 700 }}>{g.garment}</Text>
          <Text style={{ margin: "0 0 8px", fontSize: "14px" }}>{g.sizes}</Text>
          <table cellPadding={0} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {g.positions.map((p, k) => (
                <tr key={k}>
                  <td style={{ ...cell, fontWeight: 600, width: "28%" }}>{p.where}</td>
                  <td style={cell}>{p.what}</td>
                  <td style={{ ...cell, width: "26%" }}>{p.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ))}
      {pmsConfirm ? (
        <Text style={{ margin: "8px 0 0", fontSize: "14px" }}>PMS colours are the nearest match to the artwork. Please confirm them on your proof.</Text>
      ) : null}
      <Text style={{ margin: "8px 0 0", fontSize: "14px" }}>Attached: {attachments.join(", ")}.</Text>
      <Text style={{ margin: "16px 0 0", fontSize: "14px" }}>Please reply with your job number and proof. Thanks!</Text>
    </Section>
  </Base>
)

export default DspJobEmail
