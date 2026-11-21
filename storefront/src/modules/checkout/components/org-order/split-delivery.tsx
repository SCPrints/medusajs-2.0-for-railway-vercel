"use client"

import { useEffect, useState } from "react"

import { getOrganisationDestinations, type OrganisationDestination } from "@lib/data/organisations"
import { getSplittableCart, saveSplitDelivery, type SplitInput } from "@lib/data/org-ops"

type Line = { id: string; title: string; quantity: number }
type Grid = Record<string, Record<string, number>> // destination id → line id → quantity

const small = "min-h-11 px-2 text-sm font-medium text-ui-fg-interactive hover:underline disabled:opacity-50"

/** Does every line add up exactly? (The server checks again; this just enables the button.) */
const lineSums = (lines: Line[], dests: string[], grid: Grid) =>
  lines.map((l) => ({ line: l, sent: dests.reduce((n, d) => n + (grid[d]?.[l.id] ?? 0), 0) }))

/**
 * Optional, at the Payment step for organisation orders: send this order to
 * two or more of the organisation's saved addresses. Pick the addresses, then
 * how many of each item go where; each item must add up to what is in the
 * cart. The checkout price covers postage to ONE address only; we confirm the
 * extra postage before shipping, so no price is shown here.
 */
export default function SplitDelivery({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false)
  const [dests, setDests] = useState<OrganisationDestination[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [grid, setGrid] = useState<Grid>({})
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void Promise.all([getOrganisationDestinations(orgId), getSplittableCart()]).then(async ([d, cart]) => {
      if (!live) return
      setDests(d.filter((x) => x.is_active))
      if (!cart) return
      setLines(cart.lines)
      if (cart.split) {
        const g: Grid = {}
        for (const s of cart.split) for (const l of s.lines) (g[s.destination_id] ??= {})[l.line_id] = l.quantity
        const ids = cart.split.map((s) => s.destination_id)
        if (lineSums(cart.lines, ids, g).every((r) => r.sent === r.line.quantity)) {
          setPicked(ids)
          setGrid(g)
          setSaved(true)
          setOpen(true)
        } else {
          // The cart changed since it was set: drop it so checkout never ships a stale split.
          await saveSplitDelivery(orgId, null)
          setMsg("Your cart changed, so the split was cleared. Set it again if you still need it.")
        }
      }
    })
    return () => {
      live = false
    }
  }, [orgId])

  if (dests.length < 2 || lines.length === 0) return null

  const sums = lineSums(lines, picked, grid)
  const valid = picked.length >= 2 && sums.every((r) => r.sent === r.line.quantity)

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const split: SplitInput = picked.map((d) => ({
      destination_id: d,
      lines: lines.map((l) => ({ line_id: l.id, quantity: grid[d]?.[l.id] ?? 0 })).filter((l) => l.quantity > 0),
    }))
    const res = await saveSplitDelivery(orgId, split)
    setBusy(false)
    if (!res.ok) return setMsg(res.error)
    setSaved(true)
  }

  const clear = async () => {
    setBusy(true)
    await saveSplitDelivery(orgId, null)
    setBusy(false)
    setSaved(false)
    setPicked([])
    setGrid({})
    setOpen(false)
  }

  if (!open) {
    return (
      <div className="tablet:col-span-2">
        <button type="button" onClick={() => setOpen(true)} className={small} data-testid="org-split-open">
          Deliver to more than one address
        </button>
        {msg ? <p role="status" className="text-sm text-ui-fg-subtle">{msg}</p> : null}
      </div>
    )
  }

  return (
    <div className="rounded-md bg-ui-bg-subtle p-3 tablet:col-span-2" data-testid="org-split">
      <p className="text-sm font-semibold text-ui-fg-base">Split delivery</p>
      <p className="mt-1 text-xs text-ui-fg-subtle">
        Postage shown is for one address. We&apos;ll confirm postage for the extra addresses before we ship.
      </p>
      <fieldset className="mt-3">
        <legend className="text-sm font-medium text-ui-fg-base">Choose two or more addresses</legend>
        <ul className="mt-1 grid grid-cols-1 gap-1 tablet:grid-cols-2">
          {dests.map((d) => (
            <li key={d.id}>
              <label className="flex min-h-11 items-center gap-2 text-sm text-ui-fg-base">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={picked.includes(d.id)}
                  onChange={() => {
                    setSaved(false)
                    setPicked(picked.includes(d.id) ? picked.filter((x) => x !== d.id) : [...picked, d.id])
                  }}
                />
                {d.name} <span className="text-ui-fg-subtle">· {d.city}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {picked.length >= 2 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ui-fg-subtle">
                <th className="py-1 pr-2 font-medium">Item</th>
                {picked.map((id) => (
                  <th key={id} className="px-1 py-1 font-medium">{dests.find((d) => d.id === id)?.name}</th>
                ))}
                <th className="px-1 py-1 text-right font-medium">Left</th>
              </tr>
            </thead>
            <tbody>
              {sums.map(({ line, sent }) => (
                <tr key={line.id} className="border-t border-ui-border-base">
                  <td className="py-1 pr-2 text-ui-fg-base">{line.title} <span className="text-ui-fg-subtle">× {line.quantity}</span></td>
                  {picked.map((id) => (
                    <td key={id} className="px-1 py-1">
                      <input
                        aria-label={`${line.title} to ${dests.find((d) => d.id === id)?.name}`}
                        type="number"
                        min={0}
                        max={line.quantity}
                        inputMode="numeric"
                        className="min-h-11 w-16 rounded-md border border-ui-border-base px-2 text-base"
                        value={grid[id]?.[line.id] ?? 0}
                        onChange={(e) => {
                          setSaved(false)
                          setGrid({ ...grid, [id]: { ...(grid[id] ?? {}), [line.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })
                        }}
                      />
                    </td>
                  ))}
                  <td className={`px-1 py-1 text-right tabular-nums ${sent === line.quantity ? "text-ui-fg-subtle" : "font-semibold text-red-600"}`}>
                    {line.quantity - sent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={!valid || busy || saved} className="min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
          {saved ? "Saved" : busy ? "Saving…" : "Use this split"}
        </button>
        <button type="button" onClick={clear} disabled={busy} className={small}>Deliver to one address instead</button>
      </div>
      {!valid && picked.length >= 2 ? <p className="mt-1 text-xs text-ui-fg-subtle">Every item needs &quot;Left&quot; to be 0.</p> : null}
      {msg ? <p role="alert" className="mt-1 text-sm text-red-600">{msg}</p> : null}
    </div>
  )
}
