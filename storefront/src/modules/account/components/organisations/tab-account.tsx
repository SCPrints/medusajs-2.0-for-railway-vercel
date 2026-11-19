"use client"

import { useCallback, useEffect, useState } from "react"

import {
  createOrgCostCentre,
  createOrgPurchaseOrder,
  deleteOrgCostCentre,
  getOrgAccount,
  setOrgPurchaseOrderActive,
  updateOrgApEmail,
  type OrgAccount,
} from "@lib/data/org-account"
import type { OrgRole } from "@lib/data/organisations"

const aud = (n: number | null | undefined) =>
  n == null ? "No limit" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "No expiry"

const card = "rounded-2xl border border-ui-border-base bg-white p-5"
const input =
  "min-h-11 w-full rounded-md border border-ui-border-base bg-white px-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40"
const button =
  "min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
const linkButton = "min-h-11 px-2 text-sm font-medium text-ui-fg-interactive hover:underline disabled:opacity-50"
const labelText = "text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle"

/**
 * The organisation's account: pay-on-account terms (set by SC Prints),
 * accounts-payable email, blanket purchase orders with what's left and cost
 * centres. Owners edit; others read. (Spending limits: Members tab.)
 */
export default function AccountTab({ orgId, role }: { orgId: string; role: OrgRole }) {
  const isOwner = role === "owner"
  const [data, setData] = useState<OrgAccount | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [apEmail, setApEmail] = useState("")
  const [po, setPo] = useState({ number: "", amount: "", expires: "" })
  const [cc, setCc] = useState({ code: "", name: "" })

  const load = useCallback(async () => {
    const account = await getOrgAccount(orgId)
    setData(account)
    setApEmail(account?.account.ap_email ?? "")
    setLoaded(true)
  }, [orgId])
  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) => {
    setBusy(true)
    setError(null)
    const res = await action()
    if (res.ok) {
      after?.()
      await load()
    } else {
      setError(res.error)
    }
    setBusy(false)
  }

  if (!loaded) return <p className="text-sm text-ui-fg-muted">Loading…</p>
  if (!data) return <p className="text-sm text-ui-fg-muted">We couldn&apos;t load the account. Please refresh.</p>
  const { account, my } = data

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className={card}>
        <h2 className="text-sm font-semibold text-ui-fg-base">Paying on account</h2>
        {account.terms_enabled ? (
          <>
            <p className="mt-1 text-sm text-ui-fg-subtle">
              You can order without a card. We invoice the organisation, due in {account.terms_days} days.
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-4 phone:grid-cols-3">
              <div>
                <dt className={labelText}>Owing now</dt>
                <dd className="mt-1 text-lg font-semibold text-ui-fg-base">{aud(account.outstanding)}</dd>
              </div>
              <div>
                <dt className={labelText}>Account limit</dt>
                <dd className="mt-1 text-lg font-semibold text-ui-fg-base">{aud(account.credit_limit)}</dd>
              </div>
              {account.available != null ? (
                <div>
                  <dt className={labelText}>Left to spend</dt>
                  <dd className="mt-1 text-lg font-semibold text-ui-fg-base">{aud(account.available)}</dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : (
          <p className="mt-1 text-sm text-ui-fg-subtle">
            Orders are paid by card at checkout. Want to pay by invoice instead? Contact us and we&apos;ll set up an
            account.
          </p>
        )}
        {my.order_limit != null || my.monthly_limit != null ? (
          <p className="mt-4 text-sm text-ui-fg-subtle">
            Your limits: {my.order_limit != null ? `${aud(my.order_limit)} per order` : "no limit per order"},{" "}
            {my.monthly_limit != null
              ? `${aud(my.monthly_limit)} per month (${aud(my.month_spend)} used this month)`
              : "no monthly limit"}
            . Bigger orders go to an owner for approval.
          </p>
        ) : null}
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-ui-fg-base">Accounts-payable email</h2>
        <p className="mt-1 text-xs text-ui-fg-muted">Every tax invoice for this organisation is also sent here.</p>
        {isOwner ? (
          <form
            className="mt-3 flex flex-col gap-3 phone:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              void run(() => updateOrgApEmail(orgId, apEmail))
            }}
          >
            <input
              type="email"
              aria-label="Accounts-payable email"
              className={input}
              value={apEmail}
              onChange={(e) => setApEmail(e.target.value)}
              placeholder="accounts@example.gov.au"
            />
            <button type="submit" className={button} disabled={busy || apEmail.trim() === (account.ap_email ?? "")}>
              Save
            </button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-ui-fg-base">{account.ap_email ?? "Not set"}</p>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-ui-fg-base">Purchase orders</h2>
        <p className="mt-1 text-xs text-ui-fg-muted">
          A purchase order covers many orders. Pick one at checkout and we track what&apos;s left. Amounts include GST.
        </p>
        {data.purchase_orders.length ? (
          <ul className="mt-3 divide-y divide-ui-border-base">
            {data.purchase_orders.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 py-3 phone:flex-row phone:items-center phone:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ui-fg-base">
                    {p.number}
                    {!p.is_active ? " · closed" : p.expired ? " · expired" : ""}
                  </p>
                  <p className="text-xs text-ui-fg-muted">
                    {aud(p.amount)} · {day(p.expires_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm text-ui-fg-base">
                    Remaining <span className="font-semibold">{aud(p.remaining)}</span>
                  </p>
                  {isOwner ? (
                    <button
                      type="button"
                      className={linkButton}
                      disabled={busy}
                      onClick={() => run(() => setOrgPurchaseOrderActive(orgId, p.id, !p.is_active))}
                    >
                      {p.is_active ? "Close" : "Reopen"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ui-fg-muted">No purchase orders yet.</p>
        )}
        {isOwner ? (
          <form
            className="mt-4 grid grid-cols-1 gap-3 phone:grid-cols-4 phone:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void run(
                () =>
                  createOrgPurchaseOrder(orgId, {
                    number: po.number.trim(),
                    amount: Number(po.amount),
                    expires_at: po.expires || null,
                  }),
                () => setPo({ number: "", amount: "", expires: "" })
              )
            }}
          >
            <label className="flex flex-col gap-1">
              <span className={labelText}>PO number</span>
              <input className={input} required maxLength={60} value={po.number} onChange={(e) => setPo({ ...po, number: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelText}>Amount inc GST</span>
              <input className={input} required type="number" min="1" step="0.01" inputMode="decimal" value={po.amount} onChange={(e) => setPo({ ...po, amount: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelText}>Expires (optional)</span>
              <input className={input} type="date" value={po.expires} onChange={(e) => setPo({ ...po, expires: e.target.value })} />
            </label>
            <button type="submit" className={button} disabled={busy}>
              Add purchase order
            </button>
          </form>
        ) : null}
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-ui-fg-base">Cost centres</h2>
        <p className="mt-1 text-xs text-ui-fg-muted">
          With a list here, every order for the organisation is tagged with one at checkout.
        </p>
        {data.cost_centres.length ? (
          <ul className="mt-3 divide-y divide-ui-border-base">
            {data.cost_centres.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <p className="text-sm text-ui-fg-base">
                  <span className="font-semibold">{c.code}</span> · {c.name}
                </p>
                {isOwner ? (
                  <button type="button" className={linkButton} disabled={busy} onClick={() => run(() => deleteOrgCostCentre(orgId, c.id))}>
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ui-fg-muted">No cost centres.</p>
        )}
        {isOwner ? (
          <form
            className="mt-4 grid grid-cols-1 gap-3 phone:grid-cols-3 phone:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void run(
                () => createOrgCostCentre(orgId, { code: cc.code.trim(), name: cc.name.trim() }),
                () => setCc({ code: "", name: "" })
              )
            }}
          >
            <label className="flex flex-col gap-1">
              <span className={labelText}>Code</span>
              <input className={input} required maxLength={40} value={cc.code} onChange={(e) => setCc({ ...cc, code: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelText}>Name</span>
              <input className={input} required maxLength={120} value={cc.name} onChange={(e) => setCc({ ...cc, name: e.target.value })} />
            </label>
            <button type="submit" className={button} disabled={busy}>
              Add cost centre
            </button>
          </form>
        ) : null}
      </section>

    </div>
  )
}
