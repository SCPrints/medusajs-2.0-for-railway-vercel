import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Sparkles } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import { TODAY_QUEUES, type TodayQueue, type TodayRow, type TodayView } from "../../../lib/job-today"
import { ONE_CLICK, performNextAction } from "../../components/job/actions"
import { AppLink, useGo } from "../../lib/nav"

type Chip = "needs_us" | TodayQueue | "all"

const WAIT_PILL: Record<string, string> = {
  us: "bg-ui-tag-red-bg text-ui-tag-red-text",
  customer: "bg-ui-tag-blue-bg text-ui-tag-blue-text",
  supplier: "bg-ui-tag-orange-bg text-ui-tag-orange-text",
}
const WAIT_LABEL: Record<string, string> = { us: "Waiting on us", customer: "Customer", supplier: "Supplier" }

const money = (n: number | null, cur: string) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: cur.toUpperCase(), maximumFractionDigits: 0 }).format(n)

const today = () => new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
const shortDate = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })

const ENQUIRY_WINDOW_DAYS = 7

const TodayPage = () => {
  const go = useGo()
  const [view, setView] = useState<TodayView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [chip, setChip] = useState<Chip>("needs_us")
  const [enquiries, setEnquiries] = useState<number | null>(null)

  const load = useCallback(async (fresh = false) => {
    try {
      const r = await fetch(`/admin/jobs${fresh ? "?fresh=1" : ""}`, { credentials: "include" })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`)
      setView(json as TodayView)
      setError(null)
    } catch (err: any) {
      setError(err?.message ?? "Failed to load")
    }
  }, [])

  useEffect(() => {
    void load()
    // New enquiries = contact-form submissions from the last week that haven't
    // been started as a job. The route has no "handled" flag, so count by age.
    fetch(`/admin/contact-submissions?limit=100`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const since = Date.now() - ENQUIRY_WINDOW_DAYS * 86_400_000
        const rows: { created_at: string }[] = json?.submissions ?? []
        setEnquiries(rows.filter((s) => Date.parse(s.created_at) >= since).length)
      })
      .catch(() => setEnquiries(null))
  }, [load])

  const act = async (row: TodayRow) => {
    const kind = row.next_action.kind
    if (!ONE_CLICK.has(kind)) {
      go(`/app/jobs/${encodeURIComponent(row.id)}`)
      return
    }
    setBusy(row.id)
    try {
      await performNextAction(
        { job_id: row.id, order_id: row.order_id, quote_id: row.quote_id, display_id: row.display_id, outstanding: row.outstanding ?? row.total },
        kind
      )
      await load(true)
    } catch (err: any) {
      if (err?.message !== "Not started") toast.error(err?.message ?? "That didn't work")
    } finally {
      setBusy(null)
    }
  }

  const rows = view ? view.rows.filter((r) => (chip === "all" ? true : chip === "needs_us" ? r.needs_us : r.queue === chip)) : []
  const cur = view?.rows[0]?.currency_code ?? "aud"

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h1">Today · {today()}</Heading>
          {view ? (
            <Text size="small" className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span className={view.summary.owed_jobs ? "text-ui-tag-red-text" : "text-ui-fg-subtle"}>
                <b>{money(view.summary.owed, cur)}</b> owed across {view.summary.owed_jobs} job{view.summary.owed_jobs === 1 ? "" : "s"}
              </span>
              <span className={view.summary.late ? "text-ui-tag-red-text" : "text-ui-fg-subtle"}><b>{view.summary.late}</b> late</span>
              <span className={view.summary.at_risk ? "text-ui-tag-orange-text" : "text-ui-fg-subtle"}><b>{view.summary.at_risk}</b> at risk</span>
              {enquiries != null ? <span className="text-ui-fg-subtle"><b>{enquiries}</b> new enquir{enquiries === 1 ? "y" : "ies"} this week</span> : null}
            </Text>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">Loading every open job…</Text>
          )}
        </div>
        <div className="flex gap-x-2">
          <Button size="small" variant="secondary" onClick={() => load(true)}>Refresh</Button>
          <Button size="small" variant="secondary" asChild><AppLink href="/app/tasks">My tasks</AppLink></Button>
          <Button size="small" asChild><AppLink href="/app/quotes?new=1">+ New job</AppLink></Button>
        </div>
      </div>

      {view ? (
        <div className="flex flex-wrap gap-2">
          <ChipButton active={chip === "needs_us"} onClick={() => setChip("needs_us")} label="Needs us" count={view.needs_us} hot />
          {TODAY_QUEUES.map((q) => (
            <ChipButton key={q.key} active={chip === q.key} onClick={() => setChip(q.key)} label={q.label} count={view.queues[q.key]} />
          ))}
          <ChipButton active={chip === "all"} onClick={() => setChip("all")} label="All open" count={view.rows.length} />
          <AppLink href="/app/enquiries" className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ui-border-base px-3 py-1 text-sm hover:bg-ui-bg-subtle-hover">
            Enquiries{enquiries != null ? <b className="tabular-nums">{enquiries}</b> : null} →
          </AppLink>
        </div>
      ) : null}

      {error ? <Container><Text className="text-ui-fg-error">{error}</Text></Container> : null}

      {view && rows.length === 0 ? (
        <Container><Text>{view.rows.length === 0 ? "Nothing open. Enjoy it." : "Nothing here right now."}</Text></Container>
      ) : null}

      <div className="flex flex-col gap-y-2">
        {rows.map((row) => {
          const oneClick = ONE_CLICK.has(row.next_action.kind)
          const stripe = row.risk === "late" ? "border-l-ui-tag-red-icon" : row.needs_us ? "border-l-ui-tag-red-icon" : row.waiting_on === "customer" ? "border-l-ui-tag-blue-icon" : "border-l-ui-tag-green-icon"
          return (
            <div key={row.id} className={`flex flex-wrap items-center gap-3 rounded-lg border border-ui-border-base border-l-4 ${stripe} bg-ui-bg-base px-4 py-3`}>
              <AppLink href={`/app/jobs/${encodeURIComponent(row.id)}`} className="min-w-[260px] flex-1 hover:underline">
                <Text weight="plus">
                  {row.customer} <span className="text-ui-fg-subtle font-normal">· {row.subject ?? row.label}{row.subject ? ` · ${row.label}` : ""}</span>
                </Text>
                <Text size="small" className="text-ui-fg-subtle truncate">
                  {row.last_activity ? row.last_activity.title : "No activity yet"}
                  {row.flags.length ? ` · ${row.flags.map((f) => f.label).join(" · ")}` : ""}
                </Text>
              </AppLink>
              {row.risk === "late" ? <Badge color="red" size="2xsmall">Late · needed {row.needed_by ? shortDate(row.needed_by) : ""}</Badge> : null}
              {row.risk === "at_risk" ? <Badge color="orange" size="2xsmall">At risk · needed {row.needed_by ? shortDate(row.needed_by) : ""}</Badge> : null}
              {row.rush_tier ? <Badge color="red" size="2xsmall">{row.rush_tier === "express" ? "Express" : "Priority"}</Badge> : null}
              {row.waiting_on ? (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${WAIT_PILL[row.waiting_on]}`}>
                  {WAIT_LABEL[row.waiting_on]}{row.days ? ` · ${row.days}d` : ""}
                </span>
              ) : null}
              <Text size="small" weight="plus" className="w-24 text-right tabular-nums">
                {row.outstanding && row.order_id ? <span className="text-ui-tag-red-text">{money(row.outstanding, row.currency_code)} owing</span> : money(row.total, row.currency_code)}
              </Text>
              <Button
                size="small"
                variant={oneClick || row.needs_us ? "primary" : "secondary"}
                isLoading={busy === row.id}
                disabled={!!busy}
                onClick={() => act(row)}
                title={row.next_action.blockers?.length ? `Not ready: ${row.next_action.blockers.join("; ")}` : undefined}
              >
                {row.next_action.label}
              </Button>
            </div>
          )
        })}
      </div>

      {view ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          Built {new Date(view.generated_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}. A job leaves this list when it is delivered and paid.
        </Text>
      ) : null}
    </div>
  )
}

function ChipButton({ active, onClick, label, count, hot }: { active: boolean; onClick: () => void; label: string; count: number; hot?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${active ? "border-ui-fg-base bg-ui-fg-base text-ui-bg-base" : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle-hover"}`}
    >
      {label}
      <b className={`tabular-nums ${!active && hot && count ? "text-ui-tag-red-text" : ""}`}>{count}</b>
    </button>
  )
}

export const config = defineRouteConfig({
  rank: 0,
  label: "Today",
  icon: tinted(Sparkles, NAV_COLOR.tasks),
})

export default TodayPage
