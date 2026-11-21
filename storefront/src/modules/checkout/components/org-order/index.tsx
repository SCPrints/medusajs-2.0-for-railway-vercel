"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { parkCartWithOrg, type OrgAccount, type OrgOrderSelection } from "@lib/data/org-account"

const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)

const field =
  "min-h-11 w-full rounded-md border border-ui-border-base bg-white px-3 text-base focus:outline-hidden focus:ring-2 focus:ring-ink"

/** The blanket POs a buyer can still draw on. */
export const usablePurchaseOrders = (org: OrgAccount | null) =>
  (org?.purchase_orders ?? []).filter((p) => p.is_active && !p.expired)

export const activeCostCentres = (org: OrgAccount | null) =>
  (org?.cost_centres ?? []).filter((c) => c.is_active)

/**
 * "Who is this order for?" — shown at the Payment step only to customers who
 * buy for an organisation. Picks the organisation, its cost centre and a
 * blanket purchase order, and can park the cart as a draft or send it to an
 * owner for approval. Everything chosen here is checked again by the backend
 * when the order is placed.
 */
const OrgOrder = ({
  options,
  value,
  onChange,
}: {
  options: OrgAccount[]
  value: OrgOrderSelection
  onChange: (next: OrgOrderSelection) => void
}) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode?: string }
  const org = options.find((o) => o.organisation.id === value.organisation_id) ?? null
  const centres = activeCostCentres(org)
  const pos = usablePurchaseOrders(org)
  const needsApproval = org?.checkout?.needs_approval ?? null

  const [parking, setParking] = useState<"draft" | "approval" | null>(null)
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickOrg = (id: string) => {
    setParking(null)
    setError(null)
    onChange({ organisation_id: id || null, cost_centre: null, organisation_po_id: null, po_number: null })
  }

  const park = async () => {
    if (!org) return
    if (!name.trim()) return setError("Give it a name so your team can find it.")
    if (centres.length && !value.cost_centre) return setError("Choose a cost centre first.")
    setBusy(true)
    setError(null)
    const res = await parkCartWithOrg({
      organisation_id: org.organisation.id,
      name: name.trim(),
      note: note.trim() || null,
      cost_centre: value.cost_centre,
      organisation_po_id: value.organisation_po_id,
      send_for_approval: parking === "approval",
    })
    if (!res.ok) {
      setBusy(false)
      return setError(res.error)
    }
    router.push(`/${countryCode ?? "au"}/account/organisations/${org.organisation.id}#approvals`)
  }

  return (
    <fieldset className="mb-6 rounded-lg border border-ui-border-base p-4" data-testid="org-order">
      <legend className="px-1 text-sm font-semibold text-ui-fg-base">Who is this order for?</legend>
      <select
        aria-label="Who is this order for?"
        className={field}
        value={value.organisation_id ?? ""}
        onChange={(e) => pickOrg(e.target.value)}
        data-testid="org-order-select"
      >
        <option value="">Me</option>
        {options.map((o) => (
          <option key={o.organisation.id} value={o.organisation.id}>
            {o.organisation.name}
          </option>
        ))}
      </select>

      {org ? (
        <div className="mt-4 grid grid-cols-1 gap-4 tablet:grid-cols-2">
          {centres.length ? (
            <label className="block text-sm font-medium text-ui-fg-base">
              Cost centre
              <select
                className={`${field} mt-1`}
                value={value.cost_centre ?? ""}
                onChange={(e) => onChange({ ...value, cost_centre: e.target.value || null })}
              >
                <option value="">Choose…</option>
                {centres.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {pos.length ? (
            <label className="block text-sm font-medium text-ui-fg-base">
              Purchase order
              <select
                className={`${field} mt-1`}
                value={value.organisation_po_id ?? ""}
                onChange={(e) => {
                  const po = pos.find((p) => p.id === e.target.value)
                  onChange({ ...value, organisation_po_id: po?.id ?? null, po_number: po?.number ?? null })
                }}
              >
                <option value="">None</option>
                {pos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} · {aud(p.remaining)} left
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {needsApproval ? (
            <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 tablet:col-span-2">
              {needsApproval} An owner needs to approve it.
            </p>
          ) : null}

          <div className="tablet:col-span-2">
            {parking ? (
              <div className="rounded-md bg-ui-bg-subtle p-3">
                <label className="block text-sm font-medium text-ui-fg-base">
                  {parking === "approval" ? "Name this order" : "Name this draft"}
                  <input
                    className={`${field} mt-1`}
                    value={name}
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Open day polos"
                  />
                </label>
                {parking === "approval" ? (
                  <label className="mt-3 block text-sm font-medium text-ui-fg-base">
                    Note for the approver <span className="font-normal text-ui-fg-subtle">(optional)</span>
                    <textarea
                      className={`${field} mt-1 py-2`}
                      rows={2}
                      maxLength={1000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={park}
                    disabled={busy}
                    className="min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Saving…" : parking === "approval" ? "Send for approval" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setParking(null)}
                    className="min-h-11 rounded-md px-4 text-sm font-medium text-ui-fg-subtle hover:text-ui-fg-base"
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-2 text-xs text-ui-fg-subtle">
                  {parking === "approval"
                    ? "Your cart moves to your organisation page until an owner decides. We'll email you."
                    : "Your cart moves to your organisation page. Anyone who buys for your organisation can finish it."}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={() => setParking("approval")}
                  className={
                    needsApproval
                      ? "min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white"
                      : "min-h-11 rounded-md px-2 text-sm font-medium text-ui-fg-interactive hover:underline"
                  }
                  data-testid="org-send-for-approval"
                >
                  Send for approval
                </button>
                <button
                  type="button"
                  onClick={() => setParking("draft")}
                  className="min-h-11 rounded-md px-2 text-sm font-medium text-ui-fg-interactive hover:underline"
                  data-testid="org-save-draft"
                >
                  Save as a draft
                </button>
              </div>
            )}
            {error ? (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </fieldset>
  )
}

export default OrgOrder
