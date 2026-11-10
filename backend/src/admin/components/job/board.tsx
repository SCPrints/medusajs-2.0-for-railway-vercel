import { Button, DropdownMenu, Popover, Textarea, toast } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { BOARD_COLUMNS, boardColumn, type TodayRow } from "../../../lib/job-today"
import { isNewSince, type JobsSeen } from "../../lib/jobs-seen"
import { AppLink } from "../../lib/nav"
import { tick, useFlip } from "../../lib/motion"
import { fetchUsers } from "../owner-picker"
import { CHASEABLE, chaseDraft, ONE_CLICK, replyToJob, setJobOwner } from "./actions"

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
/** Tallest the hover preview gets: two rows of mockups. */
const PEEK_MAX_H = 544
/**
 * Business days a card can wait before its day count turns orange, then red.
 */
// ponytail: two flat limits per side; read STUCK_AFTER_BUSINESS_DAYS per stage if staff want them exact.
const AGE_LIMIT: Record<string, [number, number]> = { us: [2, 4], customer: [3, 6], supplier: [3, 6] }
const ageClass = (row: TodayRow) => {
  const [warn, late] = AGE_LIMIT[row.waiting_on ?? ""] ?? [Infinity, Infinity]
  return row.days >= late
    ? "rounded bg-ui-tag-red-bg px-1 font-bold text-ui-tag-red-text"
    : row.days >= warn
      ? "rounded bg-ui-tag-orange-bg px-1 font-bold text-ui-tag-orange-text"
      : "font-normal text-ui-fg-muted"
}
const TAG = "rounded border border-ui-border-base px-1 text-[11px] font-medium leading-4 text-ui-fg-subtle"
type Teammate = { id: string; label: string }
const WHOSE:Record<string, string> = { us: "Our move", customer: "Customer's move", supplier: "Supplier's move" }

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
  /** When this browser last opened each job (lib/jobs-seen.ts). */
  seen: JobsSeen
  hrefFor: (id: string) => string
  onAct: (row: TodayRow) => void
  onTake: (row: TodayRow) => void
  /** Something on the card changed (owner, note, reminder): reload. */
  onChanged: () => void
}

export function JobsBoard({ rows, me, busy, ourMoveOnly, scope, seen, hrefFor, onAct, onTake, onChanged }: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [team, setTeam] = useState<Teammate[]>([])
  useFlip(boardRef, scope)

  useEffect(() => {
    void fetchUsers().then((users) =>
      setTeam(users.map((u) => ({ id: u.id, label: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email })))
    )
  }, [])

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
  // Empty columns fold to a strip so the busy ones get the room.
  const busyCols = BOARD_COLUMNS.filter((c) => byCol.get(c.key)!.length).length
  const template = BOARD_COLUMNS.map((c) => (byCol.get(c.key)!.length ? "minmax(180px, 1fr)" : "44px")).join(" ")

  return (
    <div className="overflow-x-auto pb-2">
      {/* `relative` here (and not on the columns) so every card measures from the board when it glides. */}
      <div ref={boardRef} className="relative grid gap-3" style={{ gridTemplateColumns: template, minWidth: busyCols * 180 + (BOARD_COLUMNS.length - busyCols) * 44 + (BOARD_COLUMNS.length - 1) * 12 }}>
        {BOARD_COLUMNS.map((c) => {
          const cards = byCol.get(c.key)!
          if (!cards.length) {
            return (
              <section key={c.key} aria-label={`${c.label}: nothing here`} title={`${c.label}: nothing here`} className="flex min-h-[420px] flex-col items-center gap-2 rounded-xl bg-ui-bg-component py-2.5 text-xs font-bold uppercase tracking-wide text-ui-fg-muted">
                <span>0</span>
                <h2 style={{ writingMode: "vertical-rl" }}>{c.label}</h2>
              </section>
            )
          }
          return (
            <section key={c.key} aria-label={c.label} className="flex min-h-[420px] min-w-0 flex-col gap-2 rounded-xl bg-ui-bg-component p-2">
              <h2 className="flex items-center justify-between px-1 pt-0.5 text-xs font-bold uppercase tracking-wide text-ui-fg-subtle">
                {c.label}
                <TickNum n={cards.length} className="text-ui-fg-muted" />
              </h2>
              {cards.map((row) => (
                <Card
                  key={row.id}
                  row={row}
                  me={me}
                  team={team}
                  fresh={isNewSince(seen, row.id, row.customer_activity_at)}
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
                  onChanged={onChanged}
                />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Card({ row, me, team, fresh, dim, busy, armed, href, onAct, onTake, onChanged }: {
  row: TodayRow
  me: string | null
  team: Teammate[]
  /** The customer has done something since this browser last opened the job. */
  fresh: boolean
  dim: boolean
  busy: string | null
  armed: boolean
  href: string
  onAct: () => void
  onTake: () => void
  onChanged: () => void
}) {
  const ours = row.needs_us
  const oneClick = ours && ONE_CLICK.has(row.next_action.kind)
  const canChase = row.waiting_on === "customer" && CHASEABLE.has(row.next_action.kind)
  const owing = row.pay && row.pay !== "paid" && row.outstanding ? money(row.outstanding, row.currency_code) : null
  const what = row.subject ?? row.items ?? row.label
  const mockups = row.mockups ?? []
  const picture = mockups[0] ?? row.thumbnail

  // The note / reminder box under the card's buttons.
  const [compose, setCompose] = useState<{ mode: "note" | "chase"; text: string; to?: string } | null>(null)
  const [working, setWorking] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    setWorking(true)
    try {
      await fn()
    } catch (err: any) {
      toast.error(err?.message ?? "That didn't work")
    } finally {
      setWorking(false)
    }
  }
  const openChase = () =>
    run(async () => {
      const d = await chaseDraft({ job_id: row.id, order_id: row.order_id, display_id: row.display_id, outstanding: row.outstanding })
      setCompose({ mode: "chase", text: d.body, to: d.to })
    })
  const send = () =>
    run(async () => {
      if (!compose?.text.trim()) return
      await replyToJob(row.id, compose.mode === "chase" ? "email" : "note", compose.text.trim())
      toast.success(compose.mode === "chase" ? `Reminder emailed to ${compose.to}` : "Note added")
      setCompose(null)
      onChanged()
    })
  const giveTo = (userId: string | null, label: string) =>
    run(async () => {
      await setJobOwner(row.id, userId)
      toast.success(userId ? `${row.customer} is ${userId === me ? "yours" : `${label}'s`} now` : `${row.customer} has no owner now`)
      onChanged()
    })

  // Where the hover preview sits: beside the card, on whichever side has room.
  const [peek, setPeek] = useState<{ left: number; top: number } | null>(null)
  const peekW = mockups.length > 1 ? 560 : 320
  const showPeek = (e: React.MouseEvent<HTMLElement>) => {
    if (!mockups.length || compose) return
    const r = e.currentTarget.getBoundingClientRect()
    const right = r.right + 8
    setPeek({
      left: right + peekW <= window.innerWidth ? right : Math.max(8, r.left - peekW - 8),
      top: Math.max(8, Math.min(r.top, window.innerHeight - PEEK_MAX_H - 8)),
    })
  }
  return (
    <article
      data-flip={row.id}
      onMouseEnter={showPeek}
      onMouseLeave={() => setPeek(null)}
      onMouseDown={() => setPeek(null)}
      className={`group relative isolate flex flex-col gap-1.5 rounded-lg border bg-ui-bg-base p-2.5 shadow-elevation-card-rest transition-[box-shadow,transform,opacity] duration-200 hover:-translate-y-px hover:shadow-elevation-card-hover ${ours ? "border-ui-tag-red-border" : "border-ui-border-base"} ${dim ? "opacity-35" : ""}`}
    >
      {picture ? (
        <img src={picture} alt="" loading="lazy" className={`h-24 w-full rounded-md object-contain ${mockups.length ? "bg-white" : "bg-ui-bg-subtle"}`} />
      ) : null}
      {/* On <body>: the card's hover transform and the board's scroll box would trap or clip it. */}
      {peek
        ? createPortal(
            <div
              style={{ left: peek.left, top: peek.top, width: peekW, maxHeight: PEEK_MAX_H }}
              className={`pointer-events-none fixed z-50 grid gap-2 overflow-hidden rounded-xl border border-ui-border-strong bg-ui-bg-base p-2 shadow-elevation-flyout ${mockups.length > 1 ? "grid-cols-2" : ""}`}
            >
              {mockups.slice(0, 4).map((u) => (
                <img key={u} src={u} alt="" className="max-h-[260px] w-full rounded-md bg-white object-contain" />
              ))}
            </div>,
            document.body
          )
        : null}
      <div className="flex items-start justify-between gap-2">
        {/* The title link covers the whole card; the buttons sit above it. */}
        <AppLink href={href} className="min-w-0 text-sm font-semibold leading-tight after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ui-fg-interactive">
          {fresh ? <span title="New from the customer since you last opened this job" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-ui-fg-interactive align-middle" /> : null}
          {row.customer}
        </AppLink>
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label={`Owner: ${row.owner?.label ?? "nobody"}. Change owner`} disabled={working} className="relative z-10 shrink-0 rounded-full hover:ring-2 hover:ring-ui-border-strong">
              <Avatar owner={row.owner} me={me} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Label>Who owns this job?</DropdownMenu.Label>
            {team.map((u) => (
              <DropdownMenu.Item key={u.id} disabled={u.id === row.owner?.user_id} onClick={() => giveTo(u.id, u.label)}>
                {u.label}{u.id === me ? " (you)" : ""}{u.id === row.owner?.user_id ? " ✓" : ""}
              </DropdownMenu.Item>
            ))}
            {row.owner ? (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onClick={() => giveTo(null, "")}>No owner</DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
      <p className="truncate text-xs text-ui-fg-subtle" title={what}>{what}</p>
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <span title={row.waiting_on ? WHOSE[row.waiting_on] : undefined} className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.waiting_on ? DOT[row.waiting_on] : "bg-ui-tag-green-icon"}`} />
        <span className={ours ? "text-ui-tag-red-text" : "text-ui-fg-subtle"}>
          {ours ? row.next_action.label : `Waiting · ${row.waiting_on === "supplier" ? "supplier" : "customer"}`}
        </span>
        {row.days ? <span title={`Waiting ${row.days} business day${row.days === 1 ? "" : "s"}`} className={ageClass(row)}>{row.days}d</span> : null}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ui-fg-muted">
        {money(row.total, row.currency_code) ? <span>{money(row.total, row.currency_code)}</span> : null}
        {row.pay === "paid" ? <span className="rounded bg-ui-tag-green-bg px-1 font-semibold text-ui-tag-green-text">Paid</span> : null}
        {owing ? <span className="rounded bg-ui-tag-red-bg px-1 font-semibold text-ui-tag-red-text">{row.pay === "part" ? "Part paid · " : ""}{owing} owing</span> : null}
        {row.risk === "late" && row.needed_by ? <span className="font-semibold text-ui-tag-red-text">Late · {shortDate(row.needed_by)}</span> : null}
        {row.risk === "at_risk" && row.needed_by ? <span className="font-semibold text-ui-tag-orange-text">At risk · {shortDate(row.needed_by)}</span> : null}
        {!row.risk && row.needed_by ? <span>Needed {shortDate(row.needed_by)}</span> : null}
        {row.rush_tier ? <span className="font-semibold text-ui-tag-red-text">{row.rush_tier === "express" ? "Express" : "Priority"}</span> : null}
        {(row.methods ?? []).map((m) => <span key={m} className={TAG}>{m}</span>)}
      </p>
      <Popover open={!!compose} onOpenChange={(o) => { if (!o) setCompose(null) }}>
        <Popover.Anchor asChild>
          <div className="relative z-10 flex flex-wrap gap-1.5 pt-0.5 empty:hidden">
            {oneClick ? (
              <Button size="small" variant={armed ? "danger" : "primary"} isLoading={busy === row.id} disabled={!!busy} onClick={onAct}>
                {armed ? "Yes, email customer" : row.next_action.label}
              </Button>
            ) : null}
            {canChase ? (
              <Button size="small" variant="secondary" disabled={!!busy || working} onClick={openChase} title="Write the customer a reminder. You see it before it sends.">Chase</Button>
            ) : null}
            {!row.owner ? (
              <Button size="small" variant="secondary" disabled={!!busy} onClick={onTake}>Take it</Button>
            ) : null}
            {/* Quiet until the card is hovered or tabbed into. */}
            <Button size="small" variant="transparent" disabled={working} onClick={() => setCompose({ mode: "note", text: "" })} className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
              + Note
            </Button>
          </div>
        </Popover.Anchor>
        <Popover.Content align="start" className="flex w-[340px] flex-col gap-2 p-3">
          <p className="text-xs font-semibold">
            {compose?.mode === "chase" ? `Reminder to ${compose.to}` : `Note on ${row.customer}`}
          </p>
          <Textarea
            autoFocus
            rows={compose?.mode === "chase" ? 9 : 3}
            placeholder="Called, left a voicemail…"
            value={compose?.text ?? ""}
            onChange={(e) => setCompose((c) => (c ? { ...c, text: e.target.value } : c))}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send() }}
          />
          <div className="flex justify-end gap-2">
            <Button size="small" variant="secondary" onClick={() => setCompose(null)}>Cancel</Button>
            <Button size="small" isLoading={working} disabled={!compose?.text.trim()} onClick={send}>
              {compose?.mode === "chase" ? "Email customer" : "Save note"}
            </Button>
          </div>
        </Popover.Content>
      </Popover>
    </article>
  )
}
