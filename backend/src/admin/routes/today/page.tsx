import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Sparkles } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import type { TodayRow, TodaySection, TodayView } from "../../../lib/job-today"
import { ONE_CLICK, performNextAction } from "../../components/job/actions"

const SECTIONS: { key: TodaySection; title: string; color: string; border: string }[] = [
  { key: "waiting_on_us", title: "Customer waiting on us", color: "text-ui-tag-red-text", border: "border-l-ui-tag-red-icon" },
  { key: "ready", title: "Ready to move", color: "text-ui-tag-green-text", border: "border-l-ui-tag-green-icon" },
  { key: "waiting_on_customer", title: "Waiting on customer", color: "text-ui-tag-blue-text", border: "border-l-ui-tag-blue-icon" },
]

const WAIT_PILL: Record<string, string> = {
  us: "bg-ui-tag-red-bg text-ui-tag-red-text",
  customer: "bg-ui-tag-blue-bg text-ui-tag-blue-text",
  supplier: "bg-ui-tag-orange-bg text-ui-tag-orange-text",
}
const WAIT_LABEL: Record<string, string> = { us: "Waiting on us", customer: "Customer", supplier: "Supplier" }

const PHASE_LABEL: Record<string, string> = {
  enquiry: "Enquiry", quoted: "Quoted", accepted: "Accepted", paid: "Paid", artwork: "Artwork",
  blanks: "Blanks", production: "In production", shipped: "Shipped", delivered: "Delivered",
}

const money = (n: number | null, cur: string) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: cur.toUpperCase() }).format(n)

const today = () => new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })

const dueBadge = (iso: string | null) => {
  if (!iso) return null
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return <Badge color="red" size="2xsmall">Overdue {-days}d</Badge>
  if (days <= 7) return <Badge color="orange" size="2xsmall">Due in {days}d</Badge>
  return null
}

const TodayPage = () => {
  const [view, setView] = useState<TodayView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

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

  const act = async (row: TodayRow) => {
    const kind = row.next_action.kind
    if (!ONE_CLICK.has(kind)) {
      window.location.href = `/app/jobs/${encodeURIComponent(row.id)}`
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

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h1">Today · {today()}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {view
              ? `${view.counts.waiting_on_us} waiting on you · ${view.counts.ready} ready to move · ${view.counts.waiting_on_customer} waiting on customers`
              : "Loading every open job…"}
          </Text>
        </div>
        <div className="flex gap-x-2">
          <Button size="small" variant="secondary" onClick={() => load(true)}>Refresh</Button>
          <Button size="small" variant="secondary" asChild><a href="/app/tasks">My tasks</a></Button>
          <Button size="small" asChild><a href="/app/quotes">+ New job</a></Button>
        </div>
      </div>

      {error ? <Container><Text className="text-ui-fg-error">{error}</Text></Container> : null}

      {view && view.counts.total === 0 ? (
        <Container><Text>Nothing open. Enjoy it.</Text></Container>
      ) : null}

      {view
        ? SECTIONS.map((s) => {
            const rows = view.sections[s.key]
            if (!rows.length) return null
            return (
              <section key={s.key} className="flex flex-col gap-y-2">
                <Text size="xsmall" weight="plus" className={`${s.color} tracking-wide`}>
                  {s.title.toUpperCase()} · {rows.length}
                </Text>
                {rows.map((row) => {
                  const oneClick = ONE_CLICK.has(row.next_action.kind)
                  return (
                    <div key={row.id} className={`flex flex-wrap items-center gap-3 rounded-lg border border-ui-border-base border-l-4 ${s.border} bg-ui-bg-base px-4 py-3`}>
                      <a href={`/app/jobs/${encodeURIComponent(row.id)}`} className="min-w-[260px] flex-1 hover:underline">
                        <Text weight="plus">
                          {row.customer} <span className="text-ui-fg-subtle font-normal">· {row.subject ?? row.label}{row.subject ? ` · ${row.label}` : ""}</span>
                        </Text>
                        <Text size="small" className="text-ui-fg-subtle truncate">
                          {row.last_activity ? `${row.last_activity.title}` : "No activity yet"}
                          {row.flags.length ? ` · ${row.flags.map((f) => f.label).join(" · ")}` : ""}
                        </Text>
                      </a>
                      <Badge size="2xsmall">{PHASE_LABEL[row.phase] ?? row.phase}</Badge>
                      {row.waiting_on ? (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${WAIT_PILL[row.waiting_on]}`}>
                          {WAIT_LABEL[row.waiting_on]}{row.days ? ` · ${row.days}d` : ""}
                        </span>
                      ) : null}
                      {dueBadge(row.due_date)}
                      <Text size="small" weight="plus" className="w-24 text-right">{money(row.total, row.currency_code)}</Text>
                      <Button
                        size="small"
                        variant={oneClick || row.next_action.kind === "convert_to_order" || row.next_action.kind === "reply" ? "primary" : "secondary"}
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
              </section>
            )
          })
        : null}

      {view ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          Built {new Date(view.generated_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}. Shipped and delivered jobs aren&apos;t listed.
        </Text>
      ) : null}
    </div>
  )
}

export const config = defineRouteConfig({
  rank: 0,
  label: "Today",
  icon: tinted(Sparkles, NAV_COLOR.tasks),
})

export default TodayPage
