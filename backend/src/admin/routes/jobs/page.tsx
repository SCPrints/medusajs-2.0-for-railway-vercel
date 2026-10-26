import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Sparkles } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import { TODAY_QUEUES, type TodayQueue, type TodayRow, type TodayView } from "../../../lib/job-today"
import { ONE_CLICK, performNextAction } from "../../components/job/actions"
import { NewQuoteDrawer } from "../../components/quote/new-quote-drawer"
import { AppLink, useGo } from "../../lib/nav"

/**
 * /app/jobs — every job in one list (Docs/ADMIN_JOBS_LIST_2026_10.md). Folders
 * across the top come from each job's next action (lib/job-today.ts);
 * "Needs us" is the default. Website enquiries arrive in New on their own;
 * "+ New job" is for phone calls and walk-ins. ?folder= and ?new=1 deep-link.
 */
type Folder = "needs_us" | TodayQueue

const FOLDERS: { key: Folder; label: string }[] = [{ key: "needs_us", label: "Needs us" }, ...TODAY_QUEUES]
const isFolder = (v: string | null): v is Folder => !!v && FOLDERS.some((f) => f.key === v)

const WAIT_PILL: Record<string, string> = {
  us: "bg-ui-tag-red-bg text-ui-tag-red-text",
  customer: "bg-ui-tag-blue-bg text-ui-tag-blue-text",
  supplier: "bg-ui-tag-orange-bg text-ui-tag-orange-text",
}
const WAIT_LABEL: Record<string, string> = { us: "Waiting on us", customer: "Customer", supplier: "Supplier" }

const SOURCE_LABEL: Record<string, string> = {
  contact: "Contact form",
  cart: "From their cart",
  customizer_poa: "Studio price request",
  byo: "BYO form",
}

const EMPTY: Partial<Record<Folder, string>> = {
  needs_us: "Nothing needs us right now.",
  new: "No new enquiries.",
  done: "Nothing finished in the last 90 days.",
  lost: "Nothing lost in the last 90 days.",
}

const money = (n: number | null, cur: string) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: cur.toUpperCase(), maximumFractionDigits: 0 }).format(n)

const today = () => new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
const shortDate = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })

const JobsPage = () => {
  const go = useGo()
  const [params, setParams] = useSearchParams()
  const folder: Folder = isFolder(params.get("folder")) ? (params.get("folder") as Folder) : "needs_us"
  const drawerOpen = params.get("new") === "1"
  const [view, setView] = useState<TodayView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState("")

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value == null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

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
  }, [load])

  const open = (row: TodayRow) => go(`/app/jobs/${encodeURIComponent(row.id)}`)

  const act = async (row: TodayRow) => {
    const kind = row.next_action.kind
    if (row.closed || !ONE_CLICK.has(kind)) return open(row)
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

  const markSpam = async (row: TodayRow) => {
    if (!row.quote_id) return
    setBusy(row.id)
    try {
      const r = await fetch(`/admin/quotes/${encodeURIComponent(row.quote_id)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "lost" }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      toast.success(`${row.customer} moved to Lost`)
      await load(true)
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't mark it as spam")
    } finally {
      setBusy(null)
    }
  }

  const needle = q.trim().toLowerCase()
  const rows = view
    ? needle
      ? view.rows.filter((r) => `${r.customer} ${r.subject ?? ""} ${r.label}`.toLowerCase().includes(needle))
      : view.rows.filter((r) => (folder === "needs_us" ? r.needs_us : r.queue === folder))
    : []
  const cur = view?.rows[0]?.currency_code ?? "aud"
  const count = (f: Folder) => (!view ? 0 : f === "needs_us" ? view.needs_us : view.queues[f])

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h1">Jobs · {today()}</Heading>
          {view ? (
            <Text size="small" className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span className={view.summary.owed_jobs ? "text-ui-tag-red-text" : "text-ui-fg-subtle"}>
                <b>{money(view.summary.owed, cur)}</b> owed across {view.summary.owed_jobs} job{view.summary.owed_jobs === 1 ? "" : "s"}
              </span>
              <span className={view.summary.late ? "text-ui-tag-red-text" : "text-ui-fg-subtle"}><b>{view.summary.late}</b> late</span>
              <span className={view.summary.at_risk ? "text-ui-tag-orange-text" : "text-ui-fg-subtle"}><b>{view.summary.at_risk}</b> at risk</span>
            </Text>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">Loading every job…</Text>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            size="small"
            aria-label="Search jobs"
            placeholder="Search customer, job number, what…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-64"
          />
          <Button size="small" variant="secondary" onClick={() => load(true)}>Refresh</Button>
          <Button size="small" variant="secondary" asChild><AppLink href="/app/tasks">My tasks</AppLink></Button>
          <Button size="small" onClick={() => setParam("new", "1")}>+ New job</Button>
        </div>
      </div>

      {view ? (
        <div className="flex flex-wrap gap-2">
          {FOLDERS.map((f) => (
            <FolderButton
              key={f.key}
              active={!needle && folder === f.key}
              onClick={() => {
                setQ("")
                setParam("folder", f.key === "needs_us" ? null : f.key)
              }}
              label={f.label}
              count={count(f.key)}
              hot={f.key === "needs_us"}
            />
          ))}
        </div>
      ) : null}

      {needle ? <Text size="small" className="text-ui-fg-subtle">Searching every folder for “{q.trim()}”.</Text> : null}

      {error ? <Container><Text className="text-ui-fg-error">{error}</Text></Container> : null}

      {view && rows.length === 0 ? (
        <Container><Text>{needle ? "No job matches." : EMPTY[folder] ?? "Nothing here right now."}</Text></Container>
      ) : null}

      <div className="flex flex-col gap-y-2">
        {rows.map((row) => {
          const oneClick = !row.closed && ONE_CLICK.has(row.next_action.kind)
          const stripe = row.closed
            ? "border-l-ui-border-strong"
            : row.risk === "late" || row.needs_us
              ? "border-l-ui-tag-red-icon"
              : row.waiting_on === "customer"
                ? "border-l-ui-tag-blue-icon"
                : "border-l-ui-tag-green-icon"
          const source = row.queue === "new" && row.source ? SOURCE_LABEL[row.source] : null
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
              {source ? <Badge color="blue" size="2xsmall">{source}</Badge> : null}
              {row.bot && !row.closed ? (
                <>
                  <Badge color="orange" size="2xsmall">Possible bot</Badge>
                  <Button size="small" variant="secondary" isLoading={busy === row.id} disabled={!!busy} onClick={() => markSpam(row)}>Spam</Button>
                </>
              ) : null}
              {row.risk === "late" ? <Badge color="red" size="2xsmall">Late · needed {row.needed_by ? shortDate(row.needed_by) : ""}</Badge> : null}
              {row.risk === "at_risk" ? <Badge color="orange" size="2xsmall">At risk · needed {row.needed_by ? shortDate(row.needed_by) : ""}</Badge> : null}
              {row.rush_tier && !row.closed ? <Badge color="red" size="2xsmall">{row.rush_tier === "express" ? "Express" : "Priority"}</Badge> : null}
              {row.closed ? <Badge color="grey" size="2xsmall">{row.queue === "lost" ? "Lost" : row.next_action.label}</Badge> : null}
              {row.waiting_on && !row.closed ? (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${WAIT_PILL[row.waiting_on]}`}>
                  {WAIT_LABEL[row.waiting_on]}{row.days ? ` · ${row.days}d` : ""}
                </span>
              ) : null}
              <Text size="small" weight="plus" className="w-24 text-right tabular-nums">
                {row.outstanding && row.order_id && !row.closed ? <span className="text-ui-tag-red-text">{money(row.outstanding, row.currency_code)} owing</span> : money(row.total, row.currency_code)}
              </Text>
              <Button
                size="small"
                variant={!row.closed && (oneClick || row.needs_us) ? "primary" : "secondary"}
                isLoading={busy === row.id}
                disabled={!!busy}
                onClick={() => act(row)}
                title={row.next_action.blockers?.length ? `Not ready: ${row.next_action.blockers.join("; ")}` : undefined}
              >
                {row.closed ? "Open" : row.next_action.label}
              </Button>
            </div>
          )
        })}
      </div>

      {view ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          Built {new Date(view.generated_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}. A job moves to Done when it is delivered and paid. Done and Lost keep the last 90 days.
        </Text>
      ) : null}

      <NewQuoteDrawer
        open={drawerOpen}
        onClose={() => setParam("new", null)}
        onCreated={(id) => {
          // The job window takes it from here; a Studio popup opened from the
          // drawer keeps posting designs to the quote on its own.
          go(`/app/jobs/${encodeURIComponent(id)}#quote`)
        }}
      />
    </div>
  )
}

function FolderButton({ active, onClick, label, count, hot }: { active: boolean; onClick: () => void; label: string; count: number; hot?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${active ? "border-ui-fg-base bg-ui-fg-base text-ui-bg-base" : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle-hover"}`}
    >
      {label}
      <b className={`tabular-nums ${!active && hot && count ? "text-ui-tag-red-text" : ""}`}>{count}</b>
    </button>
  )
}

export const config = defineRouteConfig({
  rank: 0,
  label: "Jobs",
  icon: tinted(Sparkles, NAV_COLOR.tasks),
})

export default JobsPage
