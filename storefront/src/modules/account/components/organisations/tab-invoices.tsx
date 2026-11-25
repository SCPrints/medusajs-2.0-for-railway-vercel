"use client"

import { useEffect, useState } from "react"

import { getOrgInvoices, type OrgInvoice } from "@lib/data/org-account"

const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" }) : "—"

const STATUS: Record<OrgInvoice["status"], { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-800" },
  outstanding: { label: "Outstanding", className: "bg-amber-50 text-amber-900" },
  overdue: { label: "Overdue", className: "bg-red-50 text-red-700" },
}

/** Every order placed for the organisation, as an invoice: paid / outstanding / overdue. */
export default function InvoicesTab({ orgId }: { orgId: string }) {
  const [invoices, setInvoices] = useState<OrgInvoice[] | null>(null)
  useEffect(() => {
    let live = true
    void getOrgInvoices(orgId).then((rows) => live && setInvoices(rows))
    return () => {
      live = false
    }
  }, [orgId])

  if (!invoices) return <p className="text-sm text-ui-fg-muted">Loading…</p>
  if (!invoices.length) {
    return <p className="text-sm text-ui-fg-muted">No invoices yet. Orders placed for the organisation show here.</p>
  }
  const owing = invoices.reduce((sum, i) => sum + i.balance, 0)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ui-fg-subtle">
        Owing: <span className="font-semibold text-ui-fg-base">{aud(owing)}</span> inc GST
      </p>
      <ul className="divide-y divide-ui-border-base rounded-2xl border border-ui-border-base bg-white">
        {invoices.map((i) => (
          <li key={i.order_id} className="flex flex-col gap-2 px-5 py-4 tablet:flex-row tablet:items-center tablet:justify-between">
            <div>
              <p className="text-sm font-semibold text-ui-fg-base">
                Order #{i.display_id} · {aud(i.total)}
              </p>
              <p className="text-xs text-ui-fg-muted">
                {day(i.created_at)}
                {i.placed_by ? ` · ${i.placed_by}` : ""}
                {i.po_number ? ` · PO ${i.po_number}` : ""}
                {i.cost_centre ? ` · ${i.cost_centre}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {i.status !== "paid" ? (
                <p className="text-xs text-ui-fg-subtle">
                  {aud(i.balance)} {i.due_at ? `due ${day(i.due_at)}` : "owing"}
                </p>
              ) : null}
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[i.status].className}`}>
                {STATUS[i.status].label}
              </span>
              <a
                href={`/api/orders/${encodeURIComponent(i.order_id)}/invoice`}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center rounded-md border border-ui-border-base px-3 text-sm font-semibold text-ink hover:bg-ui-bg-subtle"
              >
                Tax invoice
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
