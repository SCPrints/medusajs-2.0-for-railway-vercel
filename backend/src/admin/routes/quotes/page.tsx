import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight, CurrencyDollar, Plus, Trash, PencilSquare, Sparkles, Photo } from "@medusajs/icons"
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Drawer,
  Heading,
  IconButton,
  Input,
  Label,
  Select,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useCallback, useEffect, useRef, useState } from "react"

import { HelpTooltip } from "../../components/reports/help-tooltip"
import {
  ProductLinePicker,
  type PickedProductLine,
} from "../../components/quotes/product-line-picker"
import { mergeServerRows } from "../../lib/quote-line-merge"

import {
  QuoteDetail,
  LineItemsEditor,
  STATUS_COLORS,
  STATUS_LABELS,
  draftToLineItems,
  emptyLineItem,
  fmtDate,
  type DraftLineItem,
  type Quote,
  type Region,
} from "../../components/quote/quote-detail"

function NewQuoteDrawer({
  open,
  onClose,
  onCreated,
  regionId,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string, opts?: { studioPopup?: Window | null }) => void
  regionId: string | null
}) {
  const blankForm = {
    email: "",
    contact_name: "",
    company: "",
    contact_phone: "",
    subject: "",
    message: "",
    assigned_to: "",
    total_estimate: "",
    needed_by: "",
  }
  const [form, setForm] = useState(blankForm)
  const [rows, setRows] = useState<DraftLineItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(blankForm)
      setRows([])
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (patch: Partial<typeof blankForm>) =>
    setForm((f) => ({ ...f, ...patch }))

  // POST the quote; returns the new id (or null on failure). Split out so the
  // "Create" button and "Design in Studio" share one create path.
  const createQuote = async (): Promise<string | null> => {
    if (!form.email.trim()) {
      setError("Email is required.")
      return null
    }
    setSaving(true)
    setError(null)
    try {
      const estimateNum = Number.parseFloat(form.total_estimate)
      const payload: Record<string, unknown> = {
        email: form.email.trim(),
        contact_name: form.contact_name.trim() || undefined,
        company: form.company.trim() || undefined,
        contact_phone: form.contact_phone.trim() || undefined,
        subject: form.subject.trim() || undefined,
        message: form.message.trim() || undefined,
        assigned_to: form.assigned_to.trim() || undefined,
        total_estimate: Number.isFinite(estimateNum) ? estimateNum : undefined,
        line_items: draftToLineItems(rows),
        ...(form.needed_by ? { metadata: { needed_by: form.needed_by } } : {}),
      }
      const res = await fetch("/admin/quotes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`)
      toast.success(`Quote ${json.quote?.public_id ?? ""} created`)
      return json.quote.id as string
    } catch (err: any) {
      setError(err?.message ?? "Failed to create quote")
      return null
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    const id = await createQuote()
    if (!id) return
    onCreated(id)
    onClose()
  }

  // Create the quote, then open the Studio on it. The popup is opened
  // SYNCHRONOUSLY here — inside the user's click — so the browser's popup
  // blocker (which only allows window.open inside a gesture) lets it through;
  // we then navigate it to the signed customiser URL once the quote exists and
  // hand the window to the detail view, which polls for the design (same
  // machinery as "Design in Studio" on an existing quote). If the popup is
  // blocked we still create the quote so the work isn't lost.
  const createAndDesign = async () => {
    if (!form.email.trim()) {
      setError("Email is required.")
      return
    }
    const popup = window.open(
      "",
      "quote-customizer",
      "width=1280,height=900,noopener=false"
    )
    if (!popup) {
      toast.error(
        "Popup blocked — allow popups, or use “Design in Studio” after creating."
      )
    } else {
      popup.document.write(
        "<p style='font:14px sans-serif;padding:24px;color:#666'>Opening the Studio…</p>"
      )
    }
    const id = await createQuote()
    if (!id) {
      popup?.close()
      return
    }
    if (popup) {
      try {
        const res = await fetch(`/admin/quotes/${id}/design-link`, {
          credentials: "include",
        })
        const json = (await res.json()) as { url?: string; error?: string }
        if (!json.url) throw new Error(json.error ?? "No Studio URL returned")
        popup.location.href = json.url
      } catch (err: any) {
        popup.close()
        toast.error(err?.message ?? "Failed to open the Studio")
        onCreated(id)
        onClose()
        return
      }
    }
    onCreated(id, { studioPopup: popup })
    onClose()
  }

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Drawer.Content className="max-w-lg">
        <Drawer.Header>
          <Drawer.Title>New quote</Drawer.Title>
          <Drawer.Description>
            Create a quote on a customer's behalf. It lands in the pipeline as
            New — set status to Quoted once you've sent them a price.
          </Drawer.Description>
        </Drawer.Header>

        <Drawer.Body className="overflow-auto">
          <div className="flex flex-col gap-y-4 p-1">
            <div className="flex flex-col gap-y-1">
              <Label size="xsmall">Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="customer@example.com"
              />
            </div>

            <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1">
                <Label size="xsmall">Contact name</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => set({ contact_name: e.target.value })}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="xsmall">Company</Label>
                <Input
                  value={form.company}
                  onChange={(e) => set({ company: e.target.value })}
                  placeholder="Acme Pty Ltd"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1">
                <Label size="xsmall">Contact phone</Label>
                <Input
                  value={form.contact_phone}
                  onChange={(e) => set({ contact_phone: e.target.value })}
                  placeholder="04xx xxx xxx"
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="xsmall">Assigned to (staff email)</Label>
                <Input
                  value={form.assigned_to}
                  onChange={(e) => set({ assigned_to: e.target.value })}
                  placeholder="you@scprints.com.au"
                />
              </div>
            </div>

            <div className="flex flex-col gap-y-1">
              <Label size="xsmall">Subject</Label>
              <Input
                value={form.subject}
                onChange={(e) => set({ subject: e.target.value })}
                placeholder="e.g. 50 club hoodies — embroidered crest"
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label size="xsmall">Needed by (optional)</Label>
              <Input type="date" value={form.needed_by} onChange={(e) => set({ needed_by: e.target.value })} />
              <Text size="xsmall" className="text-ui-fg-muted">The customer&apos;s own date — Today flags the job late or at risk against it.</Text>
            </div>

            <div className="flex flex-col gap-y-1">
              <Label size="xsmall">Message / brief</Label>
              <Textarea
                rows={4}
                value={form.message}
                onChange={(e) => set({ message: e.target.value })}
                placeholder="What the customer is after — garments, decoration, deadline…"
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label size="xsmall">Total estimate (AUD)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.total_estimate}
                onChange={(e) => set({ total_estimate: e.target.value })}
                placeholder="Optional — leave blank to fill in later"
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label size="xsmall">Line items</Label>
              <Text size="xsmall" className="text-ui-fg-muted">
                Add catalog products (a specific size or the whole product),
                attach a mockup, or click “Design in Studio” — that saves the
                quote and opens the customiser so you can set print locations.
              </Text>
              <div className="mt-1">
                <LineItemsEditor
                  rows={rows}
                  onChange={setRows}
                  regionId={regionId}
                  onAddDesign={createAndDesign}
                />
              </div>
            </div>

            {error ? (
              <Text size="small" className="text-ui-tag-red-icon">
                {error}
              </Text>
            ) : null}
          </div>
        </Drawer.Body>

        <Drawer.Footer>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={saving}>
            Create quote
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
const QuotesPage = () => {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [statusFilter, setStatusFilter] = useState<string>("active")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(() => new URLSearchParams(window.location.search).get("new") === "1")
  const [regionId, setRegionId] = useState<string | null>(null)

  // The quote is worked on its job page now; old `?id=` / `?quote=` links
  // (emails, bookmarks, the pricer) go straight there.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const id = p.get("id") ?? p.get("quote")
    if (id) window.location.replace(`/app/jobs/${encodeURIComponent(id)}#quote`)
  }, [])

  // Prefer the AUD region (the catalog is AUD-only); fall back to the first.
  useEffect(() => {
    let cancelled = false
    void fetch("/admin/regions?limit=50&fields=id,name,currency_code", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { regions: [] }))
      .then((j: { regions?: Region[] }) => {
        if (cancelled) return
        const regions = j.regions ?? []
        const aud = regions.find((r) => String(r.currency_code).toLowerCase() === "aud")
        setRegionId((aud ?? regions[0])?.id ?? null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter === "active") params.set("status", "new,quoted")
    else if (statusFilter !== "all") params.set("status", statusFilter)
    if (search) params.set("q", search)
    try {
      const res = await fetch(`/admin/quotes?${params.toString()}`, { credentials: "include" })
      const json = (await res.json()) as { quotes?: Quote[] }
      setQuotes(json.quotes ?? [])
    } catch {
      toast.error("Failed to load quotes")
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search])

  useEffect(() => { load() }, [load])

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1" className="flex items-center">
          Quotes
          <HelpTooltip
            text={{
              title: "Quotes",
              body: "Every quote request — BYO form, contact form, Studio cart or a job staff started — in one list. Click a row to open its job: pricing, the customer email, line items, the Studio and the diary are all there.",
              bullets: [
                "New: just arrived, not priced yet. Quoted: price sent, waiting on the customer.",
                "Accepted means an order exists; Lost / Expired are closed.",
                "Public ID (Q-XXXXX) is the customer-safe identifier — use it in emails so internal IDs stay private.",
              ],
            }}
          />
        </Heading>
        <div className="flex items-center gap-x-3">
          <Badge color="blue">{quotes.length} shown</Badge>
          <Button size="small" onClick={() => setCreateOpen(true)}>
            <Plus /> New job
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 px-6 py-4">
        <div>
          <Label size="xsmall">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <Select.Trigger className="w-44">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="active">Active (new + quoted)</Select.Item>
              <Select.Item value="new">New</Select.Item>
              <Select.Item value="quoted">Quoted</Select.Item>
              <Select.Item value="accepted">Accepted</Select.Item>
              <Select.Item value="lost">Lost</Select.Item>
              <Select.Item value="expired">Expired</Select.Item>
              <Select.Item value="all">All</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <Label size="xsmall">Search</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, company, email, Q-number, subject…" />
        </div>
      </div>

      <div className="px-6 py-2">
        {loading ? (
          <Text className="text-ui-fg-muted text-sm py-3">Loading…</Text>
        ) : quotes.length === 0 ? (
          <Text className="text-ui-fg-muted text-sm py-3">No quotes match.</Text>
        ) : (
          <ul className="divide-y divide-ui-border-base">
            {quotes.map((q) => (
              <li key={q.id}>
                <a href={`/app/jobs/${encodeURIComponent(q.id)}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-ui-bg-subtle -mx-2 px-2 rounded-md">
                  <span className="min-w-[220px] flex-1">
                    <Text weight="plus">
                      {q.contact_name || q.company || q.email}
                      {q.subject ? <span className="text-ui-fg-subtle font-normal"> · {q.subject}</span> : null}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-muted">{q.public_id} · {q.email} · {fmtDate(q.created_at)}{q.assigned_to ? ` · ${q.assigned_to}` : ""}</Text>
                  </span>
                  {q.total_estimate != null ? <Text size="small" weight="plus" className="tabular-nums">${Number(q.total_estimate).toFixed(2)}</Text> : null}
                  <Badge color={STATUS_COLORS[q.status]}>{STATUS_LABELS[q.status]}</Badge>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewQuoteDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        regionId={regionId}
        onCreated={(id) => {
          // The job window takes it from here; a Studio popup opened from the
          // drawer keeps posting designs to the quote on its own.
          window.location.href = `/app/jobs/${encodeURIComponent(id)}#quote`
        }}
      />
    </Container>
  )
}

export const config = defineRouteConfig({
  nested: "/orders",
  label: "Quotes",
  icon: tinted(ChatBubbleLeftRight, NAV_COLOR.sales),
  rank: 11,
})

export default QuotesPage
