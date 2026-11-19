import { Hr, Section, Text } from "react-email"

import { Base, STYLES, NAVY } from "./base"

export const SUPPLIER_CATALOG_SYNC = "supplier-catalog-sync"

type Line = { title: string; code: string; handle: string; admin_url: string | null; store_url: string | null }

export interface SupplierCatalogSyncProps {
  sync: {
    mode: "report" | "apply" | "off"
    adminUrl: string | null
    reports: Array<{
      supplier: string
      added: Line[]
      add_errors: Array<{ code: string; error: string }>
      pending_add: Line[]
      hidden: Array<Line & { reason: "discontinued" | "not_listed" }>
      hide_blocked_reason: string | null
      error: string | null
    }>
  }
  preview?: string
}

export const isSupplierCatalogSyncData = (data: any): data is SupplierCatalogSyncProps =>
  typeof data?.sync === "object" && Array.isArray(data?.sync?.reports)

const REASON = { discontinued: "discontinued by the supplier", not_listed: "no longer listed by the supplier" }

const small = { margin: "4px 0 0", fontSize: "13px", color: "#374151" }
const heading = { margin: "16px 0 4px", fontSize: "14px", fontWeight: 700, color: NAVY }

const Links = ({ l }: { l: Line }) => (
  <>
    {l.admin_url ? (
      <>
        {" · "}
        <a href={l.admin_url} style={{ color: "#2563eb" }}>admin</a>
      </>
    ) : null}
    {l.store_url ? (
      <>
        {" · "}
        <a href={l.store_url} style={{ color: "#2563eb" }}>website</a>
      </>
    ) : null}
  </>
)

const List = ({ title, items, note }: { title: string; items: Array<Line & { reason?: string }>; note?: string }) =>
  items.length ? (
    <>
      <Text style={heading}>{title} ({items.length})</Text>
      {note ? <Text style={small}>{note}</Text> : null}
      {items.map((l) => (
        <Text key={l.code + l.handle} style={small}>
          {l.title} <span style={{ color: "#6b7280" }}>({l.code})</span>
          {l.reason ? ` — ${REASON[l.reason as keyof typeof REASON] ?? l.reason}` : ""}
          <Links l={l} />
        </Text>
      ))}
    </>
  ) : null

export const SupplierCatalogSyncEmail = ({ sync, preview }: SupplierCatalogSyncProps) => {
  const isReport = sync.mode !== "apply"
  return (
    <Base preview={preview ?? "New supplier products waiting for your review"}>
      <Text style={STYLES.eyebrow}>SC Prints supplier catalog</Text>
      <Text style={STYLES.h1}>{isReport ? "Changes waiting (nothing changed yet)" : "Catalog sync report"}</Text>
      <Text style={STYLES.body}>
        {isReport
          ? "Check mode is on, so nothing was changed. This is what the sync would add (as drafts) and hide."
          : "New supplier styles were added as drafts, so they are NOT on the website yet. Open each one in admin and set it to Published if you want it live. Products the supplier dropped were hidden (set to draft, not deleted); re-publish any you still want."}
      </Text>

      {sync.reports.map((r) => (
        <Section
          key={r.supplier}
          style={{ background: "#f9fafb", padding: "12px 16px", borderRadius: "8px", margin: "16px 0 0" }}
        >
          <Text style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: NAVY }}>{r.supplier}</Text>
          {r.error ? <Text style={{ ...small, color: "#dc2626" }}>Sync failed: {r.error}</Text> : null}

          <List title="Added as drafts, waiting for your review" items={r.added} />
          <List
            title={isReport ? "Would add as drafts" : "Waiting to add on the next run"}
            items={r.pending_add}
          />
          {r.hide_blocked_reason ? (
            <List
              title="Not hidden (safety stop)"
              items={r.hidden}
              note={r.hide_blocked_reason}
            />
          ) : (
            <List title={isReport ? "Would hide" : "Hidden"} items={r.hidden} />
          )}

          {r.add_errors.length ? (
            <>
              <Text style={heading}>Problems ({r.add_errors.length})</Text>
              {r.add_errors.map((e) => (
                <Text key={e.code} style={small}>
                  {e.code}: {e.error}
                </Text>
              ))}
            </>
          ) : null}
        </Section>
      ))}

      <Hr style={{ margin: "20px 0" }} />
      <Text style={{ ...STYLES.body, fontSize: "12px" }}>
        Runs nightly. Nothing new goes live until you publish it. Hidden products keep their orders and quotes; they are only removed from the website.
      </Text>
    </Base>
  )
}

export default SupplierCatalogSyncEmail
