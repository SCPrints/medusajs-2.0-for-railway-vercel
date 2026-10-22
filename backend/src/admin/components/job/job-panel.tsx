import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Tabs, Text, Textarea, toast } from "@medusajs/ui"
import { useState, type ComponentType, type ReactNode } from "react"

import { JOB_PHASES, type NextActionKind } from "../../../lib/job-state"
import type { JobActivity, JobView } from "../../../lib/job-view"
import { ONE_CLICK, performNextAction } from "./actions"
import { ConvertAddressForm } from "./convert-address-form"
import { DspPackPanel } from "./dsp-pack"
import * as W from "./widgets"

type Tab = "overview" | "artwork" | "production" | "delivery" | "activity"

type Props = {
  job: JobView
  /** The Medusa order, when there is one — the moved widgets take it as `data`. */
  order?: AdminOrder | null
  onChanged: () => void
}

const fmtMoney = (n: number | null | undefined, cur: string) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: cur.toUpperCase() }).format(n)

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"

const fmtWhen = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`
}

const WAIT_STYLE: Record<string, { bg: string; label: string }> = {
  us: { bg: "bg-ui-tag-red-bg text-ui-tag-red-text", label: "Waiting on us" },
  customer: { bg: "bg-ui-tag-blue-bg text-ui-tag-blue-text", label: "Waiting on customer" },
  supplier: { bg: "bg-ui-tag-orange-bg text-ui-tag-orange-text", label: "Waiting on supplier" },
}

const ACTIVITY_TAG: Record<JobActivity["kind"], { label: string; cls: string }> = {
  enquiry: { label: "ENQUIRY", cls: "bg-ui-tag-blue-bg text-ui-tag-blue-text" },
  email_in: { label: "EMAIL IN", cls: "bg-ui-tag-red-bg text-ui-tag-red-text" },
  email_out: { label: "EMAIL OUT", cls: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text" },
  note: { label: "NOTE", cls: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text" },
  stage: { label: "STAGE", cls: "bg-ui-tag-green-bg text-ui-tag-green-text" },
  status: { label: "STATUS", cls: "bg-ui-tag-green-bg text-ui-tag-green-text" },
  comment: { label: "COMMENT", cls: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text" },
  photo: { label: "PHOTO", cls: "bg-ui-tag-purple-bg text-ui-tag-purple-text" },
  reject: { label: "REJECT", cls: "bg-ui-tag-orange-bg text-ui-tag-orange-text" },
  nps: { label: "NPS", cls: "bg-ui-tag-purple-bg text-ui-tag-purple-text" },
  system: { label: "SYSTEM", cls: "bg-ui-tag-neutral-bg text-ui-tag-neutral-text" },
  task: { label: "TASK", cls: "bg-ui-tag-orange-bg text-ui-tag-orange-text" },
}

/**
 * Mount a moved widget with the order as `data`, exactly as Medusa did. The
 * widgets each declare a narrower `data` shape, so the prop is typed loosely.
 */
const Mount = ({ W: Widget, order }: { W: ComponentType<{ data: any }>; order: AdminOrder }) => (
  <Widget data={order} />
)

export function JobPanel({ job, order, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>(job.state.next_action.tab ?? "overview")
  const [busy, setBusy] = useState<NextActionKind | null>(null)
  const [convertOpen, setConvertOpen] = useState(false)
  const cur = job.money.currency_code
  const wait = job.state.waiting_on ? WAIT_STYLE[job.state.waiting_on] : null
  const action = job.state.next_action
  const orderId = job.order?.id ?? null

  const runAction = async (kind: NextActionKind) => {
    setBusy(kind)
    try {
      const out = await performNextAction(
        {
          job_id: job.id,
          order_id: orderId,
          quote_id: job.quote?.id ?? null,
          display_id: job.order?.display_id ?? null,
          outstanding: job.money.outstanding ?? job.money.order_total,
        },
        kind
      )
      if ("navigate" in out) {
        window.location.href = out.navigate
        return
      }
      if ("tab" in out) {
        setTab(out.tab)
        if (out.open === "convert") setConvertOpen(true)
        if (out.focus) setTimeout(() => document.getElementById(out.focus!)?.focus(), 50)
        return
      }
      onChanged()
    } catch (err: any) {
      if (err?.message !== "Not started") toast.error(err?.message ?? "That didn't work")
    } finally {
      setBusy(null)
    }
  }

  const primaryIsPost = ONE_CLICK.has(action.kind)

  return (
    <div className="flex flex-col gap-y-3">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Container className="flex flex-col gap-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Heading level="h1" className="truncate">
              {job.customer.name ?? job.customer.email ?? "Customer"}
              {job.quote?.subject ? <span className="text-ui-fg-subtle font-normal"> · {job.quote.subject}</span> : null}
            </Heading>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ui-fg-subtle">
              {job.customer.email ? <a className="hover:underline" href={`mailto:${job.customer.email}`}>{job.customer.email}</a> : null}
              {job.customer.phone ? <a className="hover:underline" href={`tel:${job.customer.phone}`}>{job.customer.phone}</a> : null}
              {job.customer.company ? <span>{job.customer.company}</span> : null}
              <span>{job.customer.has_account ? "Account" : "Guest"}</span>
              <span>Owner: {job.owner?.label ?? "unassigned"}</span>
              {job.quote ? <a className="hover:underline" href={`/app/quotes?id=${job.quote.id}`}>{job.quote.public_id}</a> : null}
              {job.order ? <a className="hover:underline" href={`/app/orders/${job.order.id}`}>Order #{job.order.display_id ?? ""}</a> : null}
            </div>
          </div>
          <div className="flex gap-x-6 text-right">
            <div><Text size="xsmall" className="text-ui-fg-muted">QUOTED</Text><Text weight="plus">{fmtMoney(job.money.quoted, cur)}</Text></div>
            <div><Text size="xsmall" className="text-ui-fg-muted">ORDER</Text><Text weight="plus">{fmtMoney(job.money.order_total, cur)}</Text></div>
            <div><Text size="xsmall" className="text-ui-fg-muted">PAID</Text><Text weight="plus">{fmtMoney(job.money.paid, cur)}</Text></div>
            {job.money.outstanding ? (
              <div><Text size="xsmall" className="text-ui-fg-muted">OWING</Text><Text weight="plus" className="text-ui-tag-red-text">{fmtMoney(job.money.outstanding, cur)}</Text></div>
            ) : null}
          </div>
        </div>

        <ol aria-label="Job phases" className="grid grid-cols-9 gap-1.5 list-none p-0 m-0">
          {JOB_PHASES.map((p) => {
            const step = job.state.steps.find((s) => s.key === p.key)
            const current = job.state.phase === p.key
            return (
              <li key={p.key} className={`border-t-4 pt-1.5 ${step?.done ? (current ? "border-ui-fg-interactive" : "border-ui-tag-green-icon") : "border-ui-border-base text-ui-fg-muted"}`}>
                <Text size="xsmall" weight={current ? "plus" : "regular"}>{p.label}</Text>
                <Text size="xsmall" className="text-ui-fg-muted">{fmtDate(step?.at)}</Text>
              </li>
            )
          })}
        </ol>

        {!job.state.lost ? (
          <div className={`flex flex-wrap items-center gap-3 rounded-md px-4 py-3 ${job.state.waiting_on === "us" ? "bg-ui-tag-red-bg" : "bg-ui-bg-subtle"}`}>
            {wait ? (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${wait.bg}`}>
                {wait.label}{job.state.days ? ` · ${job.state.days} business day${job.state.days === 1 ? "" : "s"}` : ""}
              </span>
            ) : null}
            <Text size="small" className="flex-1 min-w-[200px]">
              {action.blockers?.length ? `Not ready: ${action.blockers.join("; ")}.` : job.flags.map((f) => f.label).join(" · ") || "Nothing blocking."}
            </Text>
            {action.kind !== "none" ? (
              <Button size="base" isLoading={busy === action.kind} disabled={!!busy} onClick={() => runAction(action.kind)} variant={primaryIsPost || action.kind === "convert_to_order" ? "primary" : "secondary"}>
                {action.label}
              </Button>
            ) : (
              <Badge color="green">{action.label}</Badge>
            )}
            <Button size="base" variant="secondary" onClick={() => runAction("reply")}>Reply</Button>
          </div>
        ) : (
          <Badge color="grey">Closed</Badge>
        )}
      </Container>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <Tabs.List>
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="artwork">Artwork</Tabs.Trigger>
          <Tabs.Trigger value="production">Production</Tabs.Trigger>
          <Tabs.Trigger value="delivery">Delivery</Tabs.Trigger>
          <Tabs.Trigger value="activity">
            Activity{job.unread_inbound ? <Badge color="red" size="2xsmall" className="ml-1">{job.unread_inbound} new</Badge> : null}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview" className="mt-3">
          <TwoCol
            main={
              <>
                {convertOpen && job.quote && !job.order ? (
                  <ConvertAddressForm
                    quote={{ id: job.quote.id, contact_name: job.customer.name, contact_phone: job.customer.phone, company: job.customer.company, metadata: job.address.shipping ? { delivery_address: job.address.shipping } : null }}
                    onDone={() => { setConvertOpen(false); onChanged() }}
                    onCancel={() => setConvertOpen(false)}
                  />
                ) : null}
                <Container>
                  <div className="flex items-center justify-between mb-2">
                    <Heading level="h2">Lines</Heading>
                    {job.quote ? (
                      <Button size="small" variant="secondary" asChild>
                        <a href={job.quote.has_job_pricer ? `/app/quote-pricer?quote=${job.quote.id}` : `/app/quotes?id=${job.quote.id}`}>{job.quote.has_job_pricer ? "Edit in Job pricer" : "Edit quote"}</a>
                      </Button>
                    ) : null}
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-ui-fg-muted text-xs"><th className="py-1 font-medium">ITEM</th><th className="py-1 text-right font-medium">QTY</th><th className="py-1 text-right font-medium">EACH</th><th className="py-1 text-right font-medium">TOTAL</th></tr></thead>
                    <tbody>
                      {job.lines.map((l) => (
                        <tr key={l.id} className="border-t border-ui-border-base">
                          <td className="py-2 flex items-center gap-2">
                            {l.thumbnail ? <img src={l.thumbnail} alt="" className="h-8 w-8 rounded object-cover" /> : null}
                            <span><span className="font-medium">{l.title}</span>{l.decorated ? <Badge size="2xsmall" className="ml-1">decorated</Badge> : null}{l.subtitle ? <span className="block text-ui-fg-subtle text-xs">{l.subtitle}</span> : null}</span>
                          </td>
                          <td className="py-2 text-right">{l.quantity}</td>
                          <td className="py-2 text-right">{fmtMoney(l.unit_price, cur)}</td>
                          <td className="py-2 text-right font-medium">{fmtMoney(l.total, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Container>
                {order ? (
                  <>
                    <Mount W={W.OrderDeposit} order={order} />
                    <Mount W={W.OrderEmailInvoice} order={order} />
                    <Mount W={W.OrderShippingDecision} order={order} />
                    <Mount W={W.OrderAppliedPerks} order={order} />
                  </>
                ) : (
                  <Container>
                    <Heading level="h2">Payment</Heading>
                    <Text size="small" className="text-ui-fg-subtle mt-1">The tax invoice and card-payment link go out when the quote is converted to an order.</Text>
                  </Container>
                )}
              </>
            }
            side={
              <>
                <Container className={job.address.placeholder || !job.address.shipping ? "border-ui-tag-orange-border" : ""}>
                  <Heading level="h2">Delivery address</Heading>
                  {job.address.shipping && !job.address.placeholder ? (
                    <Text size="small" className="mt-1 whitespace-pre-line">
                      {[job.address.shipping.name, job.address.shipping.company, job.address.shipping.address_1, job.address.shipping.address_2, [job.address.shipping.city, job.address.shipping.province, job.address.shipping.postal_code].filter(Boolean).join(" "), job.address.shipping.phone].filter(Boolean).join("\n")}
                    </Text>
                  ) : (
                    <Text size="small" className="mt-1 text-ui-tag-orange-text">{job.address.placeholder ? "Studio placeholder — ask the customer" : "Not on file"}</Text>
                  )}
                  {job.order?.delivery_method ? <Badge size="2xsmall" className="mt-2">{job.order.delivery_method}</Badge> : null}
                </Container>
                <Container>
                  <Heading level="h2">Flags</Heading>
                  {job.flags.length ? (
                    <ul className="mt-1 list-disc pl-4 text-sm">{job.flags.map((f) => <li key={f.kind}>{f.label}</li>)}</ul>
                  ) : (
                    <Text size="small" className="text-ui-fg-subtle mt-1">None</Text>
                  )}
                </Container>
                {order ? <Mount W={W.OrderTasks} order={order} /> : (
                  <Container>
                    <Heading level="h2">Tasks</Heading>
                    {job.tasks.length ? <ul className="mt-1 text-sm">{job.tasks.map((t) => <li key={t.id}>{t.title}{t.due_at ? <span className="text-ui-fg-muted"> · due {fmtDate(t.due_at)}</span> : null}</li>)}</ul> : <Text size="small" className="text-ui-fg-subtle mt-1">None open</Text>}
                  </Container>
                )}
                {order ? <Mount W={W.OrderOwner} order={order} /> : null}
              </>
            }
          />
        </Tabs.Content>

        <Tabs.Content value="artwork" className="mt-3 flex flex-col gap-y-3">
          {order ? (
            <>
              <Mount W={W.OrderCustomizerDownloads} order={order} />
              <Mount W={W.OrderCustomizerPrintDetails} order={order} />
              <Mount W={W.OrderDtfGangsheet} order={order} />
              <Mount W={W.OrderScreenColourCheck} order={order} />
              <Mount W={W.OrderVectorizationFlag} order={order} />
            </>
          ) : (
            <Container>
              <Heading level="h2">Design approval</Heading>
              <Text size="small" className="mt-1">{job.quote?.design_approval_status ? `Status: ${job.quote.design_approval_status}` : "No design approval sent yet."}</Text>
              <Text size="small" className="text-ui-fg-subtle mt-1">Design in the Studio and send the approval link from the quote.</Text>
              <Button size="small" variant="secondary" className="mt-2" asChild><a href={`/app/quotes?id=${job.quote?.id}`}>Open quote</a></Button>
            </Container>
          )}
        </Tabs.Content>

        <Tabs.Content value="production" className="mt-3 flex flex-col gap-y-3">
          {order ? (
            <>
              <DspPackPanel jobId={job.id} />
              <Mount W={W.OrderProductionStage} order={order} />
              <Mount W={W.OrderPrintRecipes} order={order} />
              <Mount W={W.OrderLinePrintNotes} order={order} />
              <Mount W={W.OrderProductionPhotos} order={order} />
              <Mount W={W.OrderRejects} order={order} />
              <Mount W={W.OrderPackingCheck} order={order} />
            </>
          ) : (
            <Container><Text size="small" className="text-ui-fg-subtle">Production tracking starts when the order is created.</Text></Container>
          )}
        </Tabs.Content>

        <Tabs.Content value="delivery" className="mt-3 flex flex-col gap-y-3">
          {order ? (
            <>
              <Mount W={W.OrderFulfillmentContext} order={order} />
              <Mount W={W.OrderAscolourDropship} order={order} />
              <Mount W={W.OrderAussiePacificDropship} order={order} />
              <Mount W={W.OrderBottleShopDropship} order={order} />
              <Mount W={W.OrderAuspostParcels} order={order} />
              <Mount W={W.OrderDriveFolder} order={order} />
            </>
          ) : (
            <Container><Text size="small" className="text-ui-fg-subtle">Blanks, dropship and shipping live on the order once it exists.</Text></Container>
          )}
        </Tabs.Content>

        <Tabs.Content value="activity" className="mt-3 flex flex-col gap-y-3">
          <ReplyBox jobId={job.id} to={job.customer.email} onSent={onChanged} />
          <Container>
            <ul className="divide-y divide-ui-border-base">
              {job.activity.map((a, i) => {
                const tag = ACTIVITY_TAG[a.kind]
                return (
                  <li key={`${a.at}-${i}`} className="flex gap-3 py-2 text-sm">
                    <span className="w-28 shrink-0 text-ui-fg-muted text-xs pt-0.5">{fmtWhen(a.at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tag.cls}`}>{tag.label}</span>
                      <span className="font-medium">{a.title}</span>
                      {a.actor && a.kind !== "email_in" ? <span className="text-ui-fg-muted"> · {a.actor.replace(/^(staff-email:|staff-note:|email:)/, "")}</span> : null}
                      {a.detail ? <span className="block whitespace-pre-wrap text-ui-fg-subtle mt-0.5">{a.detail}</span> : null}
                      {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" className="mt-1 h-16 rounded" /> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Container>
          {order ? (
            <>
              <Mount W={W.OrderWatchers} order={order} />
              <Mount W={W.OrderNps} order={order} />
            </>
          ) : null}
        </Tabs.Content>
      </Tabs>
    </div>
  )
}

const TwoCol = ({ main, side }: { main: ReactNode; side: ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
    <div className="flex flex-col gap-y-3 min-w-0">{main}</div>
    <div className="flex flex-col gap-y-3 min-w-0">{side}</div>
  </div>
)

function ReplyBox({ jobId, to, onSent }: { jobId: string; to: string | null; onSent: () => void }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState<"email" | "note" | null>(null)
  const send = async (channel: "email" | "note") => {
    if (!text.trim()) return
    setBusy(channel)
    try {
      const res = await fetch(`/admin/jobs/${encodeURIComponent(jobId)}/reply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, body: text.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as any)?.error ?? `HTTP ${res.status}`)
      toast.success(channel === "email" ? `Emailed ${to}` : "Note logged")
      setText("")
      onSent()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed")
    } finally {
      setBusy(null)
    }
  }
  return (
    <Container className="flex flex-col gap-y-2">
      <Text size="xsmall" className="text-ui-fg-muted">{to ? `REPLY TO ${to.toUpperCase()}` : "LOG A NOTE"}</Text>
      <Textarea id="job-reply" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={to ? "Hi … (plain text; replies land back on this job)" : "What happened?"} />
      <div className="flex justify-end gap-x-2">
        <Button size="small" variant="secondary" isLoading={busy === "note"} disabled={!!busy || !text.trim()} onClick={() => send("note")}>Log note / call</Button>
        {to ? <Button size="small" isLoading={busy === "email"} disabled={!!busy || !text.trim()} onClick={() => send("email")}>Send email</Button> : null}
      </div>
    </Container>
  )
}
