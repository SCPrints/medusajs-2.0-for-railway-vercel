"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import {
  addOrganisationRangeToCart,
  addRosterMembers,
  priceOrganisationRange,
  type GarmentGroup,
  type PackingOption,
  type RangeItem,
  type RangeOrderLine,
  type RangePrice,
  type RosterMember,
} from "@lib/data/org-team"
import { convertToLocale } from "@lib/util/money"
import { countSizes, quantitiesForVariants, sizeKey, sizeRank } from "@lib/util/size-list"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

import SizeListImport from "./size-list-import"

type Props = {
  orgId: string
  items: RangeItem[]
  packingOptions: PackingOption[]
  members: RosterMember[]
  groups: GarmentGroup[]
  knownSizes: Record<string, string[]>
  canEditRoster: boolean
  onRosterChange?: (members: RosterMember[]) => void
}

type Person = { sizes?: Record<string, string | undefined> | null }
type Audience = "none" | "all" | "units"

const cellKey = (designId: string, variantId: string) => `${designId}:${variantId}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The range as one table: a row per design, a column per size, type the
 * quantities, one "Add all to cart". Prices come from the server (this
 * customer's price for these quantities) — nothing is worked out here.
 * Enter / arrow keys move down and up a column; Tab moves across.
 */
export default function RangeOrderForm({
  orgId,
  items,
  packingOptions,
  members,
  groups,
  knownSizes,
  canEditRoster,
  onRosterChange,
}: Props) {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const tableRef = useRef<HTMLTableElement>(null)

  const [colour, setColour] = useState<Record<string, string>>({})
  const [qty, setQty] = useState<Record<string, string>>({})
  const [audience, setAudience] = useState<Audience>("none")
  const [pickedUnits, setPickedUnits] = useState<string[]>([])
  const [packing, setPacking] = useState("bulk")
  const [personalise, setPersonalise] = useState(false)
  const [importing, setImporting] = useState(false)
  const [price, setPrice] = useState<RangePrice | null>(null)
  const [pricing, setPricing] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [result, setResult] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const ready = useMemo(() => items.filter((i) => i.ready), [items])
  const notReady = useMemo(() => items.filter((i) => !i.ready), [items])
  const active = useMemo(() => members.filter((m) => m.is_active), [members])
  const units = useMemo(
    () => Array.from(new Set(active.map((m) => m.unit).filter((u): u is string => !!u))).sort(),
    [active]
  )
  const people = useMemo(
    () =>
      audience === "none"
        ? []
        : audience === "all"
        ? active
        : active.filter((m) => m.unit && pickedUnits.includes(m.unit)),
    [audience, active, pickedUnits]
  )

  const colourOf = (item: RangeItem) => colour[item.design_id] ?? item.base_colour ?? item.colours[0] ?? null
  const variantsOf = (item: RangeItem) => {
    const c = colourOf(item)
    return item.variants.filter((v) => (c ? v.colour === c : true))
  }

  // One column per size any garment comes in, smallest first.
  const columns = useMemo(() => {
    const label = new Map<string, string>()
    for (const item of ready) {
      for (const v of variantsOf(item)) if (!label.has(sizeKey(v.size))) label.set(sizeKey(v.size), v.size)
    }
    return Array.from(label, ([key, text]) => ({ key, text })).sort((a, b) => sizeRank(a.text) - sizeRank(b.text))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, colour])

  const lines = useMemo(() => {
    const out: RangeOrderLine[] = []
    for (const item of ready) {
      for (const v of variantsOf(item)) {
        const n = Math.floor(Number(qty[cellKey(item.design_id, v.id)]))
        if (n > 0) out.push({ design_id: item.design_id, variant_id: v.id, quantity: Math.min(n, 999) })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, qty, colour])
  const linesKey = JSON.stringify(lines)
  const totalUnits = lines.reduce((n, l) => n + l.quantity, 0)

  // Ask the server for the price a moment after typing stops.
  const priceRun = useRef(0)
  useEffect(() => {
    const run = ++priceRun.current
    if (lines.length === 0) {
      setPrice(null)
      setPriceError(null)
      setPricing(false)
      return
    }
    setPricing(true)
    const timer = window.setTimeout(async () => {
      const res = await priceOrganisationRange(orgId, countryCode, lines)
      if (run !== priceRun.current) return
      if (res.ok) {
        setPrice(res.price)
        setPriceError(null)
      } else {
        setPrice(null)
        setPriceError(res.error)
      }
      setPricing(false)
    }, 500)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, orgId, countryCode])

  useEffect(() => {
    if (audience === "none" && packing === "individual") setPacking("bulk")
  }, [audience, packing])

  const money = (amount: number) => convertToLocale({ amount, currency_code: price?.currency_code ?? "aud" })
  const rowTotal = (item: RangeItem) => {
    const mine = (price?.lines ?? []).filter((l) => l.design_id === item.design_id)
    if (mine.length === 0) return null
    const units = mine.map((l) => l.unit_price)
    const lo = Math.min(...units)
    const hi = Math.max(...units)
    return {
      total: mine.reduce((n, l) => n + l.total, 0),
      each: lo === hi ? `${money(lo)} each` : `${money(lo)} to ${money(hi)} each`,
    }
  }

  function changeColour(item: RangeItem, next: string) {
    // Keep what was typed: move each quantity to the same size in the new colour.
    const from = variantsOf(item)
    const to = item.variants.filter((v) => v.colour === next)
    setQty((q) => {
      const out = { ...q }
      for (const v of from) {
        const value = out[cellKey(item.design_id, v.id)]
        delete out[cellKey(item.design_id, v.id)]
        const twin = to.find((t) => sizeKey(t.size) === sizeKey(v.size))
        if (value && twin) out[cellKey(item.design_id, twin.id)] = value
      }
      return out
    })
    setColour((c) => ({ ...c, [item.design_id]: next }))
  }

  /** Count sizes into every row. `generic` = the list had one plain Size column. */
  function fill(list: Person[], generic = false) {
    const next: Record<string, string> = { ...qty }
    const out: string[] = []
    let filled = 0
    for (const item of ready) {
      const group = item.garment_group
      if (!group) continue
      const source = generic ? list.map((p) => ({ sizes: { [group]: p.sizes?.[group] ?? p.sizes?.tops } })) : list
      const { counts, missing } = countSizes(source, group)
      const variants = variantsOf(item)
      const { byVariant, unmatched } = quantitiesForVariants(counts, variants)
      for (const v of variants) {
        const n = byVariant[v.id] ?? 0
        if (n > 0) {
          next[cellKey(item.design_id, v.id)] = String(n)
          filled += n
        } else delete next[cellKey(item.design_id, v.id)]
      }
      const label = groups.find((g) => g.key === group)?.label.toLowerCase() ?? "garment"
      if (unmatched.length) {
        out.push(
          `${item.name} doesn't come in ${unmatched.map((u) => `${u.size} (${u.count})`).join(", ")}. Those people aren't counted.`
        )
      }
      if (missing > 0) out.push(`${item.name}: ${plural(missing, "person has", "people have")} no ${label} size yet.`)
    }
    setQty(next)
    setNotes(filled === 0 && out.length === 0 ? ["No sizes to fill from yet."] : out)
    setResult(null)
  }

  function fillFromPeople() {
    if (audience === "none") {
      setAudience("all")
      fill(active)
    } else fill(people)
  }

  function moveFocus(row: number, col: number, step: 1 | -1) {
    for (let r = row + step; r >= 0 && r < ready.length; r += step) {
      const el = tableRef.current?.querySelector<HTMLInputElement>(`input[data-cell="${r}:${col}"]`)
      if (el) {
        el.focus()
        el.select()
        return
      }
    }
  }

  async function addAll() {
    if (lines.length === 0 || adding) return
    setAdding(true)
    setResult(null)
    const res = await addOrganisationRangeToCart(orgId, countryCode, {
      items: lines,
      roster: audience === "none" ? null : audience === "all" ? "all" : people.map((p) => p.id),
      packing,
      personalisationRequested: personalise,
    })
    setAdding(false)
    if (!res.ok) {
      setResult({ kind: "err", text: res.error })
      return
    }
    setQty({})
    setNotes([])
    setResult({
      kind: "ok",
      text:
        `Added ${plural(totalUnits, "garment", "garments")} to your cart.` +
        (res.fees_for_staff.length ? " We'll add the setup fee before production and confirm it with you." : ""),
    })
    router.refresh()
  }

  if (ready.length === 0 && notReady.length === 0) return null

  return (
    <div className="flex flex-col gap-5">
      {/* Who is this for? */}
      <section className="rounded-2xl border border-ui-border-base bg-white p-4 tablet:p-5">
        <div className="flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-ui-fg-base">Who is this for?</span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              className="min-h-11 rounded-md border border-ui-border-base bg-white px-3 text-base tablet:text-sm"
            >
              <option value="none">Just quantities, no names</option>
              <option value="all" disabled={active.length === 0}>
                Everyone on our list ({active.length})
              </option>
              {units.length > 0 ? <option value="units">Some units / teams…</option> : null}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={fillFromPeople}
              disabled={active.length === 0 || (audience === "units" && people.length === 0)}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              Fill from our people
            </button>
            <button
              type="button"
              onClick={() => setImporting((v) => !v)}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-ui-border-base px-5 text-sm font-semibold text-ui-fg-base hover:bg-ui-bg-subtle"
            >
              Paste a size list
            </button>
          </div>
        </div>

        {audience === "units" ? (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Units or teams">
            {units.map((u) => {
              const on = pickedUnits.includes(u)
              return (
                <button
                  key={u}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPickedUnits(on ? pickedUnits.filter((x) => x !== u) : [...pickedUnits, u])}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition ${
                    on ? "border-ink bg-ink text-white" : "border-ui-border-base bg-white text-ui-fg-base"
                  }`}
                >
                  {u} ({active.filter((m) => m.unit === u).length})
                </button>
              )
            })}
          </div>
        ) : null}
        {audience !== "none" ? (
          <p className="mt-2 text-xs text-ui-fg-muted">
            {plural(people.length, "person", "people")} will be listed on the order so we know who gets what.
          </p>
        ) : active.length === 0 ? (
          <p className="mt-2 text-xs text-ui-fg-muted">
            Add your people on the People tab and you can fill this form in one click.
          </p>
        ) : null}
      </section>

      {importing ? (
        <SizeListImport
          groups={groups}
          knownSizes={knownSizes}
          onClose={() => setImporting(false)}
          actions={[
            {
              label: (n) => `Fill quantities for ${plural(n, "person", "people")}`,
              run: (list, parsed) => {
                fill(list, parsed.genericSize)
                return null
              },
            },
            ...(canEditRoster
              ? [
                  {
                    label: () => "Fill, and save them to our people",
                    primary: false,
                    run: async (list: Parameters<typeof addRosterMembers>[1], parsed: { genericSize: boolean }) => {
                      // Everyone pasted is counted; only new names are saved.
                      const have = new Set(members.map((m) => m.name.trim().toLowerCase()))
                      const fresh = list.filter((p) => !have.has(p.name.trim().toLowerCase()))
                      if (fresh.length) {
                        const res = await addRosterMembers(orgId, fresh)
                        if (!res.ok) return res.error
                        if (res.members) onRosterChange?.(res.members)
                      }
                      fill(list, parsed.genericSize)
                      return null
                    },
                  },
                ]
              : []),
          ]}
        />
      ) : null}

      {notes.length > 0 ? (
        <ul className="m-0 list-none rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}

      {/* The table */}
      {ready.length > 0 ? (
        <div className="-mx-4 overflow-x-auto border-y border-ui-border-base bg-white tablet:mx-0 tablet:rounded-2xl tablet:border">
          <table ref={tableRef} className="w-full min-w-max border-collapse text-left">
            <thead className="bg-ui-bg-subtle text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-subtle">
              <tr>
                <th className="sticky left-0 z-10 bg-ui-bg-subtle px-3 py-2">Item</th>
                {columns.map((c) => (
                  <th key={c.key} className="px-1 py-2 text-center">
                    {c.text}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {ready.map((item, r) => {
                const variants = variantsOf(item)
                const count = variants.reduce((n, v) => n + (Math.floor(Number(qty[cellKey(item.design_id, v.id)])) || 0), 0)
                const total = rowTotal(item)
                const selected = colourOf(item)
                return (
                  <tr key={item.design_id} className="border-t border-ui-border-base align-middle">
                    <th scope="row" className="sticky left-0 z-10 w-40 max-w-[10rem] bg-white px-2 py-2 font-normal tablet:w-64 tablet:max-w-none">
                      <div className="flex items-center gap-2">
                        <span className="hidden h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ui-bg-subtle phone:flex">
                          {item.thumbnail_url ?? item.product?.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={(item.thumbnail_url ?? item.product?.thumbnail) as string}
                              alt=""
                              loading="lazy"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ui-fg-base">{item.name}</span>
                          <span className="block truncate text-xs text-ui-fg-muted">{item.product?.title}</span>
                          {item.colours.length > 1 ? (
                            <select
                              value={selected ?? ""}
                              onChange={(e) => changeColour(item, e.target.value)}
                              aria-label={`Colour for ${item.name}`}
                              className="mt-1 min-h-11 max-w-full rounded-md border border-ui-border-base bg-white px-2 text-xs"
                            >
                              {item.colours.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          ) : selected ? (
                            <span className="block text-xs text-ui-fg-subtle">{selected}</span>
                          ) : null}
                          {selected && item.base_colour && selected !== item.base_colour ? (
                            <span className="block text-[11px] text-ui-fg-muted">Picture shows {item.base_colour}</span>
                          ) : null}
                        </span>
                      </div>
                    </th>
                    {columns.map((c, col) => {
                      const v = variants.find((x) => sizeKey(x.size) === c.key)
                      if (!v) {
                        return (
                          <td key={c.key} className="px-1 py-1 text-center text-ui-fg-muted" aria-hidden>
                            ·
                          </td>
                        )
                      }
                      const key = cellKey(item.design_id, v.id)
                      return (
                        <td key={c.key} className="px-1 py-1">
                          <input
                            data-cell={`${r}:${col}`}
                            value={qty[key] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "").slice(0, 3)
                              setQty((q) => ({ ...q, [key]: value }))
                              setResult(null)
                            }}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "ArrowDown") {
                                e.preventDefault()
                                moveFocus(r, col, 1)
                              } else if (e.key === "ArrowUp") {
                                e.preventDefault()
                                moveFocus(r, col, -1)
                              }
                            }}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="off"
                            placeholder="0"
                            aria-label={`${item.name}, size ${v.size}`}
                            className="h-11 w-14 rounded-md border border-ui-border-base bg-white text-center text-base tabular-nums text-ui-fg-base placeholder:text-ui-fg-muted/50 focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40"
                          />
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-ui-fg-base">{count || ""}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {total ? (
                        <>
                          <span className="block font-semibold text-ui-fg-base">{money(total.total)}</span>
                          <span className="block text-xs text-ui-fg-muted">{total.each}</span>
                        </>
                      ) : count > 0 && pricing ? (
                        <span className="text-xs text-ui-fg-muted">…</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {notReady.length > 0 ? (
        <section className="rounded-2xl border border-dashed border-ui-border-base bg-white p-4">
          <h3 className="text-sm font-semibold text-ui-fg-base">Not ready to order from here yet</h3>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {notReady.map((item) => (
              <li key={item.design_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-ui-fg-base">
                  <span className="font-semibold">{item.name}</span>
                  <span className="text-ui-fg-subtle"> — {item.not_ready_reason}</span>
                </span>
                {item.product?.handle ? (
                  <LocalizedClientLink
                    href={`/products/${item.product.handle}?design=${item.design_id}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-ui-border-base px-4 text-sm font-semibold text-ui-fg-base hover:bg-ui-bg-subtle"
                  >
                    Open in the Studio
                  </LocalizedClientLink>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Packing + names, then the total */}
      {ready.length > 0 ? (
        <section className="grid gap-4 rounded-2xl border border-ui-border-base bg-white p-4 tablet:grid-cols-2 tablet:p-5">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-ui-fg-base">How should we pack it?</span>
              <select
                value={packing}
                onChange={(e) => setPacking(e.target.value)}
                className="min-h-11 rounded-md border border-ui-border-base bg-white px-3 text-base tablet:text-sm"
              >
                {packingOptions.map((p) => (
                  <option key={p.key} value={p.key} disabled={p.key === "individual" && audience === "none"}>
                    {p.label}
                    {p.key === "individual" && audience === "none" ? " (choose who it's for first)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-start gap-3 text-sm text-ui-fg-base">
              <input
                type="checkbox"
                checked={personalise}
                onChange={(e) => setPersonalise(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <span>
                Print names / numbers on the garments
                <span className="block text-xs text-ui-fg-muted">
                  We&apos;ll confirm the price for names and numbers before we print.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-2 tablet:items-end tablet:text-right">
            <p className="text-sm text-ui-fg-subtle" aria-live="polite">
              {plural(totalUnits, "garment", "garments")}
            </p>
            {(price?.setup_fees ?? []).map((f, i) => (
              <p key={i} className="text-sm text-ui-fg-subtle">
                {f.title}
                {f.quantity > 1 ? ` × ${f.quantity}` : ""}: {f.total === null ? "we'll confirm" : money(f.total)}
              </p>
            ))}
            <p className="text-2xl font-semibold tabular-nums text-ui-fg-base" aria-live="polite">
              {price ? money(price.total) : pricing ? "Working it out…" : money(0)}
            </p>
            <p className="text-xs text-ui-fg-muted">
              Your price, GST included. Delivery is added at checkout
              {personalise ? "; names and numbers are priced separately" : ""}.
            </p>
            {priceError ? <p className="text-sm text-rose-700">{priceError}</p> : null}
            <button
              type="button"
              onClick={addAll}
              disabled={lines.length === 0 || adding || !!priceError}
              className="mt-1 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-8 text-base font-semibold text-white transition hover:bg-[var(--brand-secondary)]/90 disabled:cursor-not-allowed disabled:opacity-50 tablet:w-auto"
            >
              {adding ? "Adding…" : "Add all to cart"}
            </button>
            {result ? (
              <p role="status" className={`text-sm ${result.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
                {result.text}{" "}
                {result.kind === "ok" ? (
                  <LocalizedClientLink href="/cart" className="font-semibold underline">
                    View cart
                  </LocalizedClientLink>
                ) : null}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}
