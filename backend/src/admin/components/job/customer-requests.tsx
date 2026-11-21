import { Badge, Button, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { REQUEST_STATUSES, type CustomerRequest, type RequestStatus } from "../../../lib/customer-requests"

const LABEL: Record<RequestStatus, string> = { open: "Open", approved: "Approved", declined: "Declined", resolved: "Resolved" }

const summary = (r: CustomerRequest) =>
  r.kind === "size_swap"
    ? `Size swap: ${r.quantity} x ${r.from_size} to ${r.to_size}${r.note ? ` (${r.note})` : ""}`
    : `Problem: ${String(r.problem).replace(/_/g, " ")}${r.details ? ` · ${r.details}` : ""}`

/**
 * The customer's problem and size-swap requests (portal #21 / #36). Deciding
 * one does not email them: use Reply. Hidden when there are none.
 */
export function CustomerRequests({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<CustomerRequest[] | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const base = `/admin/jobs/${encodeURIComponent(jobId)}/customer-requests`

  useEffect(() => {
    let live = true
    fetch(base, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => live && setRows(j.requests ?? []))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [base])

  const decide = async (r: CustomerRequest, status: RequestStatus) => {
    const res = await fetch(`${base}/${encodeURIComponent(r.id)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, staff_note: notes[r.id] ?? r.staff_note ?? undefined }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(j?.error ?? "Couldn't save")
    setRows(j.requests ?? [])
    toast.success(`Marked ${LABEL[status].toLowerCase()}`)
  }

  if (!rows?.length) return null
  return (
    <div className="flex flex-col gap-y-3 px-6 py-4">
      <Text weight="plus">Customer requests</Text>
      <Text size="small" className="text-ui-fg-subtle">Deciding one does not email the customer. Use Reply.</Text>
      {rows.map((r) => (
        <div key={r.id} className="flex flex-col gap-y-2 rounded-md border border-ui-border-base p-3">
          <div className="flex items-start justify-between gap-x-2">
            <Text size="small">{summary(r)}</Text>
            <Badge size="2xsmall" color={r.status === "open" ? "orange" : r.status === "declined" ? "red" : "green"}>{LABEL[r.status]}</Badge>
          </div>
          {r.photo_urls?.length ? (
            <div className="flex flex-wrap gap-2">
              {r.photo_urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  <img src={u} alt="Customer photo" className="h-14 w-14 rounded object-cover" />
                </a>
              ))}
            </div>
          ) : null}
          <Input size="small" placeholder="Note for the customer's request page (optional)" value={notes[r.id] ?? r.staff_note ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
          <div className="flex flex-wrap gap-2">
            {REQUEST_STATUSES.map((s) => (
              <Button key={s} size="small" variant={s === r.status ? "primary" : "secondary"} onClick={() => decide(r, s)}>
                {LABEL[s]}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
