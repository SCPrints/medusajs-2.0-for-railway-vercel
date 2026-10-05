import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar, Plus, SquareTwoStack, Trash, XMark } from "@medusajs/icons"
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
import { SIDE_LABELS } from "../../../lib/print-profile"
import {
  priceGroupedJob,
  type JobGroupSpec,
  type JobPositionSpec,
  type JobSpec,
  type PrintChannel,
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
 * Job pricer — the quoting calculator, full page.
 *
 * A job is a list of GROUPS (one garment type × qty × its own decoration
 * positions) sharing a set of DESIGNS (artwork letters). Every number
 * recalculates in the browser on each keystroke via the pure pricer
 * (lib/quote-pricing.ts — sell from the live rate cards, cost from the
 * cost-model constants). Tiers follow how we're billed: prints on the
 * job-wide quantity, screen + embroidery per group, every setup once per
 * design. The job autosaves as a browser draft while building and is saved
 * onto the quote (`metadata.job_pricer`) on send, so "Price a job" from that
 * quote reopens it loaded; re-sending replaces the pricer's lines (ids
 * `jp_…`) and leaves manual lines alone.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ProductLite = { id: string; title: string; handle: string | null; thumbnail: string | null }
type VariantLite = {
  id: string
  title: string | null
  sku: string | null
  metadata: Record<string, unknown> | null
  options?: Array<{ option_id: string; value: string }> | null
}
type ProductDetail = ProductLite & {
  metadata: Record<string, unknown> | null
  variants: VariantLite[]
  options?: Array<{ id: string; title: string }> | null
}

type UiMethod = "print" | "screen" | "embroidery"
type UiPosition = {
  id: string
  side: string
  method: UiMethod
  designId: string
  /** Print card: "auto" = DTF, or Supacolour when the product is flagged. */
  channel: "auto" | PrintChannel
  sizeId: ScpPrintSizeId
  colours: string
  dark: boolean
  stitches: string
  /** Trade embroidery card (customer-supplied garments). */
  promo: boolean
}
type JobDesign = { id: string; label: string; repeat: boolean }
type JobGroup = {
  id: string
  product: ProductLite | null
  supplied: boolean
  colour: string | null
  /** "" = any size (whole-product line; size chosen at order time). */
  size: string
  qty: string
  positions: UiPosition[]
}
/** Persisted on the quote as `metadata.job_pricer.state` and as the browser draft. */
type JobState = {
  version: 1
  tierSlug: string
  designs: JobDesign[]
  groups: JobGroup[]
  uvMetres: string
  uvReorder: boolean
}

type ServiceProduct = { product_id: string; variant_id: string; handle: string | null; title: string }
type SetupKey = NonNullable<QuotePriceComponent["setupProduct"]>
type QuoteLine = {
  id: string
  title: string
  description: string | null
  quantity: number
  unit_price: number
  product_id: string | null
  variant_id: string | null
  product_handle: string | null
  thumbnail: string | null
}

// ---------------------------------------------------------------------------
// Constants + helpers
// ---------------------------------------------------------------------------
const PRODUCT_DETAIL_FIELDS =
  "id,title,handle,thumbnail,metadata,options.id,options.title,variants.id,variants.title,variants.sku,variants.metadata,variants.options.option_id,variants.options.value"

const SIDES: Array<{ key: string; label: string }> = [
  { key: "front", label: SIDE_LABELS.front },
  { key: "back", label: SIDE_LABELS.back },
  { key: "left_chest", label: "Left chest" },
  { key: "right_chest", label: "Right chest" },
  { key: "left_sleeve", label: SIDE_LABELS.left_sleeve },
  { key: "right_sleeve", label: SIDE_LABELS.right_sleeve },
  { key: "nape", label: "Nape / yoke" },
  { key: "hood", label: "Hood" },
  { key: "side", label: "Side panel" },
  { key: "printed_tag", label: SIDE_LABELS.printed_tag },
  { key: "other", label: "Other" },
]
const sideLabel = (key: string) => SIDES.find((s) => s.key === key)?.label ?? key

const METHOD_LABELS: Record<UiMethod, string> = { print: "Full-colour print", screen: "Screen print", embroidery: "Embroidery" }
const CHANNEL_LABELS: Record<"auto" | PrintChannel, string> = {
  auto: "Auto (DTF; Supacolour on poly)",
  dtf: "DTF",
  supacolour: "Supacolour",
  byo: "BYO — retail + handling",
  promo: "Trade card (ex GST + GST)",
  press_only: "Press only",
}
const OUR_CHANNELS: Array<"auto" | PrintChannel> = ["auto", "dtf", "supacolour"]
const SUPPLIED_CHANNELS: Array<"auto" | PrintChannel> = ["byo", "promo", "press_only"]

const SETUP_HANDLES: Record<Exclude<SetupKey, "embroidery_setup">, string> = {
  screen_setup: "screen-printing-setup-fee",
  supacolour_setup: "supacolour-transfer-setup-fee",
}

const genId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const money = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)
const round2 = (n: number) => Math.round(n * 100) / 100
const marginTone = (pct: number | null): "grey" | "red" | "orange" | "green" =>
  pct == null ? "grey" : pct < 15 ? "red" : pct < 35 ? "orange" : "green"
const sizeOptLabel = (id: ScpPrintSizeId) => SCP_PRINT_SIZE_OPTIONS.find((o) => o.id === id)?.label ?? id
const nextDesignLabel = (designs: JobDesign[]) => {
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(65 + i)
    if (!designs.some((d) => d.label === l)) return l
  }
  return `D${designs.length + 1}`
}

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" })
  if (!res.ok) throw new Error(`${path.split("?")[0]} failed (${res.status})`)
  return (await res.json()) as T
}
async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as any)?.error ?? (json as any)?.message ?? `${path.split("?")[0]} failed (${res.status})`)
  return json as T
}

/** Product detail by id, falling back to the (stable) handle — the search index can lag a re-import. */
async function fetchProductDetail(p: ProductLite): Promise<ProductDetail> {
  try {
    return (await adminGet<{ product: ProductDetail }>(`/admin/products/${p.id}?fields=${PRODUCT_DETAIL_FIELDS}`)).product
  } catch {
    if (!p.handle) throw new Error(`${p.title}: product not found`)
    const found = (await adminGet<{ products: ProductDetail[] }>(`/admin/products?handle=${encodeURIComponent(p.handle)}&limit=1&fields=${PRODUCT_DETAIL_FIELDS}`)).products?.[0]
    if (!found) throw new Error(`${p.title}: product not found`)
    return found
  }
}

/** Conventional garment size order; unknown tokens sort after, alphabetically. */
const SIZE_ORDER = ["2XS", "XXS", "XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL", "5XL", "6XL", "7XL"]
const sizeRank = (s: string) => {
  const i = SIZE_ORDER.indexOf(s.trim().toUpperCase())
  if (i >= 0) return i
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? 100 + n : 1000
}
const sortSizes = (sizes: string[]) => sizes.slice().sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b))

/**
 * A product's colour + size axes. Prefers the real product options (Colour /
 * Size by title, else first/second option); falls back to splitting the
 * variant title on " / " (every importer writes "COLOUR / SIZE").
 */
function variantAxes(product: ProductDetail) {
  const opts = product.options ?? []
  const hasVariantOptions = product.variants.some((v) => (v.options?.length ?? 0) > 0)
  const colourOpt = hasVariantOptions ? opts.find((o) => /colou?r/i.test(o.title)) ?? (opts.length >= 2 ? opts[0] : null) : null
  const sizeOpt = hasVariantOptions
    ? opts.find((o) => /size/i.test(o.title)) ?? (opts.length >= 2 ? opts[1] : opts.length === 1 && !colourOpt ? opts[0] : null)
    : null
  const valueOf = (v: VariantLite, axis: "colour" | "size"): string | null => {
    if (hasVariantOptions) {
      const opt = axis === "colour" ? colourOpt : sizeOpt
      return opt ? v.options?.find((o) => o.option_id === opt.id)?.value ?? null : null
    }
    const parts = (v.title ?? "").split(" / ")
    if (parts.length >= 2) return axis === "colour" ? parts[0] : parts.slice(1).join(" / ")
    return axis === "size" ? parts[0] || null : null
  }
  const uniq = (axis: "colour" | "size", pool: VariantLite[]) =>
    Array.from(new Set(pool.map((v) => valueOf(v, axis)).filter((x): x is string => Boolean(x))))
  const colours = uniq("colour", product.variants)
  const sizesFor = (colour: string | null) => sortSizes(uniq("size", product.variants.filter((v) => !colour || valueOf(v, "colour") === colour)))
  return { colours, sizesFor, valueOf }
}

function resolveGroupVariant(group: JobGroup, detail: ProductDetail | undefined): VariantLite | null {
  if (!detail) return null
  const { valueOf } = variantAxes(detail)
  return (
    detail.variants.find(
      (v) => (group.colour == null || valueOf(v, "colour") === group.colour) && (!group.size || valueOf(v, "size") === group.size)
    ) ?? null
  )
}

function resolveGarment(group: JobGroup, detail: ProductDetail | undefined, quantity: number, tier: Tier | null): ResolvedGarment | null {
  if (group.supplied || !group.product || !detail) return null
  const variant = resolveGroupVariant(group, detail)
  if (!variant) return null
  const cost = garmentCostExMajor(variant.metadata)
  const productMeta = detail.metadata ?? {}
  const label = group.size ? variant.title : group.colour ? `${group.colour} (any size)` : "any size"
  return {
    title: `${detail.title}${label ? ` — ${label}` : ""}`,
    unitSellMajor: garmentMajorWithTier(variant.metadata, quantity, tier),
    unitCostExMajor: cost.costExMajor,
    costEstimated: cost.estimated,
    supacolour: parseDecorationPricingClass(productMeta.decoration_pricing_class) === "supacolour",
    screenHeavy: productMeta.screen_heavy === true,
  }
}

const toPositionSpec = (p: UiPosition, supplied: boolean): JobPositionSpec => {
  if (p.method === "screen") return { method: "screen", colours: Math.min(6, Math.max(1, Number(p.colours) || 1)), darkGarment: p.dark, designId: p.designId }
  if (p.method === "embroidery") return { method: "embroidery", stitchCount: Number(p.stitches) || 0, promo: supplied && p.promo, designId: p.designId }
  const channel: PrintChannel | undefined = p.channel === "auto" ? (supplied ? "byo" : undefined) : p.channel
  return { method: "print", channel, sizeId: p.sizeId, designId: p.designId }
}

const positionSummary = (p: UiPosition, designs: JobDesign[]) => {
  const d = designs.find((x) => x.id === p.designId)?.label ?? "?"
  const body =
    p.method === "screen"
      ? `Screen print ${Number(p.colours) || 1} col${p.dark ? " + underbase" : ""}`
      : p.method === "embroidery"
        ? `Embroidery ${Number(p.stitches) || 0} st`
        : `${p.channel === "auto" ? "Full-colour print" : CHANNEL_LABELS[p.channel].split(" ")[0]} ${sizeOptLabel(p.sizeId)}`
  return `${sideLabel(p.side)}: ${body} (design ${d})`
}

const newPosition = (group: JobGroup, designId: string): UiPosition => ({
  id: genId("pos"),
  side: group.positions.length === 0 ? "front" : group.positions.length === 1 ? "back" : "left_sleeve",
  method: "print",
  designId,
  channel: "auto",
  sizeId: "up_to_a4",
  colours: "1",
  dark: false,
  stitches: "5000",
  promo: false,
})

const emptyState = (): JobState => ({ version: 1, tierSlug: "standard", designs: [{ id: genId("d"), label: "A", repeat: false }], groups: [], uvMetres: "", uvReorder: false })

// ---------------------------------------------------------------------------
// Garment search (Meili-ranked; list is position:fixed so the card can't clip it)
// ---------------------------------------------------------------------------
function GarmentSearch({ onPick }: { onPick: (p: ProductLite) => void }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<ProductLite[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const seq = useRef(0)
  const place = () => {
    const r = inputRef.current?.getBoundingClientRect()
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 420) })
  }
  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      return
    }
    const mine = ++seq.current
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const json = await adminGet<{ products: ProductLite[] }>(`/admin/quote-pricer/search?q=${encodeURIComponent(q.trim())}&limit=12`)
        if (mine === seq.current) setResults(json.products ?? [])
      } catch {
        /* keep last results */
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, 150)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="flex-1 min-w-[16rem]">
      <Input
        ref={inputRef}
        size="small"
        placeholder="Search garment (name, SKU, handle)…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          place()
        }}
        onFocus={() => {
          setOpen(true)
          place()
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && rect && (results.length > 0 || loading) ? (
        <ul style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }} className="z-50 max-h-80 overflow-y-auto rounded-md border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout divide-y divide-ui-border-base">
          {loading && results.length === 0 ? <li className="px-3 py-2 text-xs text-ui-fg-muted">Searching…</li> : null}
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-ui-bg-subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(p); setQ(""); setResults([]); setOpen(false) }}>
                {p.thumbnail ? <img src={p.thumbnail} alt="" className="w-7 h-7 rounded object-cover bg-ui-bg-subtle" /> : <div className="w-7 h-7 rounded bg-ui-bg-subtle" />}
                <span className="truncate">{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function QuotePricerPage() {
  const targetQuoteId = useMemo(() => new URLSearchParams(window.location.search).get("quote"), [])
  const draftKey = `scp:job-pricer:${targetQuoteId ?? "new"}`
  const [targetQuote, setTargetQuote] = useState<{ id: string; public_id: string; email: string; customer_id: string | null } | null>(null)
  const [state, setState] = useState<JobState>(emptyState)
  const [details, setDetails] = useState<Record<string, ProductDetail>>({})
  const [hydrated, setHydrated] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const [setups, setSetups] = useState<Record<SetupKey, ServiceProduct | null>>({ screen_setup: null, supacolour_setup: null, embroidery_setup: null })
  const [newEmail, setNewEmail] = useState("")
  const [sending, setSending] = useState(false)

  const tier = useMemo(() => getTierBySlug(state.tierSlug), [state.tierSlug])
  const patch = (p: Partial<JobState>) => setState((s) => ({ ...s, ...p }))

  // --- product detail cache (never persisted; re-fetched on load) ---
  const ensureDetail = useCallback(async (p: ProductLite) => {
    try {
      const detail = await fetchProductDetail(p)
      const full = { ...detail, variants: detail.variants ?? [] }
      // Key by both the requested id and the resolved id — the handle fallback
      // can return a different id than the search index handed us.
      setDetails((d) => ({ ...d, [p.id]: full, [detail.id]: full }))
      return full
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't load the product")
      return null
    }
  }, [])

  // --- boot: setup products, target quote (+ saved job or browser draft) ---
  useEffect(() => {
    void (async () => {
      try {
        const handles = Object.values(SETUP_HANDLES).map((h) => `handle[]=${encodeURIComponent(h)}`).join("&")
        const [byHandle, byTitle] = await Promise.all([
          adminGet<{ products: Array<ProductLite & { variants: Array<{ id: string }> }> }>(`/admin/products?${handles}&fields=id,handle,title,variants.id`),
          adminGet<{ products: Array<ProductLite & { variants: Array<{ id: string }> }> }>(`/admin/products?q=setup&limit=20&fields=id,handle,title,variants.id`),
        ])
        const toService = (p?: ProductLite & { variants: Array<{ id: string }> }): ServiceProduct | null =>
          p?.variants?.[0]?.id ? { product_id: p.id, variant_id: p.variants[0].id, handle: p.handle, title: p.title } : null
        const next: Record<SetupKey, ServiceProduct | null> = { screen_setup: null, supacolour_setup: null, embroidery_setup: null }
        for (const p of byHandle.products ?? []) {
          if (p.handle === SETUP_HANDLES.screen_setup) next.screen_setup = toService(p)
          if (p.handle === SETUP_HANDLES.supacolour_setup) next.supacolour_setup = toService(p)
        }
        next.embroidery_setup = toService((byTitle.products ?? []).find((p) => /embroidery.*setup|setup.*embroidery|digitiz/i.test(p.title ?? "")))
        setSetups(next)
      } catch {
        /* unresolved setups become custom lines */
      }
    })()

    void (async () => {
      let loaded: JobState | null = null
      if (targetQuoteId) {
        try {
          const { quote } = await adminGet<{ quote: { id: string; public_id: string; email: string; customer_id: string | null; metadata?: Record<string, any> | null } }>(`/admin/quotes/${targetQuoteId}`)
          setTargetQuote({ id: quote.id, public_id: quote.public_id, email: quote.email, customer_id: quote.customer_id })
          const saved = quote.metadata?.job_pricer?.state as JobState | undefined
          if (saved?.version === 1) loaded = saved
          else if (quote.customer_id) {
            const { customer } = await adminGet<{ customer: { groups?: Array<{ id: string; name: string; metadata: Record<string, unknown> | null }> } }>(
              `/admin/customers/${quote.customer_id}?fields=%2Bgroups.id,%2Bgroups.name,%2Bgroups.metadata`
            )
            const t = tierForCustomer({ groups: customer.groups ?? [] })
            if (t) setState((s) => ({ ...s, tierSlug: t.slug }))
          }
        } catch (err: any) {
          toast.error(err?.message ?? "Couldn't load the quote")
        }
      }
      if (!loaded) {
        try {
          const raw = localStorage.getItem(draftKey)
          const draft = raw ? (JSON.parse(raw) as JobState) : null
          if (draft?.version === 1 && (draft.groups.length || draft.uvMetres)) {
            loaded = draft
            setDraftRestored(true)
          }
        } catch {
          /* no draft */
        }
      }
      if (loaded) {
        setState(loaded)
        await Promise.all(loaded.groups.filter((g) => g.product).map((g) => ensureDetail(g.product!)))
      }
      setHydrated(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetQuoteId])

  // --- browser draft autosave ---
  useEffect(() => {
    if (!hydrated) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(state))
      } catch {
        /* storage unavailable */
      }
    }, 300)
    return () => clearTimeout(t)
  }, [state, hydrated, draftKey])

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey)
    } catch {
      /* ignore */
    }
  }

  // --- designs ---
  const addDesign = () => {
    const d: JobDesign = { id: genId("d"), label: nextDesignLabel(state.designs), repeat: false }
    patch({ designs: [...state.designs, d] })
    return d
  }
  const patchDesign = (id: string, p: Partial<JobDesign>) => patch({ designs: state.designs.map((d) => (d.id === id ? { ...d, ...p } : d)) })
  const removeDesign = (id: string) => {
    if (state.designs.length <= 1) return
    const fallback = state.designs.find((d) => d.id !== id)!.id
    patch({
      designs: state.designs.filter((d) => d.id !== id),
      groups: state.groups.map((g) => ({ ...g, positions: g.positions.map((p) => (p.designId === id ? { ...p, designId: fallback } : p)) })),
    })
  }

  // --- groups ---
  const patchGroup = (id: string, p: Partial<JobGroup>) => patch({ groups: state.groups.map((g) => (g.id === id ? { ...g, ...p } : g)) })
  const addGroup = (supplied: boolean) => {
    const g: JobGroup = { id: genId("g"), product: null, supplied, colour: null, size: "", qty: "", positions: [] }
    patch({ groups: [...state.groups, g] })
  }
  const duplicateGroup = (id: string) => {
    const src = state.groups.find((g) => g.id === id)
    if (!src) return
    const copy: JobGroup = { ...src, id: genId("g"), positions: src.positions.map((p) => ({ ...p, id: genId("pos") })) }
    const idx = state.groups.findIndex((g) => g.id === id)
    patch({ groups: [...state.groups.slice(0, idx + 1), copy, ...state.groups.slice(idx + 1)] })
  }
  const removeGroup = (id: string) => patch({ groups: state.groups.filter((g) => g.id !== id) })
  const pickProduct = async (groupId: string, p: ProductLite) => {
    const detail = await ensureDetail(p)
    if (!detail) return
    const { colours } = variantAxes({ ...detail, variants: detail.variants ?? [] })
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, product: { id: detail.id, title: detail.title, handle: detail.handle, thumbnail: detail.thumbnail }, supplied: false, colour: colours[0] ?? null, size: "" } : g)),
    }))
  }

  // --- positions ---
  // Safe default: each new position in a group is a NEW design (front + back
  // are usually different artwork; an unneeded setup is a refund, a missed
  // one is a silent loss). Duplicating a group keeps the letters.
  const addPosition = (groupId: string) => {
    const group = state.groups.find((g) => g.id === groupId)
    if (!group) return
    let designs = state.designs
    let designId = designs[0]?.id
    if (group.positions.length > 0) {
      const used = new Set(group.positions.map((p) => p.designId))
      const free = designs.find((d) => !used.has(d.id))
      if (free) designId = free.id
      else {
        const d: JobDesign = { id: genId("d"), label: nextDesignLabel(designs), repeat: false }
        designs = [...designs, d]
        designId = d.id
      }
    }
    setState((s) => ({
      ...s,
      designs,
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, positions: [...g.positions, newPosition(g, designId!)] } : g)),
    }))
  }
  const patchPosition = (groupId: string, posId: string, p: Partial<UiPosition>) =>
    patch({ groups: state.groups.map((g) => (g.id === groupId ? { ...g, positions: g.positions.map((x) => (x.id === posId ? { ...x, ...p } : x)) } : g)) })
  const removePosition = (groupId: string, posId: string) =>
    patch({ groups: state.groups.map((g) => (g.id === groupId ? { ...g, positions: g.positions.filter((x) => x.id !== posId) } : g)) })

  // --- pricing (pure, synchronous) ---
  const buildJob = useCallback(
    (overrideQty?: { groupId: string; quantity: number }): JobSpec => ({
      designs: state.designs.map((d) => ({ id: d.id, label: d.label, repeat: d.repeat })),
      groups: state.groups.map((g): JobGroupSpec => {
        const quantity = overrideQty?.groupId === g.id ? overrideQty.quantity : Math.max(0, Math.floor(Number(g.qty) || 0))
        return {
          id: g.id,
          quantity,
          garment: resolveGarment(g, g.product ? details[g.product.id] : undefined, Math.max(1, quantity), tier),
          positions: g.positions.map((p) => toPositionSpec(p, g.supplied)),
        }
      }),
      uvdtf: Number(state.uvMetres) > 0 ? { metres: Number(state.uvMetres), reorder: state.uvReorder } : undefined,
    }),
    [state, details, tier]
  )
  const priced = useMemo(() => priceGroupedJob(buildJob()), [buildJob])
  const bands = useMemo(
    () =>
      Object.fromEntries(
        state.groups.map((g) => [
          g.id,
          SCP_BLANK_ALIGNED_QUANTITY_TIERS.map((t) => priceGroupedJob(buildJob({ groupId: g.id, quantity: t.minQuantity })).groups.find((x) => x.groupId === g.id)?.unitSellMajor ?? 0),
        ])
      ) as Record<string, number[]>,
    [state.groups, buildJob]
  )

  const jobSummary = useMemo(() => {
    const parts = state.groups
      .filter((g) => Number(g.qty) > 0)
      .map((g) => {
        const name = g.supplied ? "supplied garments" : g.product?.title ?? "garment"
        const methods = Array.from(new Set(g.positions.map((p) => (p.method === "print" ? "print" : p.method)))).join("+")
        return `${Number(g.qty)} × ${name}${methods ? ` (${methods})` : ""}`
      })
    if (Number(state.uvMetres) > 0) parts.push(`${Number(state.uvMetres)} m UV DTF`)
    return parts.join(", ")
  }, [state])

  // --- send to quote ---
  const buildLines = (): QuoteLine[] => {
    const lines: QuoteLine[] = []
    for (const gp of priced.groups) {
      if (gp.quantity <= 0) continue
      const g = state.groups.find((x) => x.id === gp.groupId)!
      const detail = g.product ? details[g.product.id] : undefined
      const garment = gp.components.find((c) => c.key === "garment")
      const description = g.positions.map((p) => positionSummary(p, state.designs)).join(" · ") || null
      const variant = g.size ? resolveGroupVariant(g, detail) : null
      lines.push({
        id: `jp_g_${g.id}`,
        title: garment ? garment.label : `Customer-supplied garments — decoration only`,
        description,
        quantity: gp.quantity,
        unit_price: gp.unitSellMajor,
        product_id: g.supplied ? null : g.product?.id ?? null,
        variant_id: g.supplied ? null : variant?.id ?? null,
        product_handle: g.supplied ? null : g.product?.handle ?? null,
        thumbnail: g.supplied ? null : g.product?.thumbnail ?? null,
      })
    }
    for (const c of priced.extras) {
      const svc = c.setupProduct ? setups[c.setupProduct] : null
      lines.push({
        id: `jp_x_${c.key}`,
        title: c.label,
        description: c.notes?.[0] ?? (svc ? null : c.kind === "setup" ? "Custom line — add the matching setup product to charge it at checkout." : null),
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
    const jobPricer = { version: 1, saved_at: new Date().toISOString(), summary: jobSummary, totals: priced.totals, state }
    setSending(true)
    try {
      if (targetQuote) {
        // The update route REPLACES metadata and line_items wholesale: merge
        // metadata, and swap only the pricer's own lines (ids `jp_…`).
        const { quote } = await adminGet<{ quote: { line_items?: { items?: Array<{ id?: string }> }; metadata?: Record<string, unknown> | null } }>(`/admin/quotes/${targetQuote.id}`)
        const manual = (quote.line_items?.items ?? []).filter((li) => !String(li.id ?? "").startsWith("jp_"))
        await adminPost(`/admin/quotes/${targetQuote.id}`, {
          line_items: [...manual, ...lines],
          metadata: { ...(quote.metadata ?? {}), job_pricer: jobPricer },
          total_estimate: priced.totals.sellIncMajor,
        })
        clearDraft()
        toast.success(`${lines.length} line(s) written to ${targetQuote.public_id}`)
        window.location.assign(`/app/quotes?id=${targetQuote.id}`)
        return
      }
      if (!newEmail.trim()) {
        toast.error("Enter the customer's email to create the quote.")
        return
      }
      const json = await adminPost<{ quote?: { id?: string }; id?: string }>("/admin/quotes", {
        email: newEmail.trim(),
        subject: jobSummary || undefined,
        total_estimate: priced.totals.sellIncMajor,
        line_items: lines,
        metadata: { job_pricer: jobPricer },
      })
      clearDraft()
      const id = json?.quote?.id ?? json?.id
      toast.success("Quote created")
      window.location.assign(id ? `/app/quotes?id=${id}` : "/app/quotes")
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't send to quote")
    } finally {
      setSending(false)
    }
  }

  const resetJob = () => {
    clearDraft()
    setState(emptyState())
    setDraftRestored(false)
  }

  // ---------------------------------------------------------------------------
  return (
    <Container className="flex flex-col gap-y-5 p-0 divide-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <div>
          <Heading level="h1">Job pricer</Heading>
          <Text size="small" className="text-ui-fg-muted">
            Live sell / cost / margin from the rate cards and the cost model — same numbers as checkout.
            {targetQuote ? ` Lines go to quote ${targetQuote.public_id} (${targetQuote.email}).` : ""}
          </Text>
          {draftRestored ? (
            <Text size="xsmall" className="text-ui-fg-muted">
              Restored your unsent draft. <button type="button" className="underline" onClick={resetJob}>Start fresh</button>
            </Text>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Label size="xsmall" className="whitespace-nowrap">Garment pricing</Label>
          <Select value={state.tierSlug} onValueChange={(v) => patch({ tierSlug: v })}>
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

      {/* ---------------- Designs + UV strip ---------------- */}
      <div className="px-6 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        <div className="rounded-md border border-ui-border-base p-3">
          <div className="flex items-center justify-between mb-2">
            <Text weight="plus" size="small">Designs <span className="text-ui-fg-muted font-normal">— one letter per artwork; setups are charged once per design, shared across garments</span></Text>
            <Button size="small" variant="secondary" onClick={() => addDesign()}><Plus /> Design</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.designs.map((d) => {
              const uses = state.groups.reduce((n, g) => n + g.positions.filter((p) => p.designId === d.id).length, 0)
              return (
                <div key={d.id} className="flex items-center gap-2 rounded-md border border-ui-border-base px-2 py-1 text-xs">
                  <Badge size="2xsmall" color="blue">{d.label}</Badge>
                  <span className="text-ui-fg-muted">{uses} position{uses === 1 ? "" : "s"}</span>
                  <label className="flex items-center gap-1"><Checkbox checked={d.repeat} onCheckedChange={(v) => patchDesign(d.id, { repeat: v === true })} /> repeat (≤6 mo: screens $39, transfer $35, no digitizing)</label>
                  {state.designs.length > 1 ? <button type="button" className="text-ui-fg-muted hover:text-ui-fg-base" onClick={() => removeDesign(d.id)} aria-label={`Remove design ${d.label}`}><XMark /></button> : null}
                </div>
              )
            })}
          </div>
        </div>
        <div className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
          <Text weight="plus" size="small">UV DTF gang sheets <span className="text-ui-fg-muted font-normal">(580 mm wide, whole metres — job-level)</span></Text>
          <div className="flex flex-wrap items-center gap-3">
            <Input size="small" type="number" min={0} className="w-24" value={state.uvMetres} onChange={(e) => patch({ uvMetres: e.target.value })} placeholder="0" />
            <Text size="xsmall">lineal metres</Text>
            {Number(state.uvMetres) > 0 ? <label className="flex items-center gap-1 text-xs"><Checkbox checked={state.uvReorder} onCheckedChange={(v) => patch({ uvReorder: v === true })} /> Reorder ($25 setup waived)</label> : null}
          </div>
        </div>
      </div>

      {/* ---------------- Groups ---------------- */}
      <div className="px-6 flex flex-col gap-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading level="h2" className="text-base">Garment groups <span className="text-ui-fg-muted font-normal text-sm">— one per garment type; each has its own decoration</span></Heading>
          <div className="flex items-center gap-2">
            <Button size="small" variant="secondary" onClick={() => addGroup(false)}><Plus /> Garment</Button>
            <Button size="small" variant="secondary" onClick={() => addGroup(true)}><Plus /> Customer-supplied</Button>
          </div>
        </div>
        {state.groups.length === 0 ? (
          <Text size="xsmall" className="text-ui-fg-muted">Add a garment (or a customer-supplied group), set its quantity, then add its print / embroidery positions.</Text>
        ) : null}
        {state.groups.map((g, gi) => {
          const gp = priced.groups.find((x) => x.groupId === g.id)
          const detail = g.product ? details[g.product.id] : undefined
          const garment = gp?.components.find((c) => c.key === "garment")
          const decorationUnit = round2((gp?.components ?? []).filter((c) => c.key !== "garment").reduce((s, c) => s + c.unitSellMajor, 0))
          const axes = detail ? variantAxes(detail) : null
          const sizes = axes ? axes.sizesFor(g.colour) : []
          const resolved = resolveGarment(g, detail, 1, tier)
          const channels = g.supplied ? SUPPLIED_CHANNELS : OUR_CHANNELS
          return (
            <div key={g.id} className="rounded-md border border-ui-border-base">
              {/* header */}
              <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-ui-bg-subtle">
                <Text size="xsmall" className="text-ui-fg-muted w-6">#{gi + 1}</Text>
                {g.supplied ? (
                  <Badge size="2xsmall" color="grey">Customer-supplied garment</Badge>
                ) : g.product ? (
                  <div className="flex items-center gap-2 min-w-0">
                    {g.product.thumbnail ? <img src={g.product.thumbnail} alt="" className="w-8 h-8 rounded object-cover bg-ui-bg-base" /> : null}
                    <span className="font-medium truncate max-w-[18rem]">{g.product.title}</span>
                    {resolved?.supacolour ? <Badge size="2xsmall" color="purple">Supacolour</Badge> : null}
                    {resolved?.screenHeavy ? <Badge size="2xsmall" color="orange">Heavy</Badge> : null}
                    {resolved?.costEstimated ? <Badge size="2xsmall" color="grey" title="No supplier cost stamped — estimated from the 100+ ladder">cost est.</Badge> : null}
                    {!detail ? <Badge size="2xsmall" color="grey">loading…</Badge> : null}
                    <Button size="small" variant="transparent" onClick={() => patchGroup(g.id, { product: null, colour: null, size: "" })} aria-label="Change garment"><XMark /></Button>
                  </div>
                ) : (
                  <GarmentSearch onPick={(p) => void pickProduct(g.id, p)} />
                )}
                {axes ? (
                  <div className="flex items-center gap-1">
                    {axes.colours.length ? (
                      <Select value={g.colour ?? ""} onValueChange={(v) => patchGroup(g.id, { colour: v, size: "" })}>
                        <Select.Trigger className="w-40"><Select.Value placeholder="Colour" /></Select.Trigger>
                        <Select.Content>{axes.colours.map((c) => <Select.Item key={c} value={c}>{c}</Select.Item>)}</Select.Content>
                      </Select>
                    ) : null}
                    {sizes.length ? (
                      <Select value={g.size || "__any"} onValueChange={(v) => patchGroup(g.id, { size: v === "__any" ? "" : v })}>
                        <Select.Trigger className="w-28"><Select.Value /></Select.Trigger>
                        <Select.Content>
                          <Select.Item value="__any">Any size</Select.Item>
                          {sizes.map((s) => <Select.Item key={s} value={s}>{s}</Select.Item>)}
                        </Select.Content>
                      </Select>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex items-center gap-1">
                  <Label size="xsmall">Qty</Label>
                  <Input size="small" type="number" min={0} className="w-20" value={g.qty} onChange={(e) => patchGroup(g.id, { qty: e.target.value })} placeholder="0" />
                </div>
                <div className="ml-auto flex items-center gap-3 text-xs whitespace-nowrap">
                  <span className="text-ui-fg-muted">garment {money(garment?.unitSellMajor ?? 0)} + deco {money(decorationUnit)} =</span>
                  <span className="font-medium text-sm">{money(gp?.unitSellMajor ?? 0)}/unit</span>
                  <span className="text-ui-fg-muted">cost {money(gp?.unitCostExMajor)}</span>
                  {gp?.marginPct != null ? <Badge size="2xsmall" color={marginTone(gp.marginPct)}>{gp.marginPct}%</Badge> : null}
                  <span className="font-medium">{money(gp?.sellTotalMajor ?? 0)}</span>
                  <Button size="small" variant="transparent" onClick={() => duplicateGroup(g.id)} title="Duplicate group (same decoration + designs)" aria-label="Duplicate group"><SquareTwoStack /></Button>
                  <Button size="small" variant="transparent" onClick={() => removeGroup(g.id)} aria-label="Remove group"><Trash /></Button>
                </div>
              </div>
              {/* positions */}
              <div className="px-3 py-2 flex flex-col gap-y-1.5">
                {g.positions.length === 0 ? <Text size="xsmall" className="text-ui-fg-muted">No decoration yet — blank garment.</Text> : null}
                {g.positions.map((p) => {
                  const comp = gp?.components.find((c) => c.key === `pos-${g.positions.indexOf(p)}`)
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-2">
                      <Select value={p.side} onValueChange={(v) => patchPosition(g.id, p.id, { side: v })}>
                        <Select.Trigger className="w-36"><Select.Value /></Select.Trigger>
                        <Select.Content>{SIDES.map((s) => <Select.Item key={s.key} value={s.key}>{s.label}</Select.Item>)}</Select.Content>
                      </Select>
                      <Select value={p.method} onValueChange={(v) => patchPosition(g.id, p.id, { method: v as UiMethod })}>
                        <Select.Trigger className="w-40"><Select.Value /></Select.Trigger>
                        <Select.Content>{(Object.keys(METHOD_LABELS) as UiMethod[]).map((m) => <Select.Item key={m} value={m}>{METHOD_LABELS[m]}</Select.Item>)}</Select.Content>
                      </Select>
                      {p.method === "print" ? (
                        <>
                          <Select value={p.sizeId} onValueChange={(v) => patchPosition(g.id, p.id, { sizeId: v as ScpPrintSizeId })}>
                            <Select.Trigger className="w-40"><Select.Value /></Select.Trigger>
                            <Select.Content>{SCP_PRINT_SIZE_OPTIONS.map((o) => <Select.Item key={o.id} value={o.id}>{o.label} · {o.dimensionsLabel}</Select.Item>)}</Select.Content>
                          </Select>
                          <Select value={g.supplied && p.channel === "auto" ? "byo" : p.channel} onValueChange={(v) => patchPosition(g.id, p.id, { channel: v as "auto" | PrintChannel })}>
                            <Select.Trigger className="w-52"><Select.Value /></Select.Trigger>
                            <Select.Content>{channels.map((c) => <Select.Item key={c} value={c}>{CHANNEL_LABELS[c]}</Select.Item>)}</Select.Content>
                          </Select>
                        </>
                      ) : p.method === "screen" ? (
                        <>
                          <Input size="small" type="number" min={1} max={6} className="w-16" value={p.colours} onChange={(e) => patchPosition(g.id, p.id, { colours: e.target.value })} />
                          <Text size="xsmall">colours</Text>
                          <label className="flex items-center gap-1 text-xs"><Checkbox checked={p.dark} onCheckedChange={(v) => patchPosition(g.id, p.id, { dark: v === true })} /> dark garment (+ underbase)</label>
                        </>
                      ) : (
                        <>
                          <Input size="small" type="number" min={1} step={500} className="w-24" value={p.stitches} onChange={(e) => patchPosition(g.id, p.id, { stitches: e.target.value })} />
                          <Text size="xsmall">stitches</Text>
                          {g.supplied ? <label className="flex items-center gap-1 text-xs"><Checkbox checked={p.promo} onCheckedChange={(v) => patchPosition(g.id, p.id, { promo: v === true })} /> trade card</label> : null}
                        </>
                      )}
                      <Select
                        value={p.designId}
                        onValueChange={(v) => {
                          if (v === "__new") {
                            const d = addDesign()
                            patchPosition(g.id, p.id, { designId: d.id })
                          } else patchPosition(g.id, p.id, { designId: v })
                        }}
                      >
                        <Select.Trigger className="w-32"><Select.Value /></Select.Trigger>
                        <Select.Content>
                          {state.designs.map((d) => <Select.Item key={d.id} value={d.id}>design {d.label}</Select.Item>)}
                          <Select.Item value="__new">+ new design</Select.Item>
                        </Select.Content>
                      </Select>
                      <span className="text-xs whitespace-nowrap ml-auto">
                        {comp ? money(comp.unitSellMajor) : "—"}
                        {comp?.requiresQuote ? <Badge size="2xsmall" color="orange" className="ml-1">by hand</Badge> : null}
                      </span>
                      <Button size="small" variant="transparent" onClick={() => removePosition(g.id, p.id)} aria-label="Remove position"><XMark /></Button>
                    </div>
                  )
                })}
                <div>
                  <Button size="small" variant="transparent" onClick={() => addPosition(g.id)}><Plus /> Position</Button>
                </div>
              </div>
            </div>
          )
        })}
        {state.groups.length ? (
          <Text size="xsmall" className="text-ui-fg-muted">
            Full-colour prints tier on the job-wide print quantity ({priced.printQuantity} — {SCP_BLANK_ALIGNED_QUANTITY_TIERS[priced.printTierIndex]?.label}); screen print and embroidery tier per group; setups once per design.
          </Text>
        ) : null}
      </div>

      {/* ---------------- Bands + extras + totals ---------------- */}
      <div className="px-6 grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4">
        <div>
          <Heading level="h2" className="text-base mb-2">Per-garment price by quantity band <span className="text-ui-fg-muted font-normal text-sm">(that group at each band, everything else as entered)</span></Heading>
          <div className="overflow-x-auto rounded-md border border-ui-border-base">
            <table className="w-full text-sm">
              <thead className="bg-ui-bg-subtle text-ui-fg-muted text-xs">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Group</th>
                  {SCP_BLANK_ALIGNED_QUANTITY_TIERS.map((t) => <th key={t.label} className="px-3 py-2 font-medium text-right">{t.label.replace("Qty ", "")}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-border-base">
                {state.groups.length === 0 ? <tr><td colSpan={6} className="px-3 py-3 text-xs text-ui-fg-muted">Add a group to see its price at every band.</td></tr> : null}
                {state.groups.map((g, gi) => (
                  <tr key={g.id}>
                    <td className="px-3 py-2 truncate max-w-[18rem]">#{gi + 1} {g.supplied ? "Customer-supplied" : g.product?.title ?? "—"}</td>
                    {(bands[g.id] ?? []).map((b, i) => <td key={i} className="px-3 py-2 text-right whitespace-nowrap">{money(b)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tier ? <Text size="xsmall" className="text-ui-fg-muted mt-1">{tier.name}: garments at a flat cost × {tier.multiplier.toFixed(2)} at every band (ladder when the variant has no stamped cost); decoration still tiers by quantity.</Text> : null}
        </div>

        <div className="flex flex-col gap-y-3">
          <div className="rounded-md border border-ui-border-base">
            <div className="px-3 py-2 bg-ui-bg-subtle text-xs text-ui-fg-muted font-medium">Setup fees &amp; extras (once per job, per design)</div>
            {priced.extras.length === 0 ? (
              <Text size="xsmall" className="text-ui-fg-muted px-3 py-2">None.</Text>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-ui-border-base">
                  {priced.extras.map((c) => (
                    <tr key={c.key}>
                      <td className="px-3 py-1.5">
                        {c.label}
                        {c.notes?.[0] ? <div className="text-[11px] text-ui-fg-muted">{c.notes[0]}</div> : null}
                        {c.setupProduct && !setups[c.setupProduct] ? <div className="text-[11px] text-ui-tag-orange-text">custom line — setup product not found</div> : null}
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
            <div className="flex items-baseline justify-between"><Text size="small" className="text-ui-fg-muted">Sell (inc GST)</Text><Text weight="plus" className="text-lg">{money(priced.totals.sellIncMajor)}</Text></div>
            <div className="flex items-baseline justify-between"><Text size="small" className="text-ui-fg-muted">Cost (ex GST)</Text><Text>{money(priced.totals.costExMajor)}</Text></div>
            <div className="flex items-baseline justify-between">
              <Text size="small" className="text-ui-fg-muted">Margin (sell ÷ 1.1 − cost)</Text>
              <span>
                {money(priced.totals.marginExMajor)}
                {priced.totals.marginPct != null ? <Badge size="2xsmall" color={marginTone(priced.totals.marginPct)} className="ml-1">{priced.totals.marginPct}%</Badge> : null}
              </span>
            </div>
            {priced.totals.unknownCostCount > 0 ? <Text size="xsmall" className="text-ui-fg-muted">Cost + margin exclude {priced.totals.unknownCostCount} line(s) with no known cost.</Text> : null}
          </div>

          {priced.warnings.map((w, i) => <Text key={i} size="xsmall" className="text-ui-tag-orange-text">⚠ {w}</Text>)}

          <div className="rounded-md border border-ui-border-base p-3 flex flex-col gap-y-2">
            {targetQuote ? (
              <>
                <Button variant="primary" isLoading={sending} onClick={sendToQuote}>Save job to quote {targetQuote.public_id}</Button>
                <Text size="xsmall" className="text-ui-fg-muted">Replaces the pricer's lines on the quote; lines you added by hand are kept. The job is saved with the quote so "Price a job" reopens it.</Text>
              </>
            ) : (
              <>
                <Label size="xsmall">Customer email (creates the quote)</Label>
                <div className="flex gap-2">
                  <Input type="email" placeholder="customer@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  <Button variant="primary" isLoading={sending} onClick={sendToQuote} className="whitespace-nowrap">Create quote</Button>
                </div>
                <Text size="xsmall" className="text-ui-fg-muted">Or open an existing quote and click "Price a job" there to add to it.</Text>
              </>
            )}
            <div><Button size="small" variant="transparent" onClick={resetJob}>Clear job</Button></div>
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
