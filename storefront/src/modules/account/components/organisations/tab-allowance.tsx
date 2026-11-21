"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import {
  addAllowanceToCart,
  createAllowance,
  getAllowance,
  listAllowances,
  setAllowanceClosed,
  type AllowanceDetail,
  type AllowanceSummary,
} from "@lib/data/org-ops"
import type { OrgRange, OrgRoster } from "@lib/data/org-team"

const primary = "min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
const secondary = "min-h-11 rounded-md border border-ui-border-base px-4 text-sm font-semibold text-ink hover:bg-ui-bg-subtle disabled:opacity-50"
const field = "min-h-11 w-full rounded-md border border-ui-border-base bg-white px-3 text-base focus:outline-hidden focus:ring-2 focus:ring-ink"
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "")

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`

/**
 * Uniform allowance: each person on the roster gets their own link to pick
 * sizes for the items you choose. Nothing is emailed from here: copy the
 * links or download the list and send them yourself. No prices are shown to
 * the people picking; you pay by adding it all to one organisation cart.
 */
export default function AllowanceTab({ orgId, range, roster }: { orgId: string; range: OrgRange; roster: OrgRoster }) {
  const { countryCode } = useParams() as { countryCode?: string }
  const cc = countryCode ?? "au"
  const router = useRouter()
  const [list, setList] = useState<AllowanceSummary[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AllowanceDetail | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [cartReady, setCartReady] = useState(false)

  const [name, setName] = useState("")
  const [closesOn, setClosesOn] = useState("")
  const [unit, setUnit] = useState("")
  const [qty, setQty] = useState<Record<string, number>>({})

  const reload = useCallback(async () => {
    setList(await listAllowances(orgId))
    if (openId) setDetail(await getAllowance(orgId, openId))
  }, [orgId, openId])
  useEffect(() => {
    void reload()
  }, [reload])

  const units = Array.from(new Set(roster.members.filter((m) => m.is_active && m.unit).map((m) => m.unit as string)))
  const ready = range.items.filter((i) => i.ready)

  const create = async () => {
    const items = Object.entries(qty).filter(([, n]) => n > 0).map(([design_id, per_person]) => ({ design_id, per_person }))
    if (!name.trim()) return setError("Give it a name.")
    if (!items.length) return setError("Choose at least one item.")
    setBusy(true)
    setError(null)
    const res = await createAllowance(orgId, { name: name.trim(), closes_on: closesOn || null, unit: unit || null, items })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setCreating(false)
    setName("")
    setQty({})
    setOpenId(res.id)
  }

  const linkFor = (token: string) => `${window.location.origin}/${cc}/allowance/${token}`

  const downloadCsv = () => {
    if (!detail) return
    const rows = [["Name", "Unit", "Link"], ...detail.people.map((p) => [p.name, p.unit ?? "", linkFor(p.token)])]
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${detail.allowance.name.replace(/[^a-z0-9]+/gi, "-")}-links.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const addToCart = async () => {
    if (!detail) return
    setBusy(true)
    setError(null)
    setNote(null)
    const res = await addAllowanceToCart(orgId, detail.allowance.id, cc)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setNote(
      [
        res.already_added ? "It was already added. Opening your cart." : "Added to your cart.",
        res.left_out.length ? `Left out (no choices yet): ${res.left_out.join(", ")}.` : "",
        res.unmatched.length ? `A size is no longer available for: ${res.unmatched.join(", ")}.` : "",
        res.fees_for_staff.length ? `We'll confirm the price of: ${res.fees_for_staff.join(", ")}.` : "",
      ].filter(Boolean).join(" ")
    )
    // Something to read first (people left out, a size gone, a price to confirm): stay, show a button.
    if (res.left_out.length || res.unmatched.length || res.fees_for_staff.length) setCartReady(true)
    else router.push(`/${cc}/cart`)
  }

  if (!range.can_order) {
    return <p className="rounded-2xl border border-dashed border-ui-border-base bg-white p-8 text-center text-sm text-ui-fg-subtle">Owners and purchasers set up uniform allowances.</p>
  }

  if (detail && openId) {
    const a = detail.allowance
    const picked = detail.people.filter((p) => p.submitted_at && p.picks.length)
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={() => { setOpenId(null); setDetail(null) }} className="min-h-11 self-start text-sm font-medium text-ui-fg-interactive hover:underline">← All allowances</button>
        <div>
          <h2 className="text-lg font-semibold text-ui-fg-base">{a.name}</h2>
          <p className="text-sm text-ui-fg-subtle">
            {a.items.map((i) => `${i.per_person} × ${i.name}`).join(" · ")}
            {a.closes_at ? ` · closes ${day(a.closes_at)}` : ""}
            {a.closed ? " · closed" : ""}
          </p>
          <p className="mt-1 text-sm text-ui-fg-base">{picked.length} of {detail.people.length} have chosen.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadCsv} className={secondary}>Download names and links (CSV)</button>
          {!a.added_to_cart ? (
            <button type="button" onClick={async () => { await setAllowanceClosed(orgId, a.id, !a.closed); void reload() }} className={secondary}>
              {a.closed ? "Open again" : "Close now"}
            </button>
          ) : null}
          <button type="button" onClick={addToCart} disabled={busy || picked.length === 0} className={primary}>
            {a.added_to_cart ? "Open the cart" : "Add everything to cart"}
          </button>
        </div>
        <p className="text-xs text-ui-fg-subtle">People who haven&apos;t chosen are left out of the cart. Adding to the cart closes the allowance.</p>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        {note ? <p role="status" className="text-sm text-ui-fg-base">{note}</p> : null}
        {cartReady ? <button type="button" onClick={() => router.push(`/${cc}/cart`)} className={primary}>Go to your cart</button> : null}
        <ul className="divide-y divide-ui-border-base rounded-2xl border border-ui-border-base bg-white">
          {detail.people.map((p) => (
            <li key={p.roster_member_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="text-sm font-semibold text-ui-fg-base">{p.name}{p.unit ? <span className="font-normal text-ui-fg-subtle"> · {p.unit}</span> : null}</p>
                <p className="text-xs text-ui-fg-subtle">
                  {p.submitted_at
                    ? p.picks.length ? p.picks.map((k) => `${k.quantity} × ${a.items.find((i) => i.design_id === k.design_id)?.name ?? "item"} (${k.size})`).join(", ") : "Chose nothing"
                    : "Hasn't chosen yet"}
                </p>
              </div>
              {!a.closed ? (
                <button type="button" onClick={async () => { await navigator.clipboard?.writeText(linkFor(p.token)); setNote(`Link for ${p.name} copied.`) }} className="min-h-11 px-2 text-sm font-medium text-ui-fg-interactive hover:underline">
                  Copy link
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (creating) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <button type="button" onClick={() => setCreating(false)} className="min-h-11 self-start text-sm font-medium text-ui-fg-interactive hover:underline">← Back</button>
        <label className="block text-sm font-medium text-ui-fg-base">Name
          <input className={`${field} mt-1`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2027 season uniform" />
        </label>
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <label className="block text-sm font-medium text-ui-fg-base">Closes on <span className="font-normal text-ui-fg-subtle">(optional)</span>
            <input type="date" className={`${field} mt-1`} value={closesOn} onChange={(e) => setClosesOn(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ui-fg-base">Who gets it
            <select className={`${field} mt-1`} value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Everyone on the roster</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-ui-fg-base">How many of each, per person</legend>
          {ready.length === 0 ? <p className="mt-2 text-sm text-ui-fg-subtle">Share a finished design with your organisation first (Our range).</p> : null}
          <ul className="mt-2 flex flex-col gap-2">
            {ready.map((i) => (
              <li key={i.design_id} className="flex items-center justify-between gap-3 rounded-md border border-ui-border-base bg-white p-2">
                <span className="text-sm text-ui-fg-base">{i.name}<span className="text-ui-fg-subtle"> · {i.product?.title}</span></span>
                <input aria-label={`How many ${i.name} per person`} type="number" min={0} max={20} inputMode="numeric" className="min-h-11 w-20 rounded-md border border-ui-border-base px-2 text-base" value={qty[i.design_id] ?? 0} onChange={(e) => setQty({ ...qty, [i.design_id]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} />
              </li>
            ))}
          </ul>
        </fieldset>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <button type="button" onClick={create} disabled={busy} className={primary}>{busy ? "Creating…" : "Create allowance"}</button>
        <p className="text-xs text-ui-fg-subtle">Each person gets a private link. We don&apos;t email anyone: you send the links.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-sm text-ui-fg-subtle">Give everyone on your roster an allowance. They pick their own sizes on a private link, no login and no prices. You add it all to one cart.</p>
        <button type="button" onClick={() => setCreating(true)} className={primary}>New allowance</button>
      </div>
      {list === null ? <p className="text-sm text-ui-fg-subtle">Loading…</p> : null}
      {list?.length === 0 ? <p className="rounded-2xl border border-dashed border-ui-border-base bg-white p-8 text-center text-sm text-ui-fg-subtle">No allowances yet.</p> : null}
      <ul className="flex flex-col gap-2">
        {list?.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => setOpenId(a.id)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-ui-border-base bg-white p-4 text-left hover:bg-ui-bg-subtle">
              <span>
                <span className="block text-sm font-semibold text-ui-fg-base">{a.name}</span>
                <span className="block text-xs text-ui-fg-subtle">{a.picked} of {a.people} chosen{a.closes_at ? ` · closes ${day(a.closes_at)}` : ""}{a.added_to_cart ? " · added to cart" : a.closed ? " · closed" : ""}</span>
              </span>
              <span aria-hidden>›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
