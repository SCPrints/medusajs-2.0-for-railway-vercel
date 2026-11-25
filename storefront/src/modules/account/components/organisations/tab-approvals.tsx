"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import {
  approveOrgCart,
  declineOrgCart,
  deleteOrgCart,
  getOrgCart,
  listOrgCarts,
  openOrgCart,
  type OrgCartDetail,
  type OrgCartRow,
  type OrgCartStatus,
} from "@lib/data/org-account"

const aud = (n: number | null) =>
  n == null ? "" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short" }) : ""

const STATUS: Record<OrgCartStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-ui-bg-subtle text-ui-fg-subtle" },
  awaiting_approval: { label: "Needs approval", className: "bg-amber-50 text-amber-900" },
  approved: { label: "Approved · ready to pay", className: "bg-emerald-50 text-emerald-800" },
  declined: { label: "Declined", className: "bg-red-50 text-red-700" },
  ordered: { label: "Ordered", className: "bg-emerald-50 text-emerald-800" },
}

const primary =
  "min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
const secondary =
  "min-h-11 rounded-md border border-ui-border-base px-4 text-sm font-semibold text-ink hover:bg-ui-bg-subtle disabled:opacity-50"
const quiet = "min-h-11 px-2 text-sm font-medium text-ui-fg-interactive hover:underline disabled:opacity-50"

/**
 * Drafts and approvals. A draft is a saved cart any buyer can open and
 * finish. An order sent for approval waits here for an owner: Approve places
 * it (on account) or hands it over to pay; Decline needs a reason.
 */
export default function ApprovalsTab({ orgId }: { orgId: string }) {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode?: string }
  const [rows, setRows] = useState<OrgCartRow[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrgCartDetail | null>(null)
  const [declining, setDeclining] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const load = useCallback(async () => setRows(await listOrgCarts(orgId)), [orgId])
  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (row: OrgCartRow) => {
    if (openId === row.id) return setOpenId(null)
    setOpenId(row.id)
    setDetail(null)
    setDetail(await getOrgCart(orgId, row.id))
  }

  const act = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string) => {
    setBusy(true)
    setNotice(null)
    const res = await fn()
    setBusy(false)
    if (!res.ok) return setNotice({ kind: "err", text: res.error })
    if (done) setNotice({ kind: "ok", text: done })
    setDeclining(null)
    setReason("")
    await load()
  }

  const approve = async (row: OrgCartRow) => {
    setBusy(true)
    setNotice(null)
    const res = await approveOrgCart(orgId, row.id)
    setBusy(false)
    if (!res.ok) return setNotice({ kind: "err", text: res.error })
    setNotice({
      kind: "ok",
      text:
        res.status === "ordered"
          ? `Approved and ordered${res.display_id ? ` — order #${res.display_id}` : ""}. We'll invoice the organisation.`
          : res.message ?? "Approved. Open it to pay and place the order.",
    })
    await load()
  }

  const open = async (row: OrgCartRow) => {
    setBusy(true)
    setNotice(null)
    const res = await openOrgCart(orgId, row.id)
    if (!res.ok) {
      setBusy(false)
      return setNotice({ kind: "err", text: res.error })
    }
    router.push(`/${countryCode ?? "au"}/cart`)
  }

  if (!rows) return <p className="text-sm text-ui-fg-muted">Loading…</p>
  const current = rows.filter((r) => r.status !== "ordered")
  const ordered = rows.filter((r) => r.status === "ordered").slice(0, 5)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ui-fg-subtle">
        Save a cart as a draft, or send it for approval, from the payment step at checkout.
      </p>
      {notice ? (
        <p
          role={notice.kind === "err" ? "alert" : "status"}
          className={`rounded-md p-3 text-sm ${notice.kind === "err" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}
        >
          {notice.text}
        </p>
      ) : null}
      {!current.length ? <p className="text-sm text-ui-fg-muted">Nothing waiting.</p> : null}
      <ul className="flex flex-col gap-3">
        {current.map((row) => (
          <li key={row.id} className="rounded-2xl border border-ui-border-base bg-white p-5">
            <div className="flex flex-col gap-2 tablet:flex-row tablet:items-start tablet:justify-between">
              <div>
                <p className="text-sm font-semibold text-ui-fg-base">
                  {row.name} {row.total != null ? <span className="font-normal">· {aud(row.total)} inc GST</span> : null}
                </p>
                <p className="text-xs text-ui-fg-muted">
                  {row.is_mine ? "You" : row.created_by_name} · {day(row.created_at)} · {row.item_count} item
                  {row.item_count === 1 ? "" : "s"}
                  {row.cost_centre ? ` · ${row.cost_centre}` : ""}
                </p>
                {row.note ? <p className="mt-1 text-sm text-ui-fg-subtle">“{row.note}”</p> : null}
                {row.status === "declined" && row.decline_reason ? (
                  <p className="mt-1 text-sm text-red-700">
                    Declined{row.decided_by_name ? ` by ${row.decided_by_name}` : ""}: {row.decline_reason}
                  </p>
                ) : null}
              </div>
              <span className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[row.status].className}`}>
                {STATUS[row.status].label}
              </span>
            </div>

            {openId === row.id ? (
              <div className="mt-3 rounded-md bg-ui-bg-subtle p-3">
                {!detail ? (
                  <p className="text-sm text-ui-fg-muted">Loading…</p>
                ) : (
                  <>
                    <ul className="divide-y divide-ui-border-base">
                      {detail.lines.map((l) => (
                        <li key={l.id} className="flex justify-between gap-3 py-2 text-sm">
                          <span className="text-ui-fg-base">
                            {l.quantity} × {l.title}
                            {l.subtitle ? <span className="text-ui-fg-muted"> · {l.subtitle}</span> : null}
                          </span>
                          <span className="shrink-0 text-ui-fg-subtle">
                            {l.unit_price != null ? aud(l.unit_price * l.quantity) : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm font-semibold text-ui-fg-base">
                      Total {aud(detail.total)} inc GST and delivery
                      {detail.po_number ? ` · PO ${detail.po_number}` : ""}
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {declining === row.id ? (
              <div className="mt-3">
                <label className="block text-sm font-medium text-ui-fg-base">
                  Why are you declining it?
                  <textarea
                    className="mt-1 w-full rounded-md border border-ui-border-base bg-white px-3 py-2 text-base focus:outline-hidden focus-visible:ring-2"
                    rows={2}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={primary}
                    disabled={busy || !reason.trim()}
                    onClick={() => act(() => declineOrgCart(orgId, row.id, reason.trim()), "Declined. We've let them know.")}
                  >
                    Decline order
                  </button>
                  <button type="button" className={quiet} onClick={() => setDeclining(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {row.can_approve ? (
                  <>
                    <button type="button" className={primary} disabled={busy} onClick={() => approve(row)}>
                      Approve
                    </button>
                    <button type="button" className={secondary} disabled={busy} onClick={() => setDeclining(row.id)}>
                      Decline
                    </button>
                  </>
                ) : null}
                {row.can_open ? (
                  <button
                    type="button"
                    className={row.can_approve ? quiet : primary}
                    disabled={busy}
                    onClick={() => open(row)}
                    title="This replaces what's in your cart now"
                  >
                    {row.status === "approved" ? "Open and pay" : row.status === "declined" ? "Open and change" : "Open in cart"}
                  </button>
                ) : null}
                <button type="button" className={quiet} onClick={() => toggle(row)}>
                  {openId === row.id ? "Hide items" : "See items"}
                </button>
                {row.status !== "awaiting_approval" || row.is_mine ? (
                  <button
                    type="button"
                    className={quiet}
                    disabled={busy}
                    onClick={() => act(() => deleteOrgCart(orgId, row.id), "Removed.")}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            )}
            {row.can_open && declining !== row.id ? (
              <p className="mt-1 text-xs text-ui-fg-muted">Opening it replaces what&apos;s in your cart now.</p>
            ) : null}
          </li>
        ))}
      </ul>

      {ordered.length ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">Recently ordered</h3>
          <ul className="mt-2 divide-y divide-ui-border-base">
            {ordered.map((row) => (
              <li key={row.id} className="py-2 text-sm text-ui-fg-subtle">
                {row.name} · {row.created_by_name}
                {row.decided_by_name ? ` · approved by ${row.decided_by_name}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
