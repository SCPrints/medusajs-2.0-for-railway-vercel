import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight, Plus, Trash, PencilSquare, Sparkles, Photo } from "@medusajs/icons"
import {
  Badge,
  Button,
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

type Quote = {
  id: string
  public_id: string
  status: "new" | "quoted" | "accepted" | "lost" | "expired"
  source: "byo" | "contact" | "admin" | "custom_hats" | "customizer_poa"
  email: string
  contact_name: string | null
  company: string | null
  subject: string | null
  message: string | null
  assigned_to: string | null
  currency_code: string
  total_estimate: number | string | null
  line_items: {
    items?: Array<{
      id?: string
      title: string
      description?: string | null
      quantity?: number | null
      unit_price?: number | null
      total?: number | null
      product_id?: string | null
      variant_id?: string | null
      product_handle?: string | null
      thumbnail?: string | null
      customizerDesign?: unknown | null
      mockup_urls?: Array<{ side?: string | null; url: string }> | null
      print_size_id?: string | null
      group_id?: string | null
    }>
  }
  metadata?: Record<string, unknown> | null
  created_at: string
}

type QuoteEvent = {
  id: string
  quote_id: string
  type: string
  actor: string | null
  body: Record<string, unknown>
  created_at: string
}

type Region = { id: string; name: string; currency_code: string }

// Keyed by string (not Quote["status"]) so the transient "converting" status —
// written briefly by the accept route's atomic claim, outside the model enum —
// still renders a labelled badge instead of a blank one.
const STATUS_LABELS: Record<string, string> = {
  new: "New",
  quoted: "Quoted",
  accepted: "Accepted",
  converting: "Converting…",
  lost: "Lost",
  expired: "Expired",
}

const STATUS_COLORS: Record<string, "blue" | "orange" | "green" | "red" | "grey"> = {
  new: "blue",
  quoted: "orange",
  accepted: "green",
  converting: "orange",
  lost: "red",
  expired: "grey",
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-AU")

const genLineId = () =>
  `ln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

type QuoteLineItem = NonNullable<Quote["line_items"]["items"]>[number]

// The line-items editor works in string-valued draft rows so the number
// inputs can be cleared without coercing to 0; `draftToLineItems` converts
// back to the persisted shape on save. Catalog linkage + the Studio design
// payload ride along untouched so a qty/price edit never drops a design.
type DraftLineItem = {
  id: string
  title: string
  description: string
  quantity: string
  unit_price: string
  product_id?: string | null
  variant_id?: string | null
  product_handle?: string | null
  thumbnail?: string | null
  customizerDesign?: unknown | null
  // Derived server-side from design.artifacts (see lib/quote-admin-slim.ts);
  // display-only, never sent back on save.
  mockup_urls?: Array<{ side?: string | null; url: string }> | null
  print_size_id?: string | null
  group_id?: string | null
}

const emptyLineItem = (): DraftLineItem => ({
  id: genLineId(),
  title: "",
  description: "",
  quantity: "",
  unit_price: "",
})

function lineItemsToDraft(items?: Quote["line_items"]["items"]): DraftLineItem[] {
  return (items ?? []).map((li) => ({
    id: li.id || genLineId(),
    title: li.title ?? "",
    description: li.description ?? "",
    quantity: li.quantity != null ? String(li.quantity) : "",
    unit_price: li.unit_price != null ? String(li.unit_price) : "",
    product_id: li.product_id ?? null,
    variant_id: li.variant_id ?? null,
    product_handle: li.product_handle ?? null,
    thumbnail: li.thumbnail ?? null,
    customizerDesign: li.customizerDesign ?? null,
    mockup_urls: li.mockup_urls ?? null,
    print_size_id: li.print_size_id ?? null,
    group_id: li.group_id ?? null,
  }))
}

function draftToLineItems(rows: DraftLineItem[]): QuoteLineItem[] {
  return rows
    .filter((r) => r.title.trim())
    .map((r) => {
      const qtyNum = Number.parseInt(r.quantity, 10)
      const unitNum = Number.parseFloat(r.unit_price)
      const quantity = Number.isFinite(qtyNum) ? qtyNum : null
      const unit_price = Number.isFinite(unitNum) ? unitNum : null
      const total =
        quantity != null && unit_price != null
          ? Math.round(quantity * unit_price * 100) / 100
          : null
      return {
        id: r.id,
        title: r.title.trim(),
        description: r.description.trim() || null,
        quantity,
        unit_price,
        total,
        product_id: r.product_id ?? null,
        variant_id: r.variant_id ?? null,
        product_handle: r.product_handle ?? null,
        thumbnail: r.thumbnail ?? null,
        customizerDesign: r.customizerDesign ?? null,
        print_size_id: r.print_size_id ?? null,
        group_id: r.group_id ?? null,
      }
    })
}

// A lightweight signature of the server-side line items so the Studio poller
// only resets the local draft when the SERVER actually changed (a design
// landed / was replaced) — in-progress local qty/price edits survive.
function lineItemsSignature(items?: Quote["line_items"]["items"]): string {
  return (items ?? [])
    .map(
      (li) =>
        `${li.id ?? ""}:${li.quantity ?? ""}:${li.unit_price ?? ""}:${
          li.group_id ?? ""
        }:${li.thumbnail ?? ""}:${li.description ?? ""}`
    )
    .join("|")
}

function LineItemsEditor({
  rows,
  onChange,
  regionId,
  onDesignLine,
  onAddDesign,
}: {
  rows: DraftLineItem[]
  onChange: (rows: DraftLineItem[]) => void
  regionId: string | null
  /** Open the Studio to (re)design a row. Omit to hide Studio actions. */
  onDesignLine?: (row: DraftLineItem) => void
  /** Open the Studio with no preselected product. Omit to hide. */
  onAddDesign?: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const setRow = (idx: number, patch: Partial<DraftLineItem>) =>
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const addPicked = (p: PickedProductLine) => {
    onChange([
      ...rows,
      {
        id: genLineId(),
        title: p.title,
        description: "",
        quantity: "",
        unit_price: p.unit_price != null ? String(p.unit_price) : "",
        product_id: p.product_id,
        variant_id: p.variant_id,
        product_handle: p.product_handle,
        thumbnail: p.thumbnail,
        customizerDesign: null,
        print_size_id: null,
        group_id: null,
      },
    ])
  }

  // --- Per-line mockup upload ---
  // Lets staff attach a mockup image to any line without opening the full
  // Studio. Uploads to R2 via Medusa's built-in /admin/uploads, then stores the
  // URL as the line's `thumbnail` (rendered next to the line, same slot the
  // Studio mockup uses). `rowsRef` keeps the apply step pinned to the latest
  // rows so an add/remove during the upload can't write to the wrong line.
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const mockupInputRef = useRef<HTMLInputElement | null>(null)
  const mockupTargetId = useRef<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const triggerMockupUpload = (rowId: string) => {
    mockupTargetId.current = rowId
    mockupInputRef.current?.click()
  }

  const onMockupFile = async (file: File | undefined) => {
    const rowId = mockupTargetId.current
    mockupTargetId.current = null
    if (mockupInputRef.current) mockupInputRef.current.value = ""
    if (!rowId || !file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files can be attached as a mockup")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Mockup exceeds the 10 MB limit")
      return
    }
    setUploadingId(rowId)
    try {
      const fd = new FormData()
      fd.append("files", file)
      const res = await fetch("/admin/uploads", {
        method: "POST",
        credentials: "include",
        body: fd,
      })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      const json = (await res.json()) as { files?: Array<{ url?: string }> }
      const url = json?.files?.[0]?.url
      if (!url) throw new Error("Upload returned no URL")
      onChange(
        rowsRef.current.map((r) =>
          r.id === rowId ? { ...r, thumbnail: url } : r
        )
      )
      toast.success("Mockup attached")
    } catch (err: any) {
      toast.error(err?.message ?? "Mockup upload failed")
    } finally {
      setUploadingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-y-3">
      {rows.length === 0 ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          No line items yet — add a catalog product, design one in the Studio,
          or add a custom line.
        </Text>
      ) : (
        rows.map((row, idx) => {
          const hasDesign = Boolean(row.customizerDesign)
          const hasVariant = Boolean(row.variant_id)
          const isWholeProduct =
            Boolean(row.product_id) && !hasVariant && !hasDesign
          const isCustom = !hasVariant && !hasDesign && !isWholeProduct
          return (
            <div
              key={row.id}
              className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2"
            >
              <div className="flex items-start gap-x-2">
                {row.thumbnail ? (
                  <a
                    href={row.thumbnail}
                    target="_blank"
                    rel="noreferrer"
                    title="View mockup full size"
                    className="shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.thumbnail}
                      alt=""
                      className="w-12 h-12 rounded object-cover bg-ui-bg-subtle cursor-zoom-in"
                    />
                  </a>
                ) : null}
                <div className="flex-1 flex flex-col gap-y-1">
                  <Input
                    placeholder="Item title (e.g. Navy hoodie, front + back print)"
                    value={row.title}
                    onChange={(e) => setRow(idx, { title: e.target.value })}
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    {hasDesign ? (
                      <Badge size="2xsmall" color="purple">
                        Studio design
                      </Badge>
                    ) : null}
                    {hasVariant ? (
                      <Badge size="2xsmall" color="green">
                        Catalog product
                      </Badge>
                    ) : null}
                    {isWholeProduct ? (
                      <Badge size="2xsmall" color="blue">
                        Whole product
                      </Badge>
                    ) : null}
                    {isCustom ? (
                      <Badge size="2xsmall" color="grey">
                        Custom line
                      </Badge>
                    ) : null}
                    {isCustom ? (
                      <span className="text-[11px] text-ui-fg-muted">
                        No product — won't add to cart on acceptance
                      </span>
                    ) : isWholeProduct ? (
                      <span className="text-[11px] text-ui-fg-muted">
                        Size chosen at order time (a default size is added to the
                        cart on acceptance)
                      </span>
                    ) : hasVariant && !row.unit_price.trim() ? (
                      <span className="text-[11px] text-ui-tag-orange-text">
                        No price set — falls back to catalog price on acceptance
                      </span>
                    ) : null}
                  </div>
                </div>
                <IconButton
                  variant="transparent"
                  onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                  aria-label="Remove line item"
                >
                  <Trash />
                </IconButton>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label size="xsmall">Qty</Label>
                  <Input
                    type="number"
                    min={0}
                    value={row.quantity}
                    onChange={(e) => setRow(idx, { quantity: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label size="xsmall">Unit price</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.unit_price}
                    onChange={(e) => setRow(idx, { unit_price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <Label size="xsmall">Description</Label>
                <Textarea
                  rows={2}
                  value={row.description}
                  onChange={(e) => setRow(idx, { description: e.target.value })}
                  placeholder="Optional — decoration method, sizes, colours…"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {hasDesign && onDesignLine ? (
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => onDesignLine(row)}
                  >
                    <PencilSquare /> Edit design in Studio
                  </Button>
                ) : null}
                {(row.mockup_urls?.length
                  ? row.mockup_urls
                  : row.thumbnail
                    ? [{ side: null as string | null, url: row.thumbnail }]
                    : []
                ).map((m, i) => (
                  <Button key={i} size="small" variant="secondary" asChild>
                    <a href={m.url} target="_blank" rel="noreferrer">
                      View{" "}
                      {m.side ? String(m.side).replace(/_/g, " ") : "mockup"}
                    </a>
                  </Button>
                ))}
                <Button
                  size="small"
                  variant="secondary"
                  isLoading={uploadingId === row.id}
                  onClick={() => triggerMockupUpload(row.id)}
                >
                  <Photo /> {row.thumbnail ? "Replace mockup" : "Attach mockup"}
                </Button>
                {row.thumbnail && !hasDesign ? (
                  <Button
                    size="small"
                    variant="transparent"
                    onClick={() => setRow(idx, { thumbnail: null })}
                  >
                    Remove mockup
                  </Button>
                ) : null}
              </div>
            </div>
          )
        })
      )}

      <input
        ref={mockupInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void onMockupFile(e.target.files?.[0])}
      />

      {pickerOpen ? (
        <ProductLinePicker
          onPick={addPicked}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="small"
          variant="secondary"
          onClick={() => setPickerOpen((v) => !v)}
        >
          <Plus /> Add product
        </Button>
        {onAddDesign ? (
          <Button size="small" variant="secondary" onClick={onAddDesign}>
            <Sparkles /> Design in Studio
          </Button>
        ) : null}
        <Button
          size="small"
          variant="transparent"
          onClick={() => onChange([...rows, emptyLineItem()])}
        >
          <Plus /> Add custom line
        </Button>
      </div>
    </div>
  )
}

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [events, setEvents] = useState<QuoteEvent[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [regionId, setRegionId] = useState<string | null>(null)
  // A Studio popup opened from the CREATE modal, handed to the detail view (once
  // it has loaded the new quote) so its polling adopts it. See createAndDesign.
  const [incomingStudio, setIncomingStudio] = useState<{
    id: string
    popup: Window | null
  } | null>(null)

  // Resolve a region once so the product picker can show calculated prices.
  // Prefer the AUD region (the catalog is AUD-only); fall back to the first.
  useEffect(() => {
    let cancelled = false
    void fetch("/admin/regions?limit=50&fields=id,name,currency_code", {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { regions: [] }))
      .then((j: { regions?: Region[] }) => {
        if (cancelled) return
        const regions = j.regions ?? []
        const aud = regions.find(
          (r) => String(r.currency_code).toLowerCase() === "aud"
        )
        setRegionId((aud ?? regions[0])?.id ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter === "active") {
      params.set("status", "new,quoted")
    } else if (statusFilter !== "all") {
      params.set("status", statusFilter)
    }
    if (search) params.set("q", search)
    try {
      const res = await fetch(`/admin/quotes?${params.toString()}`, {
        credentials: "include",
      })
      const json = (await res.json()) as { quotes?: Quote[] }
      setQuotes(json.quotes ?? [])
    } catch {
      toast.error("Failed to load quotes")
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search])

  useEffect(() => {
    load()
  }, [load])

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/admin/quotes/${id}`, { credentials: "include" })
      const json = (await res.json()) as { quote: Quote; events: QuoteEvent[] }
      setSelectedQuote(json.quote)
      setEvents(json.events ?? [])
    } catch {
      toast.error("Failed to load quote")
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setSelectedQuote(null)
      setEvents([])
      return
    }
    loadDetail(selectedId)
  }, [selectedId, loadDetail])

  const patchQuote = async (id: string, patch: Record<string, unknown>) => {
    try {
      const res = await fetch(`/admin/quotes/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success("Saved")
      await load()
      if (selectedId === id) await loadDetail(id)
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed")
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1" className="flex items-center">
          Quotes
          <HelpTooltip
            text={{
              title: "Quote pipeline",
              body: "Every inbound quote request — from the BYO form, the contact form, or an admin-created lead — lands here. Move quotes left-to-right through the pipeline and the timeline records every step.",
              bullets: [
                "New: just arrived. Triage and either start quoting or assign to staff.",
                "Quoted: you've sent the customer a price. Waiting on them.",
                "Accepted: customer agreed — a cart is built from the quote's line items at their quoted prices, designs attached.",
                "Lost / Expired: closed without conversion. Useful for win-rate reporting later.",
                "Public ID (Q-XXXXX) is the customer-safe identifier — use it in emails so internal IDs stay private.",
                "Add catalog products (with live prices) or design artwork in the Studio — both flow into the customer's cart on acceptance.",
              ],
            }}
          />
        </Heading>
        <div className="flex items-center gap-x-3">
          <Badge color="blue">{quotes.length} shown</Badge>
          <Button size="small" variant="secondary" onClick={() => setCreateOpen(true)}>
            <Plus /> New quote
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
        <div className="flex-1 min-w-[200px]">
          <Label size="xsmall">Search</Label>
          <Input
            placeholder="email, company, subject, public id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-0">
        <div className="border-r border-ui-border-base min-w-0">
          {loading ? (
            <Text className="p-6 text-ui-fg-muted text-sm">Loading…</Text>
          ) : quotes.length === 0 ? (
            <Text className="p-6 text-ui-fg-muted text-sm">No quotes.</Text>
          ) : (
            <ul className="divide-y">
              {quotes.map((q) => (
                <li
                  key={q.id}
                  className={`px-6 py-3 cursor-pointer hover:bg-ui-bg-subtle ${selectedId === q.id ? "bg-ui-bg-subtle" : ""}`}
                  onClick={() => setSelectedId(q.id)}
                >
                  <div className="flex items-center justify-between">
                    <Text weight="plus">{q.public_id}</Text>
                    <Badge color={STATUS_COLORS[q.status]}>
                      {STATUS_LABELS[q.status]}
                    </Badge>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {q.email} · {fmtDate(q.created_at)}
                  </Text>
                  {q.subject ? (
                    <Text size="small" className="mt-1">
                      {q.subject}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* min-w-0: a grid track's default min-width is its content's
            min-content — one long unbreakable line (e.g. a timeline event
            body) would otherwise blow the column past the viewport. */}
        <div className="p-6 min-w-0">
          {!selectedQuote ? (
            <Text className="text-ui-fg-muted text-sm">
              Pick a quote on the left to view and edit.
            </Text>
          ) : (
            <QuoteDetail
              quote={selectedQuote}
              events={events}
              regionId={regionId}
              onUpdate={(patch) => patchQuote(selectedQuote.id, patch)}
              onReload={() => loadDetail(selectedQuote.id)}
              incomingStudioPopup={
                incomingStudio && incomingStudio.id === selectedQuote.id
                  ? incomingStudio.popup
                  : null
              }
              onIncomingStudioConsumed={() => setIncomingStudio(null)}
            />
          )}
        </div>
      </div>

      <NewQuoteDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        regionId={regionId}
        onCreated={(id, opts) => {
          setStatusFilter("active")
          load()
          setSelectedId(id)
          // Only adopt when a popup actually opened (blocked → undefined/null →
          // normal create; staff can use "Design in Studio" on the detail view).
          if (opts?.studioPopup) {
            setIncomingStudio({ id, popup: opts.studioPopup })
          }
        }}
      />
    </Container>
  )
}

function QuoteDetail({
  quote,
  events,
  regionId,
  onUpdate,
  onReload,
  incomingStudioPopup,
  onIncomingStudioConsumed,
}: {
  quote: Quote
  events: QuoteEvent[]
  regionId: string | null
  onUpdate: (patch: Record<string, unknown>) => Promise<void> | void
  onReload: () => Promise<void> | void
  /** A Studio popup opened from the create modal, to adopt for live polling. */
  incomingStudioPopup?: Window | null
  onIncomingStudioConsumed?: () => void
}) {
  const [draftMessage, setDraftMessage] = useState(quote.message ?? "")
  const [draftAssigned, setDraftAssigned] = useState(quote.assigned_to ?? "")
  const [draftEstimate, setDraftEstimate] = useState(
    quote.total_estimate ? String(quote.total_estimate) : ""
  )
  const [draftLineItems, setDraftLineItems] = useState<DraftLineItem[]>(
    lineItemsToDraft(quote.line_items?.items)
  )
  // True while a Studio popup is open — used to disable "Save line items" so a
  // full-array save can't clobber a design the popup posts back (lost-update
  // race), and to show a hint instead.
  const [studioOpen, setStudioOpen] = useState(false)
  // Spinner state for "Save line items" — the save round-trip can take a
  // moment on design-heavy quotes, and a dead-looking button reads as broken.
  const [savingLines, setSavingLines] = useState(false)

  // Studio popup + polling. While a popup is open we poll the quote so the
  // design lines the customiser posts back appear live (mirrors the POS page).
  const popupRef = useRef<Window | null>(null)
  const pollRef = useRef<number | null>(null)
  const serverSig = useRef<string>(lineItemsSignature(quote.line_items?.items))

  useEffect(() => {
    setDraftMessage(quote.message ?? "")
    setDraftAssigned(quote.assigned_to ?? "")
    setDraftEstimate(quote.total_estimate ? String(quote.total_estimate) : "")
    setDraftLineItems(lineItemsToDraft(quote.line_items?.items))
    serverSig.current = lineItemsSignature(quote.line_items?.items)
    setStudioOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id])

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Clean up on unmount / quote switch.
  useEffect(() => stopPolling, [stopPolling, quote.id])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/admin/quotes/${quote.id}`, {
          credentials: "include",
        })
        if (res.ok) {
          const json = (await res.json()) as { quote: Quote }
          const items = json.quote?.line_items?.items
          const sig = lineItemsSignature(items)
          if (sig !== serverSig.current) {
            serverSig.current = sig
            const serverRows = lineItemsToDraft(items)
            setDraftLineItems((prev) => mergeServerRows(prev, serverRows))
            toast.success("Studio design added to the quote")
          }
        }
      } catch {
        /* keep polling */
      }
      // Stop shortly after the popup closes (one extra tick catches the last
      // save), so we don't poll forever.
      if (popupRef.current && popupRef.current.closed) {
        popupRef.current = null
        setStudioOpen(false)
        stopPolling()
        void onReload()
      }
    }, 2000)
  }, [quote.id, stopPolling, onReload])

  // Adopt a Studio popup opened from the CREATE modal (createAndDesign). The
  // modal opened the window inside the user's click (popup-blocker safe) and
  // navigated it to the customiser; now that this detail view has loaded the
  // freshly-created quote, take over polling so the design lands live — exactly
  // as if "Design in Studio" had been clicked here. Runs after the quote.id
  // reset effect above, so studioOpen ends up true.
  useEffect(() => {
    if (!incomingStudioPopup) return
    popupRef.current = incomingStudioPopup
    setStudioOpen(true)
    startPolling()
    onIncomingStudioConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingStudioPopup])

  const openStudio = useCallback(
    async (group: string | null, handle: string | null) => {
      try {
        const params = new URLSearchParams()
        if (group) params.set("group", group)
        if (handle) params.set("handle", handle)
        const res = await fetch(
          `/admin/quotes/${quote.id}/design-link?${params.toString()}`,
          { credentials: "include" }
        )
        const json = (await res.json()) as { url?: string; error?: string }
        if (!json.url) throw new Error(json.error ?? "No Studio URL returned")
        const popup = window.open(
          json.url,
          "quote-customizer",
          "width=1280,height=900,noopener=false"
        )
        if (!popup) {
          toast.error("Popup blocked — allow popups for this site")
          return
        }
        popupRef.current = popup
        setStudioOpen(true)
        startPolling()
      } catch (err: any) {
        toast.error(err?.message ?? "Failed to open the Studio")
      }
    },
    [quote.id, startPolling]
  )

  // Staff-side conversion: quote → real unpaid order (no customer checkout).
  const [converting, setConverting] = useState(false)
  const convertedOrderId =
    typeof quote.metadata?.order_id === "string"
      ? (quote.metadata.order_id as string)
      : null
  const convertedDisplayId = quote.metadata?.order_display_id ?? null
  const convertToOrder = async () => {
    if (
      !window.confirm(
        "Convert this quote to an order? The customer is emailed the tax invoice (balance due + bank details) and the job enters production tracking."
      )
    ) {
      return
    }
    setConverting(true)
    try {
      const res = await fetch(`/admin/quotes/${quote.id}/convert-to-order`, {
        method: "POST",
        credentials: "include",
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as any)?.error ?? `HTTP ${res.status}`)
      const skipped = (json as any)?.skipped_items?.length ?? 0
      toast.success(
        `Order #${(json as any)?.display_id ?? "created"} — ${(json as any)?.lines_added ?? 0} line(s)${
          skipped ? `, ${skipped} skipped (no product/variant)` : ""
        }`
      )
      onReload()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to convert quote")
    } finally {
      setConverting(false)
    }
  }

  const copyAcceptLink = async () => {
    try {
      const res = await fetch(`/admin/quotes/${quote.id}/accept-link`, {
        credentials: "include",
      })
      const json = (await res.json()) as { url?: string }
      if (!json.url) throw new Error("Server returned no URL")
      await navigator.clipboard.writeText(json.url)
      toast.success("Customer accept link copied to clipboard")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to copy link")
    }
  }

  const copyDesignApprovalLink = async () => {
    try {
      const res = await fetch(
        `/admin/quotes/${quote.id}/design-approval-link`,
        { credentials: "include" }
      )
      const json = (await res.json()) as { url?: string }
      if (!json.url) throw new Error("Server returned no URL")
      await navigator.clipboard.writeText(json.url)
      toast.success("Design approval link copied — send it to the customer")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to copy link")
    }
  }

  // Email the approval link straight to the customer (with the mockups) so staff
  // don't have to copy-and-send.
  const [sendingApproval, setSendingApproval] = useState(false)
  const sendDesignApprovalLink = async () => {
    setSendingApproval(true)
    try {
      const res = await fetch(
        `/admin/quotes/${quote.id}/design-approval-link`,
        { method: "POST", credentials: "include" }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      toast.success(
        `Design approval emailed to ${json.sent_to}${
          json.has_mockups ? "" : " (no mockup attached yet)"
        }`
      )
      onReload()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send approval email")
    } finally {
      setSendingApproval(false)
    }
  }

  // Customer's design sign-off state (mockup approval), stored on quote metadata
  // by /store/quote-design-approval.
  const designStatus =
    typeof quote.metadata?.design_approval_status === "string"
      ? (quote.metadata.design_approval_status as string)
      : null
  const designApproverName =
    typeof quote.metadata?.design_approver_name === "string"
      ? (quote.metadata.design_approver_name as string)
      : null
  const designChangesComment =
    typeof quote.metadata?.design_changes_comment === "string"
      ? (quote.metadata.design_changes_comment as string)
      : null

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between gap-x-2 flex-wrap">
        <div>
          <Heading level="h2">{quote.public_id}</Heading>
          <Text size="xsmall" className="text-ui-fg-muted">
            {quote.email} · created {fmtDate(quote.created_at)} · source {quote.source}
          </Text>
        </div>
        <div className="flex items-center gap-x-2 flex-wrap">
          <Button
            size="small"
            variant="primary"
            isLoading={sendingApproval}
            onClick={sendDesignApprovalLink}
          >
            Email approval to customer
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={copyDesignApprovalLink}
          >
            Copy design-approval link
          </Button>
          <Button size="small" variant="secondary" onClick={copyAcceptLink}>
            Copy quote-accept link
          </Button>
          {convertedOrderId ? (
            <Button size="small" variant="secondary" asChild>
              <a
                href={`/app/orders/${convertedOrderId}`}
                target="_blank"
                rel="noreferrer"
              >
                View order{convertedDisplayId ? ` #${convertedDisplayId}` : ""}
              </a>
            </Button>
          ) : (
            <Button
              size="small"
              variant="secondary"
              isLoading={converting}
              disabled={converting}
              onClick={convertToOrder}
              title="Create a real (unpaid) order from this quote — no customer checkout needed. Invoice with bank details is emailed automatically."
            >
              Convert to order
            </Button>
          )}
          <Badge color={STATUS_COLORS[quote.status]}>{STATUS_LABELS[quote.status]}</Badge>
        </div>
      </div>

      {designStatus === "approved" || designStatus === "changes_requested" ? (
        <div
          className={`rounded-md border p-2.5 text-xs ${
            designStatus === "approved"
              ? "border-ui-tag-green-border bg-ui-tag-green-bg text-ui-tag-green-text"
              : "border-ui-tag-orange-border bg-ui-tag-orange-bg text-ui-tag-orange-text"
          }`}
        >
          {designStatus === "approved" ? (
            <span>
              ✓ Design approved by the customer
              {designApproverName ? ` (${designApproverName})` : ""}.
            </span>
          ) : (
            <span>
              ✏️ Customer requested design changes
              {designChangesComment ? `: “${designChangesComment}”` : "."}
            </span>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
        <div>
          <Label size="xsmall">Status</Label>
          <Select
            value={quote.status}
            onValueChange={(v) => onUpdate({ status: v })}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {(Object.keys(STATUS_LABELS) as Quote["status"][]).map((s) => (
                <Select.Item key={s} value={s}>
                  {STATUS_LABELS[s]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <div>
          <Label size="xsmall">Assigned to</Label>
          <Input
            value={draftAssigned}
            onChange={(e) => setDraftAssigned(e.target.value)}
            onBlur={() =>
              draftAssigned !== (quote.assigned_to ?? "") &&
              onUpdate({ assigned_to: draftAssigned || null })
            }
            placeholder="staff email"
          />
        </div>
      </div>

      <div>
        <Label size="xsmall">Total estimate ({quote.currency_code.toUpperCase()})</Label>
        <div className="flex gap-x-2">
          <Input
            value={draftEstimate}
            onChange={(e) => setDraftEstimate(e.target.value)}
            placeholder="0.00"
          />
          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              const num = Number.parseFloat(draftEstimate)
              onUpdate({ total_estimate: Number.isFinite(num) ? num : null })
            }}
          >
            Update
          </Button>
        </div>
      </div>

      <div>
        <Label size="xsmall">Customer message</Label>
        <Textarea
          rows={6}
          value={draftMessage}
          onChange={(e) => setDraftMessage(e.target.value)}
          onBlur={() =>
            draftMessage !== (quote.message ?? "") &&
            onUpdate({ message: draftMessage })
          }
        />
      </div>

      {Array.isArray(quote.metadata?.mood_board_urls) &&
      (quote.metadata!.mood_board_urls as unknown[]).length > 0 ? (
        <div>
          <Heading level="h3" className="text-base">Mood board</Heading>
          <Text size="xsmall" className="text-ui-fg-muted mt-1 mb-2">
            Reference images the customer attached with their quote request.
          </Text>
          <div className="flex flex-wrap gap-2">
            {(quote.metadata!.mood_board_urls as string[]).map((url, idx) => (
              <a
                key={idx}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block h-24 w-24 overflow-hidden rounded-md border border-ui-border-base bg-ui-bg-subtle"
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <Heading level="h3" className="text-base">Line items</Heading>
        <div className="mt-2">
          <LineItemsEditor
            rows={draftLineItems}
            onChange={setDraftLineItems}
            regionId={regionId}
            onDesignLine={(row) =>
              openStudio(row.group_id ?? null, row.product_handle ?? null)
            }
            onAddDesign={() => openStudio(null, null)}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="small"
            variant="secondary"
            disabled={studioOpen}
            isLoading={savingLines}
            onClick={async () => {
              setSavingLines(true)
              try {
                await onUpdate({ line_items: draftToLineItems(draftLineItems) })
              } finally {
                setSavingLines(false)
              }
            }}
          >
            Save line items
          </Button>
          <Button
            size="small"
            variant="transparent"
            onClick={() => {
              const sum = draftToLineItems(draftLineItems).reduce(
                (acc, li) => acc + (li.total ?? 0),
                0
              )
              const rounded = Math.round(sum * 100) / 100
              setDraftEstimate(String(rounded))
              onUpdate({ total_estimate: rounded })
            }}
          >
            Sum line items → estimate
          </Button>
        </div>
        <Text size="xsmall" className="text-ui-fg-muted mt-2">
          {studioOpen
            ? "Studio window open — finish or close it to save line-item edits. Designs save to the quote automatically."
            : "Studio designs auto-save to the quote. Use “Save line items” after editing quantities, prices, or descriptions."}
        </Text>
      </div>

      <div>
        <Heading level="h3" className="text-base">Timeline</Heading>
        {events.length === 0 ? (
          <Text size="xsmall" className="text-ui-fg-muted mt-2">
            No activity yet.
          </Text>
        ) : (
          <ul className="mt-2 divide-y">
            {events.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex items-center justify-between">
                  <Text weight="plus">{e.type}</Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {new Date(e.created_at).toLocaleString("en-AU")}
                  </Text>
                </div>
                <Text size="xsmall" className="text-ui-fg-muted">
                  {e.actor ? `by ${e.actor}` : "system"}
                </Text>
                {Object.keys(e.body || {}).length > 0 ? (
                  <pre className="mt-1 text-xs bg-ui-bg-subtle p-2 rounded whitespace-pre-wrap break-words">
                    {JSON.stringify(e.body, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Quotes",
  icon: tinted(ChatBubbleLeftRight, NAV_COLOR.sales),
  rank: 11,
})

export default QuotesPage
