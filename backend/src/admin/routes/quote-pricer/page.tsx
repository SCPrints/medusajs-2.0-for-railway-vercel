import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar, Plus, Trash, XMark } from "@medusajs/icons"
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Text,
  toast,
} from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { TIERS, getTierBySlug, tierForCustomer, type Tier } from "../../../lib/customer-tiers"
import { garmentCostExMajor, garmentMajorWithTier } from "../../../lib/garment-ladder"
import {
  priceQuoteJob,
  type PrintChannel,
  type QuoteJobSpec,
  type QuotePriceComponent,
  type ResolvedGarment,
} from "../../../lib/quote-pricing"
import {
  SCP_BLANK_ALIGNED_QUANTITY_TIERS,
  SCP_PRINT_SIZE_OPTIONS,
  type ScpPrintSizeId,
} from "../../../lib/scp-dtf-print-pricing"
import { parseDecorationPricingClass } from "../../../lib/scp-supacolour-pricing"
import { tinted, NAV_COLOR } from "../../lib/nav-tint"

/**
 * Job pricer — the quoting calculator, full page. Modelled on the Quick
 * Pricing spreadsheet: describe the decoration once, add as many garments as
 * the job has (each with its own size/colour + qty), and every number
 * recalculates in the browser on each keystroke — no server round-trips.
 * Sell comes from the live rate cards, cost from the cost-model constants
 * (lib/quote-pricing.ts), and the band table shows the per-garment price at
 * every quantity band at once. "Send to quote" writes the lines onto an
 * existing quote (`?quote=<id>`) or creates one.
 *
 * The only network calls are product search, product detail (variant
 * ladders + flags) and the one-off lookup of the hidden setup-fee products.
 */

type ProductLite = { id: string; title: string; handle: string | null; thumbnail: string | null }
type VariantLite = { id: string; title: string | null; sku: string | null; metadata: Record<string, unknown> | null }
type ProductDetail = ProductLite & { metadata: Record<string, unknown> | null; variants: VariantLite[] }

type GarmentRow = {
  id: string
  /** null = customer-supplied garment (decoration only). */
  product: ProductDetail | null
  variantId: string | null
  qty: string
  supplied: boolean
}

type ServiceProduct = { product_id: string; variant_id: string; handle: string | null; title: string }
type SetupKey = NonNullable<QuotePriceComponent["setupProduct"]>

type QuoteLine = {
  title: string
  description: string | null
  quantity: number
  unit_price: number
  product_id: string | null
  variant_id: string | null
  product_handle: string | null
  thumbnail: string | null
}

const PRINT_CHANNEL_LABELS: Record<PrintChannel, string> = {
  dtf: "DTF — our garment (Supacolour auto on poly)",
  supacolour: "Supacolour — our poly garment",
  byo: "BYO — their garment, retail + handling",
  promo: "Trade — their garment, ex-GST card",
  press_only: "Press only — they supply transfers",
}

const SETUP_HANDLES: Record<Exclude<SetupKey, "embroidery_setup">, string> = {
  screen_setup: "screen-printing-setup-fee",
  supacolour_setup: "supacolour-transfer-setup-fee",
}

const genId = () => `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const money = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)
const round2 = (n: number) => Math.round(n * 100) / 100
const marginTone = (pct: number | null): "grey" | "red" | "orange" | "green" =>
  pct == null ? "grey" : pct < 15 ? "red" : pct < 35 ? "orange" : "green"
const sizeLabel = (id: ScpPrintSizeId) => SCP_PRINT_SIZE_OPTIONS.find((o) => o.id === id)?.label ?? id

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" })
  if (!res.ok) throw new Error(`${path.split("?")[0]} failed (${res.status})`)
  return (await res.json()) as T
}

function resolveGarment(row: GarmentRow, quantity: number, tier: Tier | null): ResolvedGarment | null {
  if (!row.product || !row.variantId) return null
  const variant = row.product.variants.find((v) => v.id === row.variantId)
  if (!variant) return null
  const cost = garmentCostExMajor(variant.metadata)
  const productMeta = row.product.metadata ?? {}
  return {
    title: `${row.product.title}${variant.title ? ` — ${variant.title}` : ""}`,
    unitSellMajor: garmentMajorWithTier(variant.metadata, quantity, tier),
    unitCostExMajor: cost.costExMajor,
    costEstimated: cost.estimated,
    supacolour: parseDecorationPricingClass(productMeta.decoration_pricing_class) === "supacolour",
    screenHeavy: productMeta.screen_heavy === true,
  }
}

/** Inline product typeahead for a garment row. */
function GarmentSearch({ onPick }: { onPick: (p: ProductLite) => void }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<ProductLite[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      return
    }
    const mine = ++seq.current
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const json = await adminGet<{ products: ProductLite[] }>(
          `/admin/products?q=${encodeURIComponent(q.trim())}&limit=12&fields=id,title,handle,thumbnail`
        )
        if (mine === seq.current) setResults(json.products ?? [])
      } catch {
        /* keep last results */
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="relative">
      <Input
        size="small"
        placeholder="Search garment (name, SKU, handle)…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (results.length > 0 || loading) ? (
        <ul className="absolute z-20 mt-1 w-[28rem] max-w-[80vw] max-h-72 overflow-y-auto rounded-md border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout divide-y divide-ui-border-base">
          {loading && results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-ui-fg-muted">Searching…</li>
          ) : null}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-ui-bg-subtle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p)
                  setQ("")
                  setResults([])
                  setOpen(false)
                }}
              >
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt="" className="w-7 h-7 rounded object-cover bg-ui-bg-subtle" />
                ) : (
                  <div className="w-7 h-7 rounded bg-ui-bg-subtle" />
                )}
                <span className="truncate">{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function QuotePricerPage() {
  // --- target quote (optional, from ?quote=) ---
  const targetQuoteId = useMemo(
    () => new URLSearchParams(window.location.search).get("quote"),
    []
  )
  const [targetQuote, setTargetQuote] = useState<{ id: string; public_id: string; email: string; customer_id: string | null } | null>(null)

  // --- pricing context ---
  const [tierSlug, setTierSlug] = useState<string>("standard")
  const tier = useMemo(() => getTierBySlug(tierSlug), [tierSlug])

  // --- decoration spec (shared by every garment on the job) ---
  const [channel, setChannel] = useState<PrintChannel | "auto">("auto")
  const [prints, setPrints] = useState<ScpPrintSizeId[]>([])
  const [supaRepeat, setSupaRepeat] = useState(false)
  const [screens, setScreens] = useState<Array<{ colours: string; dark: boolean }>>([])
  const [screenHeavy, setScreenHeavy] = useState<"auto" | "yes" | "no">("auto")
  const [screenRepeat, setScreenRepeat] = useState(false)
  const [emb, setEmb] = useState<Array<{ stitches: string; digitizing: boolean }>>([])
  const [embPromo, setEmbPromo] = useState(false)
  const [uvMetres, setUvMetres] = useState("")
  const [uvReorder, setUvReorder] = useState(false)

  // --- garments ---
  const [rows, setRows] = useState<GarmentRow[]>([])
  const [setups, setSetups] = useState<Record<SetupKey, ServiceProduct | null>>({
    screen_setup: null,
    supacolour_setup: null,
    embroidery_setup: null,
  })

  // Load the target quote (for its customer's tier + public id) and the hidden
  // setup-fee products once.
  useEffect(() => {
    void (async () => {
      try {
        const handles = Object.values(SETUP_HANDLES).map((h) => `handle[]=${encodeURIComponent(h)}`).join("&")
        const [byHandle, byTitle] = await Promise.all([
          adminGet<{ products: Array<ProductLite & { variants: Array<{ id: string }> }> }>(
            `/admin/products?${handles}&fields=id,handle,title,variants.id`
          ),
          adminGet<{ products: Array<ProductLite & { variants: Array<{ id: string }> }> }>(
            `/admin/products?q=setup&limit=20&fields=id,handle,title,variants.id`
          ),
        ])
        const toService = (p?: ProductLite & { variants: Array<{ id: string }> }): ServiceProduct | null =>
          p?.variants?.[0]?.id ? { product_id: p.id, variant_id: p.variants[0].id, handle: p.handle, title: p.title } : null
        const next: Record<SetupKey, ServiceProduct | null> = { screen_setup: null, supacolour_setup: null, embroidery_setup: null }
        for (const p of byHandle.products ?? []) {
          if (p.handle === SETUP_HANDLES.screen_setup) next.screen_setup = toService(p)
          if (p.handle === SETUP_HANDLES.supacolour_setup) next.supacolour_setup = toService(p)
        }
        next.embroidery_setup = toService(
          (byTitle.products ?? []).find((p) => /embroidery.*setup|setup.*embroidery|digitiz/i.test(p.title ?? ""))
        )
        setSetups(next)
      } catch {
        /* unresolved setups become custom lines */
      }
    })()
  }, [])

  useEffect(() => {
    if (!targetQuoteId) return
    void (async () => {
      try {
        const { quote } = await adminGet<{ quote: { id: string; public_id: string; email: string; customer_id: string | null } }>(
          `/admin/quotes/${targetQuoteId}`
        )
        setTargetQuote(quote)
        if (quote.customer_id) {
          const { customer } = await adminGet<{ customer: { groups?: Array<{ id: string; name: string; metadata: Record<string, unknown> | null }> } }>(
            `/admin/customers/${quote.customer_id}?fields=%2Bgroups.id,%2Bgroups.name,%2Bgroups.metadata`
          )
          const t = tierForCustomer({ groups: customer.groups ?? [] })
          if (t) setTierSlug(t.slug)
        }
      } catch (err: any) {
        toast.error(err?.message ?? "Couldn't load the quote")
      }
    })()
  }, [targetQuoteId])

  // --- row helpers ---
  const addGarmentRow = () => setRows((r) => [...r, { id: genId(), product: null, variantId: null, qty: "", supplied: false }])
  const addSuppliedRow = () => setRows((r) => [...r, { id: genId(), product: null, variantId: null, qty: "", supplied: true }])
  const patchRow = (id: string, patch: Partial<GarmentRow>) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  const removeRow = (id: string) => setRows((r) => r.filter((row) => row.id !== id))

  const pickProduct = useCallback(async (rowId: string, p: ProductLite) => {
    try {
      const { product } = await adminGet<{ product: ProductDetail }>(
        `/admin/products/${p.id}?fields=id,title,handle,thumbnail,metadata,variants.id,variants.title,variants.sku,variants.metadata`
      )
      const variants = product.variants ?? []
      setRows((r) =>
        r.map((row) =>
          row.id === rowId ? { ...row, product: { ...product, variants }, variantId: variants[0]?.id ?? null, supplied: false } : row
        )
      )
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't load the product")
    }
  }, [])

  // --- the spec ---
  const spec = useMemo<Omit<QuoteJobSpec, "quantity">>(
    () => ({
      prints: prints.map((sizeId) => ({ sizeId })),
      printChannel: channel === "auto" ? undefined : channel,
      supacolourRepeatSetup: supaRepeat,
      screen: screens.length
        ? {
            positions: screens.map((s) => ({ colours: Math.min(6, Math.max(1, Number(s.colours) || 1)), darkGarment: s.dark })),
            heavyGarment: screenHeavy === "auto" ? undefined : screenHeavy === "yes",
            repeatSetup: screenRepeat,
          }
        : undefined,
      embroidery: emb
        .map((e) => ({ stitchCount: Number(e.stitches) || 0, digitizing: e.digitizing }))
        .filter((e) => e.stitchCount > 0),
      embroideryPromo: embPromo,
      uvdtf: Number(uvMetres) > 0 ? { metres: Number(uvMetres), reorder: uvReorder } : undefined,
    }),
    [prints, channel, supaRepeat, screens, screenHeavy, screenRepeat, emb, embPromo, uvMetres, uvReorder]
  )

  // --- pricing (pure, synchronous) ---
  const priced = useMemo(() => {
    const rowQty = (r: GarmentRow) => Math.max(0, Math.floor(Number(r.qty) || 0))
    const jobQty = Math.max(1, rows.reduce((s, r) => s + rowQty(r), 0))

    const rowResults = rows.map((row) => {
      const qty = rowQty(row)
      const garment = resolveGarment(row, jobQty, tier)
      const result = priceQuoteJob({ ...spec, quantity: jobQty }, garment)
      const perGarment = result.components.filter((c) => c.kind === "per_garment")
      const unitSell = result.perGarmentSellMajor
      const unitCost = perGarment.every((c) => c.unitCostExMajor != null)
        ? round2(perGarment.reduce((s, c) => s + (c.unitCostExMajor ?? 0), 0))
        : null
      const sellTotal = round2(unitSell * qty)
      const costTotal = unitCost == null ? null : round2(unitCost * qty)
      const marginEx = costTotal == null ? null : round2(sellTotal / 1.1 - costTotal)
      const marginPct = marginEx == null || sellTotal <= 0 ? null : Math.round((marginEx / (sellTotal / 1.1)) * 1000) / 10
      const bands = SCP_BLANK_ALIGNED_QUANTITY_TIERS.map((t) =>
        priceQuoteJob({ ...spec, quantity: t.minQuantity }, resolveGarment(row, t.minQuantity, tier)).perGarmentSellMajor
      )
      const supaSetup = result.components.find((c) => c.key === "supacolour-setup") ?? null
      return { row, qty, garment, result, perGarment, unitSell, unitCost, sellTotal, costTotal, marginEx, marginPct, bands, supaSetup }
    })

    // Job-level pieces (setups, UV metres) are charged once, not per garment.
    const jobLevel = priceQuoteJob({ ...spec, quantity: jobQty }, null)
    const extras: QuotePriceComponent[] = jobLevel.components.filter((c) => c.kind !== "per_garment")
    const supaSetup = rowResults.find((r) => r.supaSetup)?.supaSetup
    if (supaSetup) extras.push(supaSetup)

    const warnings = Array.from(new Set([...jobLevel.warnings, ...rowResults.flatMap((r) => r.result.warnings)]))
    const rowsSell = round2(rowResults.reduce((s, r) => s + r.sellTotal, 0))
    const extrasSell = round2(extras.reduce((s, c) => s + c.sellTotalMajor, 0))
    const sellTotal = round2(rowsSell + extrasSell)
    const costedRows = rowResults.filter((r) => r.costTotal != null)
    const costedExtras = extras.filter((c) => c.costTotalExMajor != null)
    const costTotal = round2(
      costedRows.reduce((s, r) => s + (r.costTotal ?? 0), 0) + costedExtras.reduce((s, c) => s + (c.costTotalExMajor ?? 0), 0)
    )
    const costedSellEx =
      (costedRows.reduce((s, r) => s + r.sellTotal, 0) + costedExtras.reduce((s, c) => s + c.sellTotalMajor, 0)) / 1.1
    const marginEx = round2(costedSellEx - costTotal)
    const marginPct = costedSellEx > 0 ? Math.round((marginEx / costedSellEx) * 1000) / 10 : null
    const unknownCost = rowResults.length - costedRows.length + (extras.length - costedExtras.length)

    return { jobQty, rowResults, extras, warnings, sellTotal, costTotal, marginEx, marginPct, unknownCost }
  }, [rows, spec, tier])

  const decorationSummary = useMemo(() => {
    const parts: string[] = []
    if (prints.length) parts.push(`${prints.map(sizeLabel).join(" + ")} full-colour print`)
    if (screens.length) parts.push(`${screens.map((s) => `${Number(s.colours) || 1} col${s.dark ? " + underbase" : ""}`).join(" + ")} screen print`)
    if (emb.length) parts.push(`${emb.map((e) => `${Number(e.stitches) || 0} st`).join(" + ")} embroidery`)
    return parts.join("; ")
  }, [prints, screens, emb])

  // --- send to quote ---
  const [newEmail, setNewEmail] = useState("")
  const [sending, setSending] = useState(false)

  const buildLines = (): QuoteLine[] => {
    const lines: QuoteLine[] = []
    for (const r of priced.rowResults) {
      if (r.qty <= 0) continue
      const decoration = r.perGarment.filter((c) => c.key !== "garment").map((c) => c.label).join("; ")
      if (r.garment && r.row.product) {
        const variant = r.row.product.variants.find((v) => v.id === r.row.variantId)
        lines.push({
          title: r.garment.title,
          description: decoration || null,
          quantity: r.qty,
          unit_price: r.unitSell,
          product_id: r.row.product.id,
          variant_id: variant?.id ?? null,
          product_handle: r.row.product.handle,
          thumbnail: r.row.product.thumbnail,
        })
      } else {
        lines.push({
          title: `Decoration on customer-supplied garments${decorationSummary ? ` — ${decorationSummary}` : ""}`,
          description: decoration || null,
          quantity: r.qty,
          unit_price: r.unitSell,
          product_id: null,
          variant_id: null,
          product_handle: null,
          thumbnail: null,
        })
      }
    }
    for (const c of priced.extras) {
      const svc = c.setupProduct ? setups[c.setupProduct] : null
      lines.push({
        title: c.label,
        description: svc ? null : c.kind === "setup" ? "Custom line — add the matching setup product to charge it at checkout." : null,
        quantity: c.quantity,
        unit_price: c.unitSellMajor,
        product_id: svc?.product_id ?? null,
        variant_id: svc?.variant_id ?? null,
        product_handle: svc?.handle ?? null,
        thumbnail: null,
      })
    }
    return lines
  }

  const sendToQuote = async () => {
    const lines = buildLines()
    if (!lines.length) {
      toast.error("Nothing to send — add a garment with a quantity first.")
      return
    }
    setSending(true)
    try {
      if (targetQuote) {
        // The update route replaces line_items wholesale — append to what's there.
        const { quote } = await adminGet<{ quote: { line_items?: { items?: unknown[] } } }>(`/admin/quotes/${targetQuote.id}`)
        const existing = quote.line_items?.items ?? []
        const res = await fetch(`/admin/quotes/${targetQuote.id}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ line_items: [...existing, ...lines] }),
        })
        if (!res.ok) throw new Error(`Save failed (${res.status})`)
        toast.success(`${lines.length} line(s) added to ${targetQuote.public_id}`)
        window.location.assign(`/app/quotes?id=${targetQuote.id}`)
        return
      }
      if (!newEmail.trim()) {
        toast.error("Enter the customer's email to create the quote.")
        return
      }
      const res = await fetch("/admin/quotes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          subject: decorationSummary ? `${priced.jobQty} × ${decorationSummary}` : undefined,
          total_estimate: priced.sellTotal,
          line_items: lines,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message ?? `Create failed (${res.status})`)
      const id = json?.quote?.id ?? json?.id
      toast.success("Quote created")
      window.location.assign(id ? `/app/quotes?id=${id}` : "/app/quotes")
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't send to quote")
    } finally {
      setSending(false)
    }
  }

  const supacolourInPlay = channel === "supacolour" || priced.rowResults.some((r) => r.garment?.supacolour)

  return (
    <Container className="flex flex-col gap-y-5 p-0 divide-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <div>
          <Heading level="h1">Job pricer</Heading>
          <Text size="small" className="text-ui-fg-muted">
            Live sell / cost / margin from the rate cards and the cost model — same numbers as checkout.
            {targetQuote ? ` Lines go to quote ${targetQuote.public_id} (${targetQuote.email}).` : ""}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Label size="xsmall" className="whitespace-nowrap">Garment pricing</Label>
          <Select value={tierSlug} onValueChange={setTierSlug}>
            <Select.Trigger className="w-64"><Select.Value /></Select.Trigger>
            <Select.Content>
              <Select.Item value="standard">Public quantity ladder</Select.Item>
              {TIERS.map((t) => (
                <Select.Item key={t.slug} value={t.slug}>{t.name} (×{t.multiplier.toFixed(2)})</Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      </div>

      {/* ---------------- Decoration ---------------- */}
      <div className="px-6">
        <Heading level="h2" className="text-base mb-2">Decoration (applies to every garment on the job)</Heading>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
            <div className="flex items-center justify-between">
              <Text weight="plus" size="small">Full-colour print</Text>
              <Button size="small" variant="secondary" onClick={() => setPrints((p) => [...p, "up_to_a4"])}><Plus /> Position</Button>
            </div>
            {prints.length ? (
              <Select value={channel} onValueChange={(v) => setChannel(v as PrintChannel | "auto")}>
                <Select.Trigger><Select.Value /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="auto">{PRINT_CHANNEL_LABELS.dtf}</Select.Item>
                  {(Object.keys(PRINT_CHANNEL_LABELS) as PrintChannel[]).filter((k) => k !== "dtf").map((k) => (
                    <Select.Item key={k} value={k}>{PRINT_CHANNEL_LABELS[k]}</Select.Item>
                  ))}
                </Select.Content>
              </Select>
            ) : (
              <Text size="xsmall" className="text-ui-fg-muted">No print positions.</Text>
            )}
            <div className="flex flex-wrap gap-2">
              {prints.map((sizeId, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Select value={sizeId} onValueChange={(v) => setPrints((p) => p.map((s, j) => (j === i ? (v as ScpPrintSizeId) : s)))}>
                    <Select.Trigger className="w-44"><Select.Value /></Select.Trigger>
                    <Select.Content>
                      {SCP_PRINT_SIZE_OPTIONS.map((o) => (
                        <Select.Item key={o.id} value={o.id}>{o.label} · {o.dimensionsLabel}</Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                  <Button size="small" variant="transparent" onClick={() => setPrints((p) => p.filter((_, j) => j !== i))} aria-label="Remove position"><XMark /></Button>
                </div>
              ))}
            </div>
            {prints.length && supacolourInPlay ? (
              <label className="flex items-center gap-2 text-xs"><Checkbox checked={supaRepeat} onCheckedChange={(v) => setSupaRepeat(v === true)} /> Repeat design — Supacolour reset setup ($35 not $69)</label>
            ) : null}
          </div>

          <div className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
            <div className="flex items-center justify-between">
              <Text weight="plus" size="small">Screen print <span className="text-ui-fg-muted font-normal">(min 25, setup per screen)</span></Text>
              <Button size="small" variant="secondary" onClick={() => setScreens((s) => [...s, { colours: "1", dark: false }])}><Plus /> Position</Button>
            </div>
            {screens.length === 0 ? <Text size="xsmall" className="text-ui-fg-muted">No screen positions.</Text> : null}
            {screens.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input size="small" type="number" min={1} max={6} className="w-20" value={s.colours} onChange={(e) => setScreens((all) => all.map((x, j) => (j === i ? { ...x, colours: e.target.value } : x)))} />
                <Text size="xsmall">colours</Text>
                <label className="flex items-center gap-1 text-xs"><Checkbox checked={s.dark} onCheckedChange={(v) => setScreens((all) => all.map((x, j) => (j === i ? { ...x, dark: v === true } : x)))} /> dark garment (+ underbase)</label>
                <Button size="small" variant="transparent" onClick={() => setScreens((all) => all.filter((_, j) => j !== i))} aria-label="Remove position"><XMark /></Button>
              </div>
            ))}
            {screens.length ? (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <Select value={screenHeavy} onValueChange={(v) => setScreenHeavy(v as "auto" | "yes" | "no")}>
                  <Select.Trigger className="w-60"><Select.Value /></Select.Trigger>
                  <Select.Content>
                    <Select.Item value="auto">Heavy garment: from product flag</Select.Item>
                    <Select.Item value="yes">Heavy (hoodie / fleece / poly) +$1</Select.Item>
                    <Select.Item value="no">Standard cotton</Select.Item>
                  </Select.Content>
                </Select>
                <label className="flex items-center gap-1"><Checkbox checked={screenRepeat} onCheckedChange={(v) => setScreenRepeat(v === true)} /> Repeat screens (under 6 months, $39 not $99)</label>
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
            <div className="flex items-center justify-between">
              <Text weight="plus" size="small">Embroidery <span className="text-ui-fg-muted font-normal">(over 12,000 st = by hand)</span></Text>
              <Button size="small" variant="secondary" onClick={() => setEmb((e) => [...e, { stitches: "5000", digitizing: true }])}><Plus /> Placement</Button>
            </div>
            {emb.length === 0 ? <Text size="xsmall" className="text-ui-fg-muted">No embroidery.</Text> : null}
            {emb.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input size="small" type="number" min={1} step={500} className="w-28" value={e.stitches} onChange={(ev) => setEmb((all) => all.map((x, j) => (j === i ? { ...x, stitches: ev.target.value } : x)))} />
                <Text size="xsmall">stitches</Text>
                <label className="flex items-center gap-1 text-xs"><Checkbox checked={e.digitizing} onCheckedChange={(v) => setEmb((all) => all.map((x, j) => (j === i ? { ...x, digitizing: v === true } : x)))} /> new file ($60 digitizing)</label>
                <Button size="small" variant="transparent" onClick={() => setEmb((all) => all.filter((_, j) => j !== i))} aria-label="Remove placement"><XMark /></Button>
              </div>
            ))}
            {emb.length ? (
              <label className="flex items-center gap-1 text-xs"><Checkbox checked={embPromo} onCheckedChange={(v) => setEmbPromo(v === true)} /> Trade card — customer-supplied garments (ex GST + GST)</label>
            ) : null}
          </div>

          <div className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
            <Text weight="plus" size="small">UV DTF gang sheets <span className="text-ui-fg-muted font-normal">(580 mm wide, whole metres)</span></Text>
            <div className="flex flex-wrap items-center gap-3">
              <Input size="small" type="number" min={0} className="w-24" value={uvMetres} onChange={(e) => setUvMetres(e.target.value)} placeholder="0" />
              <Text size="xsmall">lineal metres</Text>
              {Number(uvMetres) > 0 ? (
                <label className="flex items-center gap-1 text-xs"><Checkbox checked={uvReorder} onCheckedChange={(v) => setUvReorder(v === true)} /> Reorder ($25 setup waived)</label>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Garments ---------------- */}
      <div className="px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <Heading level="h2" className="text-base">Garments</Heading>
          <div className="flex items-center gap-2">
            <Button size="small" variant="secondary" onClick={addGarmentRow}><Plus /> Garment</Button>
            <Button size="small" variant="secondary" onClick={addSuppliedRow}><Plus /> Customer-supplied</Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-ui-border-base">
          <table className="w-full text-sm">
            <thead className="bg-ui-bg-subtle text-ui-fg-muted text-xs">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium min-w-[16rem]">Garment</th>
                <th className="px-3 py-2 font-medium min-w-[10rem]">Size / colour</th>
                <th className="px-3 py-2 font-medium w-24">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Garment</th>
                <th className="px-3 py-2 font-medium text-right">Decoration</th>
                <th className="px-3 py-2 font-medium text-right">Unit sell</th>
                <th className="px-3 py-2 font-medium text-right">Unit cost ex</th>
                <th className="px-3 py-2 font-medium text-right">Margin</th>
                <th className="px-3 py-2 font-medium text-right">Line total</th>
                <th className="px-1 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-border-base">
              {priced.rowResults.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-4 text-ui-fg-muted text-xs">Add a garment (or a customer-supplied row) and a quantity.</td></tr>
              ) : null}
              {priced.rowResults.map(({ row, garment, perGarment, unitSell, unitCost, marginEx, marginPct, sellTotal }) => {
                const garmentComp = perGarment.find((c) => c.key === "garment")
                const decorationUnit = round2(perGarment.filter((c) => c.key !== "garment").reduce((s, c) => s + c.unitSellMajor, 0))
                return (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-2">
                      {row.supplied ? (
                        <Badge size="2xsmall" color="grey">Customer-supplied garment</Badge>
                      ) : row.product ? (
                        <div className="flex items-center gap-2">
                          {row.product.thumbnail ? <img src={row.product.thumbnail} alt="" className="w-8 h-8 rounded object-cover bg-ui-bg-subtle" /> : null}
                          <div className="min-w-0">
                            <div className="truncate font-medium">{row.product.title}</div>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {garment?.supacolour ? <Badge size="2xsmall" color="purple">Supacolour</Badge> : null}
                              {garment?.screenHeavy ? <Badge size="2xsmall" color="orange">Heavy</Badge> : null}
                              {garment?.costEstimated ? <Badge size="2xsmall" color="grey" title="No supplier cost stamped — estimated from the 100+ ladder">cost est.</Badge> : null}
                              {garment && garment.unitSellMajor == null ? <Badge size="2xsmall" color="red">no price</Badge> : null}
                            </div>
                          </div>
                          <Button size="small" variant="transparent" onClick={() => patchRow(row.id, { product: null, variantId: null })} aria-label="Change garment"><XMark /></Button>
                        </div>
                      ) : (
                        <GarmentSearch onPick={(p) => void pickProduct(row.id, p)} />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.product ? (
                        <Select value={row.variantId ?? ""} onValueChange={(v) => patchRow(row.id, { variantId: v })}>
                          <Select.Trigger className="w-44"><Select.Value placeholder="Pick a size" /></Select.Trigger>
                          <Select.Content>
                            {row.product.variants.map((v) => (
                              <Select.Item key={v.id} value={v.id}>{v.title ?? v.sku ?? v.id}</Select.Item>
                            ))}
                          </Select.Content>
                        </Select>
                      ) : (
                        <Text size="xsmall" className="text-ui-fg-muted">—</Text>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Input size="small" type="number" min={0} value={row.qty} onChange={(e) => patchRow(row.id, { qty: e.target.value })} placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{garmentComp ? money(garmentComp.unitSellMajor) : "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{money(decorationUnit)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{money(unitSell)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{money(unitCost)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {money(marginEx)}
                      {marginPct != null ? <Badge size="2xsmall" color={marginTone(marginPct)} className="ml-1">{marginPct}%</Badge> : null}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{money(sellTotal)}</td>
                    <td className="px-1 py-2">
                      <Button size="small" variant="transparent" onClick={() => removeRow(row.id)} aria-label="Remove row"><Trash /></Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {priced.rowResults.length ? (
              <tfoot className="bg-ui-bg-subtle text-xs">
                <tr>
                  <td className="px-3 py-2 text-ui-fg-muted" colSpan={2}>Job quantity drives every tier (prints gang, screens are one job, digitizing is shared).</td>
                  <td className="px-3 py-2 font-medium">{priced.jobQty}</td>
                  <td colSpan={7} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      {/* ---------------- Bands + extras + totals ---------------- */}
      <div className="px-6 grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4">
        <div>
          <Heading level="h2" className="text-base mb-2">Per-garment price by quantity band <span className="text-ui-fg-muted font-normal text-sm">(same decoration, if the whole job were that size)</span></Heading>
          <div className="overflow-x-auto rounded-md border border-ui-border-base">
            <table className="w-full text-sm">
              <thead className="bg-ui-bg-subtle text-ui-fg-muted text-xs">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Garment</th>
                  {SCP_BLANK_ALIGNED_QUANTITY_TIERS.map((t) => (
                    <th key={t.label} className="px-3 py-2 font-medium text-right">{t.label.replace("Qty ", "")}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-border-base">
                {priced.rowResults.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-3 text-xs text-ui-fg-muted">Add a garment to see its price at every band.</td></tr>
                ) : null}
                {priced.rowResults.map(({ row, garment, bands }) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 truncate max-w-[18rem]">{garment?.title ?? (row.supplied ? "Customer-supplied garment" : "—")}</td>
                    {bands.map((b, i) => (
                      <td key={i} className="px-3 py-2 text-right whitespace-nowrap">{money(b)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tier ? (
            <Text size="xsmall" className="text-ui-fg-muted mt-1">
              {tier.name}: the garment is a flat cost × {tier.multiplier.toFixed(2)} at every band (falls back to the ladder when the variant has no stamped cost); decoration still tiers by quantity.
            </Text>
          ) : null}
        </div>

        <div className="flex flex-col gap-y-3">
          <div className="rounded-md border border-ui-border-base">
            <div className="px-3 py-2 bg-ui-bg-subtle text-xs text-ui-fg-muted font-medium">Setup fees &amp; extras (charged once per job)</div>
            {priced.extras.length === 0 ? (
              <Text size="xsmall" className="text-ui-fg-muted px-3 py-2">None.</Text>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-ui-border-base">
                  {priced.extras.map((c) => (
                    <tr key={c.key}>
                      <td className="px-3 py-1.5">
                        {c.label}
                        {c.setupProduct && !setups[c.setupProduct] ? <span className="ml-1 text-[11px] text-ui-tag-orange-text">(custom line — setup product not found)</span> : null}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{c.quantity} × {money(c.unitSellMajor)}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {money(c.sellTotalMajor)}
                        {c.marginPct != null ? <Badge size="2xsmall" color={marginTone(c.marginPct)} className="ml-1">{c.marginPct}%</Badge> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-md border border-ui-border-strong p-3 flex flex-col gap-y-1">
            <div className="flex items-baseline justify-between"><Text size="small" className="text-ui-fg-muted">Sell (inc GST)</Text><Text weight="plus" className="text-lg">{money(priced.sellTotal)}</Text></div>
            <div className="flex items-baseline justify-between"><Text size="small" className="text-ui-fg-muted">Cost (ex GST)</Text><Text>{money(priced.costTotal)}</Text></div>
            <div className="flex items-baseline justify-between">
              <Text size="small" className="text-ui-fg-muted">Margin (sell ÷ 1.1 − cost)</Text>
              <span>
                {money(priced.marginEx)}
                {priced.marginPct != null ? <Badge size="2xsmall" color={marginTone(priced.marginPct)} className="ml-1">{priced.marginPct}%</Badge> : null}
              </span>
            </div>
            {priced.unknownCost > 0 ? (
              <Text size="xsmall" className="text-ui-fg-muted">Cost + margin exclude {priced.unknownCost} line(s) with no known cost.</Text>
            ) : null}
          </div>

          {priced.warnings.map((w, i) => (
            <Text key={i} size="xsmall" className="text-ui-tag-orange-text">⚠ {w}</Text>
          ))}

          <div className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
            {targetQuote ? (
              <Button variant="primary" isLoading={sending} onClick={sendToQuote}>
                Add lines to quote {targetQuote.public_id}
              </Button>
            ) : (
              <>
                <Label size="xsmall">Customer email (creates the quote)</Label>
                <div className="flex gap-2">
                  <Input type="email" placeholder="customer@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  <Button variant="primary" isLoading={sending} onClick={sendToQuote} className="whitespace-nowrap">Create quote</Button>
                </div>
                <Text size="xsmall" className="text-ui-fg-muted">Or open an existing quote and click “Price a job” there to add to it.</Text>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="h-2" />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Job pricer",
  icon: tinted(CurrencyDollar, NAV_COLOR.sales),
  rank: 12,
})

export default QuotePricerPage
