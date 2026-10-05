import { Badge, Button, Checkbox, Input, Label, Select, Text } from "@medusajs/ui"
import { Plus, Trash } from "@medusajs/icons"
import { useEffect, useState } from "react"

import { TIERS } from "../../../lib/customer-tiers"
import { SCP_PRINT_SIZE_OPTIONS, type ScpPrintSizeId } from "../../../lib/scp-dtf-print-pricing"
import type { QuoteJobPrice, QuoteJobSpec } from "../../../lib/quote-pricing"
import type { QuotePricingLine } from "../../../api/admin/quote-pricing/route"
import { ProductLinePicker, type PickedProductLine } from "./product-line-picker"

/**
 * "Price a job" — the quoting calculator. Staff describe the job (garment,
 * quantity, print positions / screens / embroidery / UV metres); the backend
 * prices it with the live rate cards and the cost-model floors
 * (`/admin/quote-pricing`), and "Add to quote" drops the resulting lines into
 * the quote's line-item editor at the computed prices.
 */

type PriceResponse = {
  price: QuoteJobPrice
  garment: { title: string; unitSellMajor: number | null; supacolour: boolean } | null
  tier: { slug: string; name: string; multiplier: number } | null
  tier_source: "override" | "customer" | null
  lines: QuotePricingLine[]
}

const PRINT_CHANNEL_LABELS = {
  dtf: "Our garment — DTF (Supacolour auto on poly)",
  supacolour: "Our garment — Supacolour",
  byo: "BYO garment — retail + handling",
  promo: "Trade / promo — their garment (ex GST card)",
  press_only: "Press only — they supply transfers",
} as const
type PrintChannel = keyof typeof PRINT_CHANNEL_LABELS

const money = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)

export function JobPricer({
  customerId,
  onAdd,
  onClose,
}: {
  customerId: string | null
  onAdd: (lines: QuotePricingLine[]) => void
  onClose: () => void
}) {
  const [quantity, setQuantity] = useState("")
  const [tier, setTier] = useState<string>("auto")
  const [garment, setGarment] = useState<PickedProductLine | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
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

  const [result, setResult] = useState<PriceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const qty = Number.parseInt(quantity, 10)
  const hasWork = prints.length > 0 || screens.length > 0 || emb.length > 0 || Number(uvMetres) > 0 || garment

  // Price on every change (debounced) — the panel is a live calculator, not a form.
  useEffect(() => {
    if (!Number.isFinite(qty) || qty < 1 || !hasWork) {
      setResult(null)
      return
    }
    const spec: QuoteJobSpec = {
      quantity: qty,
      prints: prints.map((sizeId) => ({ sizeId })),
      printChannel: channel === "auto" ? undefined : channel,
      supacolourRepeatSetup: supaRepeat,
      screen: screens.length
        ? {
            positions: screens.map((s) => ({ colours: Number(s.colours) || 1, darkGarment: s.dark })),
            heavyGarment: screenHeavy === "auto" ? undefined : screenHeavy === "yes",
            repeatSetup: screenRepeat,
          }
        : undefined,
      embroidery: emb.map((e) => ({ stitchCount: Number(e.stitches) || 0, digitizing: e.digitizing })).filter((e) => e.stitchCount > 0),
      embroideryPromo: embPromo,
      uvdtf: Number(uvMetres) > 0 ? { metres: Number(uvMetres), reorder: uvReorder } : undefined,
    }
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/admin/quote-pricing", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spec,
            variant_id: garment?.variant_id ?? null,
            customer_id: customerId,
            tier: tier === "auto" ? undefined : tier,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? json?.message ?? `HTTP ${res.status}`)
        setResult(json as PriceResponse)
      } catch (err: any) {
        setError(err?.message ?? "Pricing failed")
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity, tier, garment?.variant_id, channel, JSON.stringify(prints), supaRepeat, JSON.stringify(screens), screenHeavy, screenRepeat, JSON.stringify(emb), embPromo, uvMetres, uvReorder, customerId])

  const totals = result?.price.totals
  const marginTone = (pct: number | null) =>
    pct == null ? "grey" : pct < 15 ? "red" : pct < 35 ? "orange" : "green"

  return (
    <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 flex flex-col gap-y-3">
      <div className="flex items-center justify-between">
        <Text weight="plus">Price a job</Text>
        <Button size="small" variant="transparent" onClick={onClose}>Close</Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label size="xsmall">Quantity (garments)</Label>
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 50" />
        </div>
        <div>
          <Label size="xsmall">Garment pricing</Label>
          <Select value={tier} onValueChange={setTier}>
            <Select.Trigger><Select.Value /></Select.Trigger>
            <Select.Content>
              <Select.Item value="auto">Customer's tier (or public ladder)</Select.Item>
              <Select.Item value="standard">Public quantity ladder</Select.Item>
              {TIERS.map((t) => (
                <Select.Item key={t.slug} value={t.slug}>{t.name} (×{t.multiplier.toFixed(2)})</Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      </div>

      {/* Garment */}
      <div className="flex flex-col gap-y-1">
        <Label size="xsmall">Garment (our catalogue — leave empty for BYO / trade / stickers)</Label>
        {garment ? (
          <div className="flex items-center gap-2">
            <Badge size="2xsmall" color="green">{garment.title}</Badge>
            {!garment.variant_id ? <Text size="xsmall" className="text-ui-tag-orange-text">Pick a size/colour — the ladder lives on the variant.</Text> : null}
            <Button size="small" variant="transparent" onClick={() => setGarment(null)}>Remove</Button>
          </div>
        ) : pickerOpen ? (
          <ProductLinePicker onPick={(p) => { setGarment(p); setPickerOpen(false) }} onClose={() => setPickerOpen(false)} />
        ) : (
          <div><Button size="small" variant="secondary" onClick={() => setPickerOpen(true)}><Plus /> Pick garment</Button></div>
        )}
      </div>

      {/* Full-colour prints */}
      <div className="flex flex-col gap-y-1">
        <div className="flex items-center justify-between">
          <Label size="xsmall">Full-colour print positions</Label>
          <Button size="small" variant="transparent" onClick={() => setPrints((p) => [...p, "up_to_a4"])}><Plus /> Position</Button>
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
        ) : null}
        {prints.map((sizeId, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select value={sizeId} onValueChange={(v) => setPrints((p) => p.map((s, j) => (j === i ? (v as ScpPrintSizeId) : s)))}>
              <Select.Trigger><Select.Value /></Select.Trigger>
              <Select.Content>
                {SCP_PRINT_SIZE_OPTIONS.map((o) => (
                  <Select.Item key={o.id} value={o.id}>{o.label} ({o.dimensionsLabel})</Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Button size="small" variant="transparent" onClick={() => setPrints((p) => p.filter((_, j) => j !== i))} aria-label="Remove position"><Trash /></Button>
          </div>
        ))}
        {prints.length && (channel === "supacolour" || result?.garment?.supacolour) ? (
          <label className="flex items-center gap-2 text-xs"><Checkbox checked={supaRepeat} onCheckedChange={(v) => setSupaRepeat(v === true)} /> Repeat design (Supacolour reset setup)</label>
        ) : null}
      </div>

      {/* Screen */}
      <div className="flex flex-col gap-y-1">
        <div className="flex items-center justify-between">
          <Label size="xsmall">Screen print positions (min 25)</Label>
          <Button size="small" variant="transparent" onClick={() => setScreens((s) => [...s, { colours: "1", dark: false }])}><Plus /> Position</Button>
        </div>
        {screens.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input type="number" min={1} max={6} value={s.colours} onChange={(e) => setScreens((all) => all.map((x, j) => (j === i ? { ...x, colours: e.target.value } : x)))} placeholder="colours" className="w-24" />
            <label className="flex items-center gap-1 text-xs"><Checkbox checked={s.dark} onCheckedChange={(v) => setScreens((all) => all.map((x, j) => (j === i ? { ...x, dark: v === true } : x)))} /> dark garment (underbase)</label>
            <Button size="small" variant="transparent" onClick={() => setScreens((all) => all.filter((_, j) => j !== i))} aria-label="Remove position"><Trash /></Button>
          </div>
        ))}
        {screens.length ? (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Select value={screenHeavy} onValueChange={(v) => setScreenHeavy(v as "auto" | "yes" | "no")}>
              <Select.Trigger className="w-56"><Select.Value /></Select.Trigger>
              <Select.Content>
                <Select.Item value="auto">Heavy garment: from product flag</Select.Item>
                <Select.Item value="yes">Heavy garment (hoodie / fleece / poly)</Select.Item>
                <Select.Item value="no">Standard cotton</Select.Item>
              </Select.Content>
            </Select>
            <label className="flex items-center gap-1"><Checkbox checked={screenRepeat} onCheckedChange={(v) => setScreenRepeat(v === true)} /> Repeat screens (under 6 months)</label>
          </div>
        ) : null}
      </div>

      {/* Embroidery */}
      <div className="flex flex-col gap-y-1">
        <div className="flex items-center justify-between">
          <Label size="xsmall">Embroidery placements</Label>
          <Button size="small" variant="transparent" onClick={() => setEmb((e) => [...e, { stitches: "5000", digitizing: true }])}><Plus /> Placement</Button>
        </div>
        {emb.map((e, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input type="number" min={1} step={500} value={e.stitches} onChange={(ev) => setEmb((all) => all.map((x, j) => (j === i ? { ...x, stitches: ev.target.value } : x)))} placeholder="stitches" className="w-28" />
            <label className="flex items-center gap-1 text-xs"><Checkbox checked={e.digitizing} onCheckedChange={(v) => setEmb((all) => all.map((x, j) => (j === i ? { ...x, digitizing: v === true } : x)))} /> new file (digitizing)</label>
            <Button size="small" variant="transparent" onClick={() => setEmb((all) => all.filter((_, j) => j !== i))} aria-label="Remove placement"><Trash /></Button>
          </div>
        ))}
        {emb.length ? (
          <label className="flex items-center gap-1 text-xs"><Checkbox checked={embPromo} onCheckedChange={(v) => setEmbPromo(v === true)} /> Trade card — customer-supplied garments (ex GST + GST)</label>
        ) : null}
      </div>

      {/* UV DTF */}
      <div className="grid grid-cols-2 gap-2 items-end">
        <div>
          <Label size="xsmall">UV DTF gang sheets (lineal metres, 580mm)</Label>
          <Input type="number" min={0} value={uvMetres} onChange={(e) => setUvMetres(e.target.value)} placeholder="0" />
        </div>
        {Number(uvMetres) > 0 ? (
          <label className="flex items-center gap-1 text-xs pb-2"><Checkbox checked={uvReorder} onCheckedChange={(v) => setUvReorder(v === true)} /> Reorder (setup waived)</label>
        ) : null}
      </div>

      {/* Result */}
      {error ? <Text size="xsmall" className="text-ui-tag-red-icon">{error}</Text> : null}
      {result ? (
        <div className="flex flex-col gap-y-2">
          {result.tier ? (
            <Text size="xsmall" className="text-ui-fg-muted">
              Garment at {result.tier.name} (×{result.tier.multiplier.toFixed(2)}{result.tier_source === "customer" ? ", the customer's tier" : ""}).
            </Text>
          ) : null}
          {result.price.warnings.map((w, i) => (
            <Text key={i} size="xsmall" className="text-ui-tag-orange-text">⚠ {w}</Text>
          ))}
          <table className="w-full text-xs">
            <thead className="text-ui-fg-muted">
              <tr className="text-left">
                <th className="py-1 font-medium">Component</th>
                <th className="py-1 font-medium text-right">Qty</th>
                <th className="py-1 font-medium text-right">Unit sell</th>
                <th className="py-1 font-medium text-right">Unit cost ex</th>
                <th className="py-1 font-medium text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {result.price.components.map((c) => (
                <tr key={c.key} className="border-t border-ui-border-base">
                  <td className="py-1 pr-2">
                    {c.label}
                    {c.requiresQuote ? <Badge size="2xsmall" color="orange" className="ml-1">price by hand</Badge> : null}
                    {c.notes?.map((n, i) => <div key={i} className="text-ui-fg-muted">{n}</div>)}
                  </td>
                  <td className="py-1 text-right">{c.quantity}</td>
                  <td className="py-1 text-right">{money(c.unitSellMajor)}</td>
                  <td className="py-1 text-right">{money(c.unitCostExMajor)}</td>
                  <td className="py-1 text-right whitespace-nowrap">
                    {money(c.marginExMajor)}
                    {c.marginPct != null ? <Badge size="2xsmall" color={marginTone(c.marginPct)} className="ml-1">{c.marginPct}%</Badge> : null}
                  </td>
                </tr>
              ))}
            </tbody>
            {totals ? (
              <tfoot>
                <tr className="border-t border-ui-border-strong font-medium">
                  <td className="py-1" colSpan={2}>Total — {money(result.price.perGarmentSellMajor)} per garment</td>
                  <td className="py-1 text-right">{money(totals.sellIncMajor)} inc</td>
                  <td className="py-1 text-right">{money(totals.costExMajor)}</td>
                  <td className="py-1 text-right whitespace-nowrap">
                    {money(totals.marginExMajor)}
                    {totals.marginPct != null ? <Badge size="2xsmall" color={marginTone(totals.marginPct)} className="ml-1">{totals.marginPct}%</Badge> : null}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
          <Text size="xsmall" className="text-ui-fg-muted">
            Sell is inc GST (what the customer pays); cost is ex GST from the cost model; margin = sell ÷ 1.1 − cost.
            {totals?.unknownCostKeys.length ? ` Cost/margin totals exclude ${totals.unknownCostKeys.length} component(s) with no known cost.` : ""}
          </Text>
          <div>
            <Button size="small" variant="primary" disabled={loading} onClick={() => onAdd(result.lines)}>
              Add {result.lines.length} line{result.lines.length === 1 ? "" : "s"} to quote
            </Button>
          </div>
        </div>
      ) : (
        <Text size="xsmall" className="text-ui-fg-muted">
          {loading ? "Pricing…" : "Enter a quantity and add a garment or decoration to price it."}
        </Text>
      )}
    </div>
  )
}
