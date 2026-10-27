import type { AdminOrder } from "@medusajs/framework/types"
import { Badge, Button, Container, Drawer, DropdownMenu, Heading, Input, Tabs, Text, Textarea, toast } from "@medusajs/ui"
import { useState, type ComponentType, type ReactNode } from "react"

import { JOB_PHASES, threadTimes, type NextActionKind } from "../../../lib/job-state"
import type { JobActivity, JobView } from "../../../lib/job-view"
import { ONE_CLICK, performNextAction } from "./actions"
import { TaskQuickAdd } from "../task-quick-add"
import { ConvertAddressForm } from "./convert-address-form"
import { DspPackPanel } from "./dsp-pack"
import * as W from "./widgets"
import { AppLink, useGo } from "../../lib/nav"

/**
 * The job window (Docs/ADMIN_JOB_WINDOW_2026_10.md): header, phase strip, ONE
 * action bar, the job's tabs on the left and the diary — every email, call,
 * note and update — always on the right.
 */

type Tab = "overview" | "artwork" | "production" | "delivery"
type Verb = "proof" | "money" | "blanks" | "stage" | "dsp" | "drive" | "task"

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

/** Routine rows that fold into one "N updates" line in the diary. */
const UPDATE_KINDS: ReadonlySet<JobActivity["kind"]> = new Set(["stage", "status", "system", "task"])

/**
 * Mount a moved widget with the order as `data`, exactly as Medusa did. The
 * widgets each declare a narrower `data` shape, so the prop is typed loosely.
 */
const Mount = ({ W: Widget, order }: { W: ComponentType<{ data: any }>; order: AdminOrder }) => (
  <Widget data={order} />
)

const VERB_TITLE: Record<Verb, string> = {
  proof: "Proof & artwork",
  money: "Invoice & payment",
  blanks: "Blanks",
  stage: "Change stage",
  dsp: "Send to DSP",
  drive: "Drive folder",
  task: "Tasks",
}

export function JobPanelClassic({ job, order, onChanged }: Props) {
  const go = useGo()
  const firstTab = job.state.next_action.tab
  const [tab, setTab] = useState<Tab>(firstTab && firstTab !== "activity" ? firstTab : "overview")
  const [busy, setBusy] = useState<NextActionKind | null>(null)
  const [convertOpen, setConvertOpen] = useState(false)
  const [verb, setVerb] = useState<Verb | null>(null)
  const cur = job.money.currency_code
  const wait = job.state.waiting_on ? WAIT_STYLE[job.state.waiting_on] : null
  const action = job.state.next_action
  const orderId = job.order?.id ?? null
  const decorated = job.lines.some((l) => l.decorated)

  const focusComposer = () => setTimeout(() => document.getElementById("job-reply")?.focus(), 50)

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
        go(out.navigate)
        return
      }
      if ("tab" in out) {
        // The diary is always on screen: "activity" means the composer.
        if (out.tab === "activity") focusComposer()
        else setTab(out.tab)
        if (out.open === "convert") setConvertOpen(true)
        if (out.open === "proof" || out.open === "blanks") setVerb(out.open)
        if (out.focus && out.tab !== "activity") setTimeout(() => document.getElementById(out.focus!)?.focus(), 50)
        return
      }
      onChanged()
    } catch (err: any) {
      if (err?.message !== "Not started") toast.error(err?.message ?? "That didn't work")
    } finally {
      setBusy(null)
    }
  }

  const copyJobLink = async () => {
    const url = `${window.location.origin}/app/jobs/${encodeURIComponent(job.id)}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Job link copied")
    } catch {
      toast.info(url)
    }
  }

  // Verbs that apply to this job, in one place. Each opens the existing tool
  // over the job; nothing is shown when it doesn't apply.
  const verbs: { key: Verb; label: string }[] = order
    ? [
        ...(decorated ? [{ key: "proof" as const, label: "Proof" }] : []),
        { key: "money" as const, label: "Invoice & pay" },
        { key: "blanks" as const, label: "Blanks" },
        { key: "stage" as const, label: "Change stage" },
      ]
    : []

  return (
    <div className="flex flex-col gap-y-3">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Container className="flex flex-col gap-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Heading level="h1" className="truncate">
              {job.order?.rush_tier ? <Badge color="red" className="mr-2 align-middle">{job.order.rush_tier === "express" ? "Express" : "Priority"}</Badge> : null}
              {job.customer.name ?? job.customer.email ?? "Customer"}
              {job.quote?.subject ? <span className="text-ui-fg-subtle font-normal"> · {job.quote.subject}</span> : null}
            </Heading>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ui-fg-subtle">
              {job.customer.email ? <a className="hover:underline" href={`mailto:${job.customer.email}`}>{job.customer.email}</a> : null}
              {job.customer.phone ? <a className="hover:underline" href={`tel:${job.customer.phone}`}>{job.customer.phone}</a> : null}
              {job.customer.company ? <span>{job.customer.company}</span> : null}
              <span>Owner: {job.owner?.label ?? "unassigned"}</span>
              {job.quote ? <span>{job.quote.public_id}</span> : null}
              {job.order ? <span>Order #{job.order.display_id ?? ""}</span> : null}
            </div>
          </div>
          <div className="flex gap-x-6 text-right">
            {!job.order ? (
              <div><Text size="xsmall" className="text-ui-fg-muted">QUOTED</Text><Text weight="plus">{fmtMoney(job.money.quoted, cur)}</Text></div>
            ) : (
              <>
                <div><Text size="xsmall" className="text-ui-fg-muted">TOTAL</Text><Text weight="plus">{fmtMoney(job.money.order_total, cur)}</Text></div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-muted">OWING</Text>
                  <Text weight="plus" className={job.money.outstanding ? "text-ui-tag-red-text" : ""}>{fmtMoney(job.money.outstanding ?? 0, cur)}</Text>
                </div>
              </>
            )}
          </div>
        </div>

        <ol aria-label="Job phases" className="grid grid-cols-9 gap-1.5 list-none p-0 m-0">
          {JOB_PHASES.map((p) => {
            const step = job.state.steps.find((s) => s.key === p.key)
            const current = job.state.phase === p.key
            const due = p.key === "production" && job.order?.production_due_date ? `due out ${fmtDate(job.order.production_due_date)}` : null
            return (
              <li key={p.key} className={`border-t-4 pt-1.5 ${step?.done ? (current ? "border-ui-fg-interactive" : "border-ui-tag-green-icon") : "border-ui-border-base text-ui-fg-muted"}`}>
                <Text size="xsmall" weight={current ? "plus" : "regular"}>{p.label}</Text>
                <Text size="xsmall" className="text-ui-fg-muted">{step?.at ? fmtDate(step.at) : due ?? "—"}</Text>
              </li>
            )
          })}
        </ol>

        {/* ── Action bar: the next step once, then the verbs that apply ── */}
        {!job.state.lost ? (
          <div className={`flex flex-wrap items-center gap-2 rounded-md px-4 py-3 ${job.state.waiting_on === "us" ? "bg-ui-tag-red-bg" : "bg-ui-bg-subtle"}`}>
            {wait ? (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${wait.bg}`}>
                {wait.label}{job.state.days ? ` · ${job.state.days} business day${job.state.days === 1 ? "" : "s"}` : ""}
              </span>
            ) : null}
            {action.kind !== "none" ? (
              <Button size="base" isLoading={busy === action.kind} disabled={!!busy} onClick={() => runAction(action.kind)}>
                {action.label}
              </Button>
            ) : (
              <Badge color="green">{action.label}</Badge>
            )}
            {verbs.length ? <span className="mx-1 h-6 w-px bg-ui-border-base" /> : null}
            {verbs.map((v) => (
              <Button key={v.key} size="small" variant="secondary" onClick={() => setVerb(v.key)}>{v.label}</Button>
            ))}
            {job.quote && !job.order ? (
              <Button size="small" variant="secondary" asChild>
                <AppLink href={job.quote.has_job_pricer ? `/app/quote-pricer?quote=${job.quote.id}` : `/app/jobs/${job.quote.id}#quote`}>
                  {job.quote.has_job_pricer ? "Edit in pricer" : "Edit quote"}
                </AppLink>
              </Button>
            ) : null}
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenu.Trigger asChild>
                  <Button size="small" variant="secondary">More ▾</Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" className="min-w-[220px]">
                  {order ? <DropdownMenu.Item onClick={() => setVerb("dsp")}>Send to DSP</DropdownMenu.Item> : null}
                  {order ? <DropdownMenu.Item onClick={() => setVerb("drive")}>Drive folder</DropdownMenu.Item> : null}
                  {order ? (
                    <DropdownMenu.Item onClick={() => (go(`/app/orders/${job.order!.id}`))}>
                      Medusa order page (refund, edit, cancel)
                    </DropdownMenu.Item>
                  ) : null}
                  {job.quote ? (
                    <DropdownMenu.Item onClick={() => (go(`/app/jobs/${job.quote!.id}#quote`))}>Open quote</DropdownMenu.Item>
                  ) : null}
                  <DropdownMenu.Item onClick={() => setVerb("task")}>Add a task</DropdownMenu.Item>
                  <DropdownMenu.Item onClick={copyJobLink}>Copy job link</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            </div>
            {action.blockers?.length || job.flags.length ? (
              <Text size="small" className="basis-full text-ui-fg-subtle">
                {action.blockers?.length ? `Not ready: ${action.blockers.join("; ")}.` : job.flags.map((f) => f.label).join(" · ")}
              </Text>
            ) : null}
          </div>
        ) : (
          <Badge color="grey">Closed</Badge>
        )}
      </Container>

      {/* ── Job (left) + diary (right) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <Tabs.List>
              <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
              <Tabs.Trigger value="artwork">Artwork</Tabs.Trigger>
              <Tabs.Trigger value="production">Production</Tabs.Trigger>
              <Tabs.Trigger value="delivery">Delivery</Tabs.Trigger>
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
                      <Heading level="h2" className="mb-2">Lines</Heading>
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
                    {order ? <Mount W={W.OrderOwner} order={order} /> : null}
                    {order ? <Mount W={W.OrderWatchers} order={order} /> : null}
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
                  <Button size="small" variant="secondary" className="mt-2" asChild><AppLink href={`/app/jobs/${job.quote?.id}#quote`}>Open quote</AppLink></Button>
                </Container>
              )}
            </Tabs.Content>

            <Tabs.Content value="production" className="mt-3 flex flex-col gap-y-3">
              {order ? (
                <>
                  <Mount W={W.OrderProductionStage} order={order} />
                  <Mount W={W.OrderPrintRecipes} order={order} />
                  
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
                  <Mount W={W.OrderBottleShopDropship} order={order} />
                  <Mount W={W.OrderAuspostParcels} order={order} />
                  <Mount W={W.OrderNps} order={order} />
                </>
              ) : (
                <Container><Text size="small" className="text-ui-fg-subtle">Shipping lives on the order once it exists.</Text></Container>
              )}
            </Tabs.Content>
          </Tabs>
        </div>

        <Diary job={job} onChanged={onChanged} />
      </div>

      {/* ── A verb's tool, opened over the job ─────────────────────────── */}
      <Drawer open={!!verb} onOpenChange={(o) => { if (!o) { setVerb(null); onChanged() } }}>
        <Drawer.Content className={verb === "proof" ? "max-w-4xl" : "max-w-2xl"}>
          <Drawer.Header>
            <Drawer.Title>{verb ? VERB_TITLE[verb] : ""}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-y-3 overflow-y-auto">
            {order && verb === "proof" ? <Mount W={W.OrderCustomizerDownloads} order={order} /> : null}
            {order && verb === "money" ? (
              <>
                <Mount W={W.OrderEmailInvoice} order={order} />
                <Mount W={W.OrderDeposit} order={order} />
              </>
            ) : null}
            {order && verb === "blanks" ? (
              <>
                <Mount W={W.OrderAscolourDropship} order={order} />
                <Mount W={W.OrderAussiePacificDropship} order={order} />
                <Text size="small" className="text-ui-fg-subtle">
                  Sending to AS Colour or Aussie Pacific marks the blanks as ordered. Ordering from anyone else? Log the supplier and reference in the diary, then set Blanks to Ordered in Change stage.
                </Text>
              </>
            ) : null}
            {order && verb === "stage" ? <Mount W={W.OrderProductionStage} order={order} /> : null}
            {order && verb === "dsp" ? <DspPackPanel jobId={job.id} /> : null}
            {order && verb === "drive" ? <Mount W={W.OrderDriveFolder} order={order} /> : null}
            {verb === "task" ? (
              <TaskQuickAdd
                anchor={job.order ? "order_id" : "quote_id"}
                anchorId={job.order?.id ?? job.quote!.id}
                title="Tasks"
                helpBody="One-off work tied to this job. Open tasks are pinned at the top of the diary."
              />
            ) : null}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer>
    </div>
  )
}

const TwoCol = ({ main, side }: { main: ReactNode; side: ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
    <div className="flex flex-col gap-y-3 min-w-0">{main}</div>
    <div className="flex flex-col gap-y-3 min-w-0">{side}</div>
  </div>
)

// ── Diary ───────────────────────────────────────────────────────────────────

type DiaryItem = { kind: "row"; row: JobActivity } | { kind: "updates"; key: string; rows: JobActivity[] }

/** Runs of two or more routine rows fold into one "N updates" line. */
function foldUpdates(activity: JobActivity[]): DiaryItem[] {
  const out: DiaryItem[] = []
  let run: JobActivity[] = []
  const flush = () => {
    if (run.length === 1) out.push({ kind: "row", row: run[0] })
    else if (run.length > 1) out.push({ kind: "updates", key: `${run[0].at}-${run.length}`, rows: run })
    run = []
  }
  for (const a of activity) {
    if (UPDATE_KINDS.has(a.kind)) run.push(a)
    else {
      flush()
      out.push({ kind: "row", row: a })
    }
  }
  flush()
  return out
}

const send = async (path: string, method: "POST" | "PATCH", body: Record<string, unknown>) => {
  const res = await fetch(path, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as any)?.error ?? (json as any)?.message ?? `HTTP ${res.status}`)
  return json
}

function Diary({ job, onChanged }: { job: JobView; onChanged: () => void }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [followUp, setFollowUp] = useState("")
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const to = job.customer.email
  const lastAnswer = threadTimes(job.activity).answers.sort().at(-1) ?? ""
  const openTasks = job.tasks.filter((t) => t.status === "open" || t.status === "in_progress")

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast.success(ok)
      onChanged()
      return true
    } catch (err: any) {
      toast.error(err?.message ?? "Failed")
      return false
    } finally {
      setBusy(null)
    }
  }

  const reply = async (channel: "email" | "note") => {
    if (!text.trim()) return
    const done = await run(channel, () => send(`/admin/jobs/${encodeURIComponent(job.id)}/reply`, "POST", { channel, body: text.trim() }), channel === "email" ? `Emailed ${to}` : "Logged")
    if (done) setText("")
  }

  const row = (a: JobActivity, i: number) => {
    const tag = ACTIVITY_TAG[a.kind]
    const unanswered = a.kind === "email_in" && a.at > lastAnswer
    return (
      <li key={`${a.at}-${i}`} className={`flex gap-3 py-2 text-sm ${unanswered ? "-mx-2 rounded-md bg-ui-tag-orange-bg px-2" : ""}`}>
        <span className="w-20 shrink-0 text-ui-fg-muted text-xs pt-0.5">{fmtWhen(a.at)}</span>
        <span className="min-w-0 flex-1">
          <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tag.cls}`}>{tag.label}</span>
          <span className="font-medium">{a.title}</span>
          {a.actor && a.kind !== "email_in" ? <span className="text-ui-fg-muted"> · {a.actor.replace(/^(staff-email:|staff-note:|email:)/, "")}</span> : null}
          {a.detail ? <span className="block whitespace-pre-wrap break-words text-ui-fg-subtle mt-0.5">{a.detail}</span> : null}
          {a.thumbnail_url ? <img src={a.thumbnail_url} alt="" className="mt-1 h-16 rounded" /> : null}
        </span>
      </li>
    )
  }

  return (
    <aside className="flex min-w-0 flex-col gap-y-3 xl:sticky xl:top-4 xl:self-start">
      <Container className="flex flex-col gap-y-2">
        <Text size="xsmall" className="text-ui-fg-muted">{to ? `REPLY TO ${to.toUpperCase()}, OR LOG A CALL` : "NO CUSTOMER EMAIL · LOG A CALL OR NOTE"}</Text>
        <Textarea id="job-reply" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={to ? "Hi … (replies land back on this job)" : "What happened?"} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="small" variant="secondary" isLoading={busy === "note"} disabled={!!busy || !text.trim()} onClick={() => reply("note")}>Log call / note</Button>
          {to ? <Button size="small" isLoading={busy === "email"} disabled={!!busy || !text.trim()} onClick={() => reply("email")}>Send email</Button> : null}
        </div>
        <div className="flex items-center gap-2 border-t border-ui-border-base pt-2">
          <Text size="small" className="text-ui-fg-subtle shrink-0">Follow up on</Text>
          <Input id="job-follow-up" type="date" size="small" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          <Button
            size="small"
            variant="secondary"
            isLoading={busy === "follow"}
            disabled={!!busy || !followUp}
            onClick={async () => {
              const done = await run("follow", () => send(`/admin/jobs/${encodeURIComponent(job.id)}/follow-up`, "POST", { date: followUp, note: text.trim() || undefined }), "Follow-up set")
              if (done) setFollowUp("")
            }}
          >
            Set
          </Button>
        </div>
      </Container>

      {openTasks.length ? (
        <div className="flex flex-col gap-y-1.5">
          {openTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-md border border-dashed border-ui-tag-orange-border bg-ui-bg-base px-3 py-2 text-sm">
              <Badge size="2xsmall" color="orange">{t.follow_up ? "Follow-up" : "Task"}</Badge>
              <span className="min-w-0 flex-1 truncate">{t.title}{t.due_at ? <span className="text-ui-fg-muted"> · {fmtDate(t.due_at)}</span> : null}</span>
              <Button size="small" variant="transparent" isLoading={busy === t.id} disabled={!!busy} onClick={() => run(t.id, () => send(`/admin/tasks/${t.id}`, "PATCH", { status: "done" }), "Done")}>
                Done
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <Container>
        <ul className="divide-y divide-ui-border-base">
          {foldUpdates(job.activity).map((item, i) =>
            item.kind === "row" ? (
              row(item.row, i)
            ) : open[item.key] ? (
              <li key={item.key}>
                <button type="button" className="py-2 text-xs text-ui-fg-muted hover:underline" onClick={() => setOpen((s) => ({ ...s, [item.key]: false }))}>
                  Hide {item.rows.length} updates ▴
                </button>
                <ul className="divide-y divide-ui-border-base">{item.rows.map((a, j) => row(a, j))}</ul>
              </li>
            ) : (
              <li key={item.key}>
                <button type="button" className="py-2 text-sm text-ui-fg-muted hover:underline" onClick={() => setOpen((s) => ({ ...s, [item.key]: true }))}>
                  {item.rows.length} updates ▸
                </button>
              </li>
            )
          )}
        </ul>
      </Container>
    </aside>
  )
}
