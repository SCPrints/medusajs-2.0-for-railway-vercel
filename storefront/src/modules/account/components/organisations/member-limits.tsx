"use client"

import { useCallback, useEffect, useState } from "react"

import { getOrgMemberLimits, setOrgMemberLimits, type OrgMemberLimit } from "@lib/data/org-account"

const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)
const input =
  "min-h-11 w-full rounded-md border border-ui-border-base bg-white px-3 text-base focus:outline-hidden focus-visible:ring-2 focus-visible:ring-(--brand-secondary)/40"
const button =
  "min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
const labelText = "text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle"

const toLimit = (v: string): number | null => (v.trim() && Number(v) > 0 ? Number(v) : null)

/**
 * Owner-only: each member's optional spending limits (per order, per month,
 * inc GST). An order over a limit goes to an owner for approval.
 */
export default function MemberLimits({ orgId }: { orgId: string }) {
  const [limits, setLimits] = useState<OrgMemberLimit[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => setLimits(await getOrgMemberLimits(orgId)), [orgId])
  useEffect(() => {
    void load()
  }, [load])

  const save = async (memberId: string, order_limit: number | null, monthly_limit: number | null) => {
    setBusy(true)
    setError(null)
    const res = await setOrgMemberLimits(orgId, memberId, { order_limit, monthly_limit })
    if (!res.ok) setError(res.error)
    await load()
    setBusy(false)
  }

  if (!limits.length) return null
  return (
    <section className="rounded-2xl border border-ui-border-base bg-white p-5">
      <h2 className="text-sm font-semibold text-ui-fg-base">Spending limits</h2>
      <p className="mt-1 text-xs text-ui-fg-muted">
        Optional, per person, including GST. An order over a limit comes to an owner for approval. Leave blank for no
        limit.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <ul className="mt-3 divide-y divide-ui-border-base">
        {limits.map((m) => (
          <LimitRow
            key={`${m.member_id}:${m.order_limit}:${m.monthly_limit}`}
            member={m}
            busy={busy}
            onSave={(o, mo) => save(m.member_id, o, mo)}
          />
        ))}
      </ul>
    </section>
  )
}

function LimitRow({
  member,
  busy,
  onSave,
}: {
  member: OrgMemberLimit
  busy: boolean
  onSave: (orderLimit: number | null, monthlyLimit: number | null) => void
}) {
  const [order, setOrder] = useState(member.order_limit?.toString() ?? "")
  const [month, setMonth] = useState(member.monthly_limit?.toString() ?? "")
  const changed = toLimit(order) !== member.order_limit || toLimit(month) !== member.monthly_limit
  return (
    <li className="grid grid-cols-1 gap-3 py-3 phone:grid-cols-4 phone:items-end">
      <div>
        <p className="text-sm font-semibold text-ui-fg-base">{member.name}</p>
        <p className="text-xs text-ui-fg-muted">
          {member.role} · {aud(member.month_spend)} this month
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelText}>Per order</span>
        <input className={input} type="number" min="0" step="0.01" inputMode="decimal" placeholder="No limit" value={order} onChange={(e) => setOrder(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelText}>Per month</span>
        <input className={input} type="number" min="0" step="0.01" inputMode="decimal" placeholder="No limit" value={month} onChange={(e) => setMonth(e.target.value)} />
      </label>
      <button type="button" className={button} disabled={busy || !changed} onClick={() => onSave(toLimit(order), toLimit(month))}>
        Save
      </button>
    </li>
  )
}
