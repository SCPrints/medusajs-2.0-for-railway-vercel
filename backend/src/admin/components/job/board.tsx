import { Button } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"

import { BOARD_COLUMNS, boardColumn, type TodayRow } from "../../../lib/job-today"
import { AppLink } from "../../lib/nav"
import { tick, useFlip } from "../../lib/motion"
import { ONE_CLICK } from "./actions"

/**
 * The Jobs board (Docs/admin-ux-review §3): every open job is one card in one
 * of six columns. The dot says whose move it is; the card says the next step
 * and, when it's ours and one click, does it. Steps that email the customer
 * ask once first. Columns come from boardColumn (lib/job-today.ts).
 */

/** One-click steps the customer sees, so the button asks once first. */
const EMAILS_CUSTOMER = new Set(["send_proof", "start_production", "mark_shipped"])

const DOT: Record<string, string> = {
  us: "bg-ui-tag-red-icon",
  customer: "bg-ui-tag-blue-icon",
  supplier: "bg-ui-tag-orange-icon",
}
const WHOSE: Record<string, string> = { us: "Our move", customer: "Customer's move", supplier: "Supplier's move" }

const money = (n: number | null, cur: string) =>
  n == null ? null : new Intl.NumberFormat("en-AU", { style: "currency", currency: cur.toUpperCase(), maximumFractionDigits: 0 }).format(n)
const shortDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })

/** Same person, same colour, everywhere. */
const AVATAR_BG = ["bg-ui-tag-purple-icon", "bg-ui-tag-green-icon", "bg-ui-tag-blue-icon", "bg-ui-tag-orange-icon"]
export function Avatar({ owner, me }: { owner: TodayRow["owner"]; me?: string | null }) {
  if (!owner) {
    return <span title="No owner yet" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-ui-border-strong text-[11px] font-bold text-ui-fg-muted">?</span>
  }
  const n = [...owner.user_id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return (
    <span
      title={owner.user_id === me ? `${owner.label} (you)` : owner.label}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${AVATAR_BG[n % AVATAR_BG.length]} ${owner.user_id === me ? "ring-2 ring-ui-fg-base ring-offset-1" : ""}`}
    >
      {owner.label.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  )
}

/** A number that pulses when it changes. */
export function TickNum({ n, className = "" }: { n: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useRef(n)
  useEffect(() => {
    if (seen.current !== n && ref.current) tick(ref.current)
    seen.current = n
  }, [n])
  return <span ref={ref} className={`inline-block tabular-nums ${className}`}>{n}</span>
}

type Props = {
  rows: TodayRow[]
  me: string | null
  busy: string | null
  /** Dim every card that isn't our move. */
  ourMoveOnly: boolean
  /** Changes when the set of cards is swapped (who / search), so it doesn't animate. */
  scope: string
  hrefFor: (id: string) => string
  onAct: (row: TodayRow) => void
  onTake: (row: TodayRow) => void
}

export function JobsBoard({ rows, me, busy, ourMoveOnly, scope, hrefFor, onAct, onTake }: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [armed, setArmed] = useState<string | null>(null)
  useFlip(boardRef, scope)

  // An armed "Yes, email …" button disarms itself after a few seconds.
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(null), 4000)
    return () => clearTimeout(t)
  }, [armed])

  const byCol = new Map(BOARD_COLUMNS.map((c) => [c.key, [] as TodayRow[]]))
  for (const r of rows) {
    const col = boardColumn(r)
    if (col) byCol.get(col)!.push(r)
  }

  return (
    <div className="overflow-x-auto pb-2">
      {/* `relative` here (and not on the columns) so every card measures from the board when it glides. */}
      <div ref={boardRef} className="relative grid min-w-[1080px] grid-cols-6 gap-3">
        {BOARD_COLUMNS.map((c) => {
          const cards = byCol.get(c.key)!
          return (
            <section key={c.key} aria-label={c.label} className="flex min-h-[420px] flex-col gap-2 rounded-xl bg-ui-bg-component p-2">
              <h2 className="flex items-center justify-between px-1 pt-0.5 text-xs font-bold uppercase tracking-wide text-ui-fg-subtle">
                {c.label}
                <TickNum n={cards.length} className="text-ui-fg-muted" />
              </h2>
              {cards.length === 0 ? <p className="px-1 text-xs text-ui-fg-muted">Nothing here.</p> : null}
              {cards.map((row) => (
                <Card
                  key={row.id}
                  row={row}
                  me={me}
                  dim={ourMoveOnly && !row.needs_us}
                  busy={busy}
                  armed={armed === row.id}
                  href={hrefFor(row.id)}
                  onAct={() => {
                    if (EMAILS_CUSTOMER.has(row.next_action.kind) && armed !== row.id) return setArmed(row.id)
                    setArmed(null)
                    onAct(row)
                  }}
                  onTake={() => onTake(row)}
                />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Card({ row, me, dim, busy, armed, href, onAct, onTake }: {
  row: TodayRow
  me: string | null
  dim: boolean
  busy: string | null
  armed: boolean
  href: string
  onAct: () => void
  onTake: () => void
}) {
  const ours = row.needs_us
  const oneClick = ours && ONE_CLICK.has(row.next_action.kind)
  const owing = row.order_id && row.outstanding && row.outstanding > 0.01 ? money(row.outstanding, row.currency_code) : null
  const what = row.subject ?? row.items ?? row.label
  return (
    <article
      data-flip={row.id}
      className={`group relative flex flex-col gap-1.5 rounded-lg border bg-ui-bg-base p-2.5 shadow-elevation-card-rest transition-[box-shadow,transform,opacity] duration-200 hover:-translate-y-px hover:shadow-elevation-card-hover ${ours ? "border-ui-tag-red-border" : "border-ui-border-base"} ${dim ? "opacity-35" : ""}`}
    >
      {row.thumbnail ? (
        <img src={row.thumbnail} alt="" loading="lazy" className="h-20 w-full rounded-md bg-ui-bg-subtle object-contain" />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        {/* The title link covers the whole card; the buttons sit above it. */}
        <AppLink href={href} className="min-w-0 text-sm font-semibold leading-tight after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ui-fg-interactive">
          {row.customer}
        </AppLink>
        <Avatar owner={row.owner} me={me} />
      </div>
      <p className="truncate text-xs text-ui-fg-subtle" title={what}>{what}</p>
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <span title={row.waiting_on ? WHOSE[row.waiting_on] : undefined} className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.waiting_on ? DOT[row.waiting_on] : "bg-ui-tag-green-icon"}`} />
        <span className={ours ? "text-ui-tag-red-text" : "text-ui-fg-subtle"}>
          {ours ? row.next_action.label : `Waiting · ${row.waiting_on === "supplier" ? "supplier" : "customer"}`}
        </span>
        {row.days ? <span className="font-normal text-ui-fg-muted">· {row.days}d</span> : null}
      </p>
      <p className="flex flex-wrap gap-x-2 text-xs text-ui-fg-muted">
        {owing ? <span className="font-semibold text-ui-tag-red-text">{owing} owing</span> : money(row.total, row.currency_code) ? <span>{money(row.total, row.currency_code)}</span> : null}
        {row.risk === "late" && row.needed_by ? <span className="font-semibold text-ui-tag-red-text">Late · {shortDate(row.needed_by)}</span> : null}
        {row.risk === "at_risk" && row.needed_by ? <span className="font-semibold text-ui-tag-orange-text">At risk · {shortDate(row.needed_by)}</span> : null}
        {!row.risk && row.needed_by ? <span>Needed {shortDate(row.needed_by)}</span> : null}
        {row.rush_tier ? <span className="font-semibold text-ui-tag-red-text">{row.rush_tier === "express" ? "Express" : "Priority"}</span> : null}
      </p>
      {oneClick || !row.owner ? (
        <div className="relative z-10 flex flex-wrap gap-1.5 pt-0.5">
          {oneClick ? (
            <Button size="small" variant={armed ? "danger" : "primary"} isLoading={busy === row.id} disabled={!!busy} onClick={onAct}>
              {armed ? "Yes, email customer" : row.next_action.label}
            </Button>
          ) : null}
          {!row.owner ? (
            <Button size="small" variant="secondary" disabled={!!busy} onClick={onTake}>Take it</Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
