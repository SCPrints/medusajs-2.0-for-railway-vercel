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

import { HelpTooltip } from "../reports/help-tooltip"
import {
  ProductLinePicker,
  type PickedProductLine,
} from "../quotes/product-line-picker"
import { mergeServerRows } from "../../lib/quote-line-merge"
import { AppLink } from "../../lib/nav"

export type Quote = {
  id: string
  public_id: string
  status: "new" | "quoted" | "accepted" | "lost" | "expired"
  source: "byo" | "contact" | "admin" | "custom_hats" | "customizer_poa"
  customer_id?: string | null
  email: string
  contact_name: string | null
  contact_phone?: string | null
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
      print_urls?: Array<{ side?: string | null; url: string }> | null
      original_files?: Array<{ url: string; fileName?: string | null; sides?: string[] | null }> | null
      print_size_id?: string | null
      group_id?: string | null
    }>
  }
  metadata?: Record<string, unknown> | null
  created_at: string
}

export type Region = { id: string; name: string; currency_code: string }

// Keyed by string (not Quote["status"]) so the transient "converting" status —
// written briefly by the accept route's atomic claim, outside the model enum —
// still renders a labelled badge instead of a blank one.
export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  quoted: "Quoted",
  accepted: "Accepted",
  converting: "Converting…",
  lost: "Lost",
  expired: "Expired",
}

export const STATUS_COLORS: Record<string, "blue" | "orange" | "green" | "red" | "grey"> = {
  new: "blue",
  quoted: "orange",
  accepted: "green",
  converting: "orange",
  lost: "red",
  expired: "grey",
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-AU")

const genLineId = () =>
  `ln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

type QuoteLineItem = NonNullable<Quote["line_items"]["items"]>[number]

// The line-items editor works in string-valued draft rows so the number
// inputs can be cleared without coercing to 0; `draftToLineItems` converts
// back to the persisted shape on save. Catalog linkage + the Studio design
// payload ride along untouched so a qty/price edit never drops a design.
export type DraftLineItem = {
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
  print_urls?: Array<{ side?: string | null; url: string }> | null
  original_files?: Array<{ url: string; fileName?: string | null; sides?: string[] | null }> | null
  print_size_id?: string | null
  group_id?: string | null
  // Copy the stored design from this other line on save (route restores it).
  design_from?: string
}

export const emptyLineItem = (): DraftLineItem => ({
  id: genLineId(),
  title: "",
  description: "",
  quantity: "",
  unit_price: "",
})

export function lineItemsToDraft(items?: Quote["line_items"]["items"]): DraftLineItem[] {
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
    print_urls: li.print_urls ?? null,
    original_files: li.original_files ?? null,
    print_size_id: li.print_size_id ?? null,
    group_id: li.group_id ?? null,
  }))
}

export function draftToLineItems(rows: DraftLineItem[]): QuoteLineItem[] {
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
        ...(r.design_from ? { design_from: r.design_from } : {}),
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

export function LineItemsEditor({
  rows,
  onChange,
  regionId,
  onDesignLine,
  onAddDesign,
  pricerQuoteId,
}: {
  rows: DraftLineItem[]
  onChange: (rows: DraftLineItem[]) => void
  regionId: string | null
  /** Open the Studio to (re)design a row. Omit to hide Studio actions. */
  onDesignLine?: (row: DraftLineItem) => void
  /** Open the Studio with no preselected product. Omit to hide. */
  onAddDesign?: () => void
  /**
   * Quote id for the full-page job pricer (`/app/quote-pricer?quote=`), which
   * prices garments + decoration with live margin and writes the lines back
   * onto this quote. Omit (create drawer) to hide the button.
   */
  pricerQuoteId?: string | null
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

  // --- Copy a design onto other lines ---
  // One garment is often quoted as one line per size; each line would
  // otherwise need its own Studio session. Copying points the target at the
  // source's stored design (`design_from`, restored by the save route), so
  // the order gets the same design on every size line and shows one proof.
  const [copyFromId, setCopyFromId] = useState<string | null>(null)
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set())

  const openCopy = (src: DraftLineItem) => {
    setCopyFromId(src.id)
    setCopyTargets(
      new Set(
        rows
          .filter(
            (r) =>
              r.id !== src.id &&
              !r.customizerDesign &&
              Boolean(src.product_handle) &&
              r.product_handle === src.product_handle
          )
          .map((r) => r.id)
      )
    )
  }

  const applyCopy = () => {
    const src = rows.find((r) => r.id === copyFromId)
    if (!src) return
    onChange(
      rows.map((r) =>
        copyTargets.has(r.id)
          ? {
              ...r,
              customizerDesign: true,
              design_from: src.design_from ?? src.id,
              thumbnail: src.thumbnail ?? r.thumbnail,
              mockup_urls: src.mockup_urls ?? null,
              print_urls: src.print_urls ?? null,
              original_files: src.original_files ?? null,
              print_size_id: src.print_size_id ?? r.print_size_id ?? null,
            }
          : r
      )
    )
    toast.success(
      `Design copied to ${copyTargets.size} line${copyTargets.size === 1 ? "" : "s"} — save line items to keep it`
    )
    setCopyFromId(null)
  }

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
                {/* Job-pricer lines (jp_…) open the Studio on THEIR group so the
                    design attaches to them at the quoted price — the bottom
                    "Design in Studio" starts a new group (a duplicate line).
                    Catalog lines do the same: the Studio opens on their
                    product + colour and the design attaches at their price. */}
                {(hasDesign ||
                  (row.group_id && row.id.startsWith("jp_")) ||
                  (row.product_handle && !row.id.startsWith("jp_"))) &&
                onDesignLine ? (
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => onDesignLine(row)}
                  >
                    <PencilSquare /> {hasDesign ? "Edit design in Studio" : "Design in Studio"}
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
                      {m.side
                        ? String(m.side).replace(/_/g, " ")
                        : // ponytail: a pricer line with no Studio design carries the design letter's artwork, not a mockup
                          row.id.startsWith("jp_") && !hasDesign
                          ? "artwork"
                          : "mockup"}
                    </a>
                  </Button>
                ))}
                {/* Customer's uploaded source files + rendered print files —
                    staff need these to quote (e.g. POA embroidery digitizing). */}
                {(row.original_files ?? []).map((f, i) => (
                  <Button key={`orig-${i}`} size="small" variant="secondary" asChild>
                    <a href={f.url} target="_blank" rel="noreferrer" download>
                      Artwork: {f.fileName || `file ${i + 1}`}
                      {f.sides?.length
                        ? ` (${f.sides.join(", ").replace(/_/g, " ")})`
                        : ""}
                    </a>
                  </Button>
                ))}
                {(row.print_urls ?? [])
                  .map((a, i) => (
                    <Button key={`print-${i}`} size="small" variant="secondary" asChild>
                      <a href={a.url} target="_blank" rel="noreferrer">
                        Print file{a.side ? `: ${a.side.replace(/_/g, " ")}` : ""}
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
                {hasDesign && rows.length > 1 ? (
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() =>
                      copyFromId === row.id ? setCopyFromId(null) : openCopy(row)
                    }
                  >
                    Copy design to…
                  </Button>
                ) : null}
              </div>
              {copyFromId === row.id ? (
                <div className="rounded-md bg-ui-bg-subtle p-2 flex flex-col gap-y-2">
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Use this design and mockup on these lines (e.g. the other
                    sizes of the same garment). Their qty and price stay as they are.
                  </Text>
                  {rows
                    .filter((r) => r.id !== row.id)
                    .map((r) => (
                      <label key={r.id} className="flex items-center gap-x-2 text-xs">
                        <Checkbox
                          checked={copyTargets.has(r.id)}
                          onCheckedChange={(v) =>
                            setCopyTargets((prev) => {
                              const next = new Set(prev)
                              v ? next.add(r.id) : next.delete(r.id)
                              return next
                            })
                          }
                        />
                        <span>
                          {r.title || "(untitled line)"}
                          {r.quantity ? ` × ${r.quantity}` : ""}
                          {r.customizerDesign ? " — replaces its design" : ""}
                        </span>
                      </label>
                    ))}
                  <div className="flex gap-x-2">
                    <Button size="small" disabled={!copyTargets.size} onClick={applyCopy}>
                      Copy design
                    </Button>
                    <Button size="small" variant="transparent" onClick={() => setCopyFromId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
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
        {pricerQuoteId ? (
          <Button size="small" variant="secondary" asChild>
            <AppLink href={`/app/quote-pricer?quote=${encodeURIComponent(pricerQuoteId)}`}>
              <CurrencyDollar /> Price a job
            </AppLink>
          </Button>
        ) : null}
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

/**
 * The job as priced in the Job pricer — groups, size runs, positions, setups,
 * totals — rendered from the snapshot the pricer saves on the quote
 * (`metadata.job_pricer.snapshot`, prices frozen at send time). The line
 * items below stay the editable ledger; this is what a human reads.
 */
export function JobBreakdownCard({ jobPricer, quoteId }: { jobPricer: unknown; quoteId: string }) {
  const jp = jobPricer as
    | {
        saved_at?: string
        snapshot?: {
          summary?: string
          tier?: string
          garmentQuantity?: number
          designs?: Array<{ label: string; repeat?: boolean; imageUrl?: string | null }>
          groups?: Array<{
            title: string
            thumbnail?: string | null
            quantity: number
            unitSellMin: number
            unitSellMax: number
            sellTotalMajor: number
            marginPct: number | null
            override?: boolean
            positions: string[]
            rows: Array<{ label: string; quantity: number; unitSellMajor: number; sellTotalMajor: number }>
          }>
          extras?: Array<{ label: string; quantity: number; unitSellMajor: number; sellTotalMajor: number; waived?: boolean }>
          totals?: { subtotalIncMajor?: number; discountMajor?: number; sellIncMajor: number; costExMajor: number | null; marginExMajor: number | null; marginPct: number | null }
        }
      }
    | null
    | undefined
  const snap = jp?.snapshot
  if (!snap?.groups?.length && !snap?.extras?.length) return null
  const money = (n: number | null | undefined) =>
    n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)
  const tone = (pct: number | null | undefined): "grey" | "red" | "orange" | "green" =>
    pct == null ? "grey" : pct < 15 ? "red" : pct < 35 ? "orange" : "green"
  return (
    <div className="rounded-md border border-ui-border-base">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-ui-bg-subtle">
        <div>
          <Text weight="plus" size="small">Job breakdown</Text>
          <Text size="xsmall" className="text-ui-fg-muted">
            {snap.garmentQuantity ?? 0} garments · {snap.tier ?? "Public quantity ladder"}
            {jp?.saved_at ? ` · priced ${new Date(jp.saved_at).toLocaleString("en-AU")}` : ""}
            {snap.designs?.length ? ` · designs ${snap.designs.map((d) => `${d.label}${d.repeat ? " (repeat)" : ""}`).join(", ")}` : ""}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {(snap.designs ?? []).filter((d) => d.imageUrl).map((d) => (
            <a key={d.label} href={d.imageUrl!} target="_blank" rel="noreferrer" title={`Design ${d.label}`} className="relative">
              <img src={d.imageUrl!} alt={`Design ${d.label}`} className="w-9 h-9 rounded object-contain bg-ui-bg-base border border-ui-border-base" />
              <span className="absolute -bottom-1 -right-1 text-[9px] font-semibold rounded bg-ui-bg-base border border-ui-border-base px-1">{d.label}</span>
            </a>
          ))}
          <Button size="small" variant="secondary" asChild>
            <AppLink href={`/app/quote-pricer?quote=${encodeURIComponent(quoteId)}`}>Edit in Job pricer</AppLink>
          </Button>
        </div>
      </div>
      <div className="divide-y divide-ui-border-base">
        {(snap.groups ?? []).map((g, i) => (
          <div key={i} className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {g.thumbnail ? <img src={g.thumbnail} alt="" className="w-8 h-8 rounded object-cover bg-ui-bg-subtle" /> : null}
              <span className="font-medium">{g.quantity} × {g.title}</span>
              <span className="text-xs text-ui-fg-muted">{g.unitSellMin !== g.unitSellMax ? `${money(g.unitSellMin)}–${money(g.unitSellMax)}` : money(g.unitSellMin)}/unit{g.override ? " (negotiated)" : ""}</span>
              {g.marginPct != null ? <Badge size="2xsmall" color={tone(g.marginPct)}>{g.marginPct}%</Badge> : null}
              <span className="ml-auto font-medium">{money(g.sellTotalMajor)}</span>
            </div>
            {g.positions.length ? <div className="text-xs text-ui-fg-muted mt-1">{g.positions.join(" · ")}</div> : <div className="text-xs text-ui-fg-muted mt-1">Blank garment</div>}
            {g.rows.length > 1 ? (
              <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {g.rows.map((r, j) => (
                  <span key={j} className="text-ui-fg-subtle">{r.label} <span className="text-ui-fg-muted">× {r.quantity}</span></span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {(snap.extras ?? []).length ? (
          <div className="px-3 py-2 text-xs flex flex-col gap-y-0.5">
            {(snap.extras ?? []).map((x, i) => (
              <div key={i} className={`flex justify-between gap-2 ${x.waived ? "text-ui-fg-muted line-through" : ""}`}>
                <span>{x.label}</span>
                <span className="whitespace-nowrap">{x.quantity} × {money(x.unitSellMajor)} = {money(x.sellTotalMajor)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {snap.totals ? (
          <div className="px-3 py-2 text-sm flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1">
            {snap.totals.discountMajor ? (
              <span className="text-xs text-ui-fg-muted">subtotal {money(snap.totals.subtotalIncMajor)} − discount {money(snap.totals.discountMajor)}</span>
            ) : null}
            <span><span className="text-ui-fg-muted text-xs mr-1">Sell inc GST</span><span className="font-medium">{money(snap.totals.sellIncMajor)}</span></span>
            <span><span className="text-ui-fg-muted text-xs mr-1">Cost ex</span>{money(snap.totals.costExMajor)}</span>
            <span>
              <span className="text-ui-fg-muted text-xs mr-1">Margin</span>{money(snap.totals.marginExMajor)}
              {snap.totals.marginPct != null ? <Badge size="2xsmall" color={tone(snap.totals.marginPct)} className="ml-1">{snap.totals.marginPct}%</Badge> : null}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function QuoteDetail({
  quote,
  regionId,
  onUpdate,
  onReload,
  incomingStudioPopup,
  onIncomingStudioConsumed,
}: {
  quote: Quote
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
    async (group: string | null, handle: string | null, variant: string | null = null) => {
      try {
        const params = new URLSearchParams()
        if (group) params.set("group", group)
        if (handle) params.set("handle", handle)
        if (variant) params.set("variant", variant)
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
  const convertedOrderId =
    typeof quote.metadata?.order_id === "string"
      ? (quote.metadata.order_id as string)
      : null
  const convertedDisplayId = quote.metadata?.order_display_id ?? null
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

  // Email the customer straight from the quote: the design approval (mockups +
  // decoration details), an optional note, and — when every line is priced —
  // the price + accept-and-pay link, so one send is the whole quote.
  const [sendingApproval, setSendingApproval] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailNote, setEmailNote] = useState("")
  const quoteItems = quote.line_items?.items ?? []
  const allPriced =
    quoteItems.length > 0 && quoteItems.every((li) => li.unit_price != null)
  const [includeQuote, setIncludeQuote] = useState(allPriced)
  const sendDesignApprovalLink = async () => {
    setSendingApproval(true)
    try {
      const res = await fetch(
        `/admin/quotes/${quote.id}/design-approval-link`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: emailNote.trim() || undefined,
            include_quote: includeQuote && allPriced,
          }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      toast.success(
        `${includeQuote && allPriced ? "Quote" : "Design approval"} emailed to ${json.sent_to}${
          json.has_mockups ? "" : " (no mockup attached yet)"
        }`
      )
      setEmailOpen(false)
      setEmailNote("")
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
            onClick={() => {
              setIncludeQuote(allPriced)
              setEmailOpen((v) => !v)
            }}
          >
            Email customer…
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={allPriced ? copyAcceptLink : copyDesignApprovalLink}
            title={
              allPriced
                ? "The accept-and-pay link (same one the email carries) — paste it into a reply."
                : "The design-approval link — the quote has no prices yet, so there is nothing to accept."
            }
          >
            {allPriced ? "Copy accept link" : "Copy design-approval link"}
          </Button>
          <Button size="small" variant="secondary" asChild>
            <AppLink href={`/app/jobs/${encodeURIComponent(quote.id)}`} title="Phase, next action (incl. Convert to order), activity and replies.">
              Open job
            </AppLink>
          </Button>
          {convertedOrderId ? (
            <Button size="small" variant="secondary" asChild>
              <AppLink
                href={`/app/orders/${convertedOrderId}`}
                target="_blank"
                rel="noreferrer"
              >
                View order{convertedDisplayId ? ` #${convertedDisplayId}` : ""}
              </AppLink>
            </Button>
          ) : null}
          <Badge color={STATUS_COLORS[quote.status]}>{STATUS_LABELS[quote.status]}</Badge>
        </div>
      </div>

      {emailOpen ? (
        <div className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
          <Text size="small" weight="plus">
            Email {quote.email}
          </Text>
          <Text size="xsmall" className="text-ui-fg-muted">
            Sends the mockups, decoration details and the design-approval link.
          </Text>
          <label className="flex items-center gap-x-2 text-sm">
            <Checkbox
              checked={includeQuote && allPriced}
              disabled={!allPriced}
              onCheckedChange={(v) => setIncludeQuote(v === true)}
            />
            Include the price and the accept-and-pay link
            {!allPriced ? (
              <span className="text-xs text-ui-tag-orange-text">
                — price every line first (an unpriced line falls back to the catalogue price)
              </span>
            ) : null}
          </label>
          <Textarea
            rows={3}
            value={emailNote}
            onChange={(e) => setEmailNote(e.target.value)}
            placeholder="Note to the customer (optional) — e.g. please send higher-resolution artwork: vector (AI, EPS, SVG, PDF) or 300 DPI PNG at print size."
          />
          <div className="flex justify-end gap-x-2">
            <Button size="small" variant="secondary" onClick={() => setEmailOpen(false)}>
              Cancel
            </Button>
            <Button size="small" variant="primary" isLoading={sendingApproval} onClick={sendDesignApprovalLink}>
              {includeQuote && allPriced ? "Send quote" : "Send design approval"}
            </Button>
          </div>
        </div>
      ) : null}

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

      <JobBreakdownCard jobPricer={quote.metadata?.job_pricer} quoteId={quote.id} />

      <div>
        <Heading level="h3" className="text-base">Line items</Heading>
        <div className="mt-2">
          <LineItemsEditor
            rows={draftLineItems}
            onChange={setDraftLineItems}
            regionId={regionId}
            pricerQuoteId={quote.id}
            onDesignLine={async (row) => {
              // Customer-supplied pricer groups sit on the service line, so the
              // line has no garment — open the Studio on the stand-in the
              // Job pricer picked for the mockup instead.
              const jpGroup = ((quote.metadata?.job_pricer as any)?.state?.groups ?? []).find(
                (g: any) => g?.id === row.group_id
              )
              if (jpGroup?.supplied) {
                const handle = jpGroup.mockupProduct?.handle
                if (!handle) {
                  toast.info("Customer-supplied garments — pick a mockup garment for this group in the Job pricer first")
                  return
                }
                return openStudio(row.group_id ?? null, handle, null)
              }
              if (row.group_id) {
                return openStudio(row.group_id, row.product_handle ?? null, row.variant_id ?? null)
              }
              // A staff-priced catalog line with no group yet: give it a `gs_`
              // group (STAFF_PRICED_GROUP_PREFIX in lib/quote-design-lines.ts)
              // and save it first, so the Studio's post-back attaches the
              // design to THIS line at its quoted price instead of appending
              // a new line at the Studio's price.
              const group_id = `gs_${crypto.randomUUID().replace(/-/g, "")}`
              const next = draftLineItems.map((r) => (r.id === row.id ? { ...r, group_id } : r))
              const res = await fetch(`/admin/quotes/${quote.id}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ line_items: draftToLineItems(next) }),
              })
              if (!res.ok) {
                toast.error("Couldn't prepare the line for the Studio — save line items and try again")
                return
              }
              setDraftLineItems(next)
              serverSig.current = lineItemsSignature(draftToLineItems(next))
              return openStudio(group_id, row.product_handle ?? null, row.variant_id ?? null)
            }}
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

      <Text size="xsmall" className="text-ui-fg-muted">
        Activity (emails, status changes, tasks) and the next action live on the{" "}
        <AppLink className="underline" href={`/app/jobs/${encodeURIComponent(quote.id)}`}>job page</AppLink>.
      </Text>
    </div>
  )
}

/**
 * The quote tools inside the job window: everything the old quote page could
 * do (email the customer, status, assignee, estimate, message, mood board,
 * breakdown, line editing, Studio) mounted as-is. Loads the full quote itself
 * and saves through the same route, refusing a save made from a stale read.
 */
export function QuoteTools({ quoteId, onChanged }: { quoteId: string; onChanged: () => void }) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [regionId, setRegionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/admin/quotes/${encodeURIComponent(quoteId)}`, { credentials: "include" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as any)?.error ?? `HTTP ${res.status}`)
      setQuote((json as any).quote as Quote)
      setError(null)
    } catch (err: any) {
      setError(err?.message ?? "Couldn't load the quote")
    }
  }, [quoteId])

  useEffect(() => {
    void load()
    void fetch("/admin/regions?limit=50&fields=id,name,currency_code", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { regions: [] }))
      .then((j: { regions?: Region[] }) => {
        const regions = j.regions ?? []
        const aud = regions.find((r) => String(r.currency_code).toLowerCase() === "aud")
        setRegionId((aud ?? regions[0])?.id ?? null)
      })
      .catch(() => {})
  }, [load])

  const patch = async (p: Record<string, unknown>) => {
    try {
      const res = await fetch(`/admin/quotes/${encodeURIComponent(quoteId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p.line_items || p.metadata ? { ...p, expected_updated_at: (quote as any)?.updated_at } : p),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 409 && (json as any)?.code === "quote_changed") {
        toast.error((json as any).error ?? "This quote changed — reload before saving.")
        return
      }
      if (!res.ok) throw new Error((json as any)?.error ?? (json as any)?.message ?? `HTTP ${res.status}`)
      if ((json as any)?.order) toast.success(`Accepted — order #${(json as any).order.display_id ?? ""} created`)
      else if ((json as any)?.order_error) toast.warning(`Saved, but no order was created: ${(json as any).order_error}`)
      else toast.success("Saved")
      await load()
      onChanged()
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed")
    }
  }

  if (error) return <Text size="small" className="text-ui-fg-error">{error}</Text>
  if (!quote) return <Text size="small" className="text-ui-fg-muted">Loading quote…</Text>
  return <QuoteDetail quote={quote} regionId={regionId} onUpdate={patch} onReload={async () => { await load(); onChanged() }} />
}
