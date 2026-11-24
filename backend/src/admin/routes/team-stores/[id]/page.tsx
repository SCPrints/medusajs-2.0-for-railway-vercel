import { Badge, Button, Checkbox, Container, Heading, Input, Label, Select, Switch, Table, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"

import { TEAM_STORE_STATUS_LABEL, variantColour, type RunSummary, type TeamStoreStatus } from "../../../../lib/team-store"
import { AppLink, useGo } from "../../../lib/nav"
import { api, StoreForm, type StoreDraft } from "../../../components/team-stores/shared"

type Item = {
  id: string
  product_handle: string
  colour: string
  allowed_sizes: { sizes?: string[] } | null
  unit_price: number | null
  unit_cost_estimate: number | null
  is_active: boolean
  has_design: boolean
  mockups: string[]
  product: { id: string; title: string; thumbnail: string | null; colours: string[]; sizes: string[] } | null
}
type View = {
  store: StoreDraft & {
    id: string
    handle: string
    status: TeamStoreStatus
    url: string
    has_password: boolean
    approved_at: string | null
    approved_by_name: string | null
    quote_id: string | null
    metadata: Record<string, any>
  }
  organisation: { id: string; name: string; contact_email: string | null } | null
  items: Item[]
}

/** The run's production steps, in order, for "Move all orders". */
const RUN_STAGES = [
  { value: "ordered", label: "Blanks ordered" },
  { value: "arrived", label: "Blanks arrived" },
  { value: "in_production", label: "In production" },
  { value: "quality_check", label: "Quality check" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
]

const money = (n: number | null | undefined) => (n == null ? "—" : `$${Number(n).toFixed(2)}`)

const TeamStorePage = () => {
  const { id } = useParams()
  const go = useGo()
  const [view, setView] = useState<View | null>(null)
  const [run, setRun] = useState<RunSummary | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [v, r] = await Promise.all([api<View>(`/admin/team-stores/${id}`), api<{ run: RunSummary }>(`/admin/team-stores/${id}/run`)])
    setView(v)
    setRun(r.run)
  }, [id])
  useEffect(() => {
    load().catch((e) => toast.error(e.message))
  }, [load])

  const act = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label)
    try {
      await fn()
      await load()
      if (done) toast.success(done)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (!view) return <Container className="p-6"><Text size="small">Loading…</Text></Container>
  const s = view.store
  const editable = s.status === "draft" || s.status === "awaiting_approval"

  const setStatus = (status: string, done: string) => act(status, () => api(`/admin/team-stores/${s.id}`, { method: "POST", body: { status } }), done)

  return (
    <div className="flex flex-col gap-4">
      <Container className="flex flex-col gap-3 p-6">
        <AppLink href="/app/team-stores" className="text-ui-fg-muted text-sm">← Team stores</AppLink>
        <div className="flex flex-wrap items-center gap-3">
          <Heading level="h1">{s.title}</Heading>
          <Badge size="small" color={s.status === "open" ? "green" : "blue"}>{TEAM_STORE_STATUS_LABEL[s.status]}</Badge>
          {view.organisation ? <Text size="small" className="text-ui-fg-muted">{view.organisation.name}</Text> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input readOnly value={s.url} className="max-w-md" onFocus={(e) => e.currentTarget.select()} />
          <Button size="small" variant="secondary" onClick={() => navigator.clipboard?.writeText(s.url).then(() => toast.success("Store link copied"))}>
            Copy link
          </Button>
          <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(s.url)}`} target="_blank" rel="noreferrer" className="text-ui-fg-interactive text-sm">
            QR code
          </a>
        </div>
        <Text size="small" className="text-ui-fg-muted">
          {s.approved_at
            ? `Approved by ${s.approved_by_name ?? "the organiser"} on ${new Date(s.approved_at).toLocaleDateString("en-AU")}.`
            : s.status === "awaiting_approval"
              ? `Waiting for the organiser's approval${s.metadata?.approval_sent_to ? ` (sent to ${s.metadata.approval_sent_to})` : ""}.`
              : "Not approved yet."}
        </Text>
        {approvalUrl ? (
          <div className="flex items-center gap-2">
            <Input readOnly value={approvalUrl} className="max-w-xl" onFocus={(e) => e.currentTarget.select()} />
            <Button size="small" variant="secondary" onClick={() => navigator.clipboard?.writeText(approvalUrl).then(() => toast.success("Approval link copied"))}>
              Copy approval link
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <Button
              size="small"
              isLoading={busy === "approval"}
              onClick={() =>
                act("approval", async () => {
                  const r = await api<{ approval_url: string; emailed: boolean }>(`/admin/team-stores/${s.id}/send-approval`, { method: "POST", body: {} })
                  setApprovalUrl(r.approval_url)
                  toast.success(r.emailed ? "Approval link emailed to the organiser" : "Approval link ready — copy it to the organiser")
                })
              }
            >
              Send for approval
            </Button>
          ) : null}
          {s.status === "awaiting_approval" ? (
            <Button size="small" isLoading={busy === "open"} disabled={!s.approved_at} onClick={() => act("open", () => api(`/admin/team-stores/${s.id}/open`, { method: "POST" }), "Store is open")}>
              Open store
            </Button>
          ) : null}
          {s.status === "open" ? (
            <Button
              size="small"
              variant="danger"
              isLoading={busy === "close"}
              onClick={() => window.confirm("Close the store now? Buyers can't order after this.") && act("close", () => api(`/admin/team-stores/${s.id}/close`, { method: "POST" }), "Store closed")}
            >
              Close now
            </Button>
          ) : null}
          {s.status === "awaiting_approval" ? (
            <Button size="small" variant="secondary" onClick={() => setStatus("draft", "Back to draft")}>Back to draft</Button>
          ) : null}
          {s.status === "in_production" ? (
            <Button size="small" variant="secondary" onClick={() => setStatus("completed", "Marked completed")}>Mark completed</Button>
          ) : null}
          {!["completed", "cancelled", "draft"].includes(s.status) ? (
            <Button size="small" variant="secondary" onClick={() => window.confirm("Cancel this store? Orders already placed stay as they are.") && setStatus("cancelled", "Store cancelled")}>
              Cancel store
            </Button>
          ) : null}
          {s.status === "draft" ? (
            <Button
              size="small"
              variant="danger"
              onClick={() =>
                window.confirm("Delete this draft store?") &&
                act("delete", async () => {
                  await api(`/admin/team-stores/${s.id}`, { method: "DELETE" })
                  go("/app/team-stores")
                })
              }
            >
              Delete draft
            </Button>
          ) : null}
          {s.has_password ? (
            <Button size="small" variant="secondary" onClick={() => act("pw", () => api(`/admin/team-stores/${s.id}`, { method: "POST", body: { password: "" } }), "Password removed")}>
              Remove password
            </Button>
          ) : null}
          {s.quote_id ? <AppLink href={`/app/jobs/${s.quote_id}`} className="text-ui-fg-interactive text-sm self-center">Run job →</AppLink> : null}
        </div>
      </Container>

      <Items view={view} reload={load} editable={editable} />
      <Run store={s} run={run} reload={load} />

      <Container className="flex flex-col gap-3 p-6">
        <Heading level="h2">Details</Heading>
        <StoreForm
          key={s.id + s.status}
          initial={s}
          lockOrganisation={!editable}
          submitLabel="Save details"
          onSubmit={async (draft) => {
            await api(`/admin/team-stores/${s.id}`, { method: "POST", body: draft })
            await load()
            toast.success("Saved")
          }}
        />
      </Container>
    </div>
  )
}

function Items({ view, reload, editable }: { view: View; reload: () => Promise<void>; editable: boolean }) {
  const storeId = view.store.id
  const popupRef = useRef<Window | null>(null)

  const openStudio = async (item: Item) => {
    try {
      const { url } = await api<{ url: string }>(`/admin/team-stores/${storeId}/items/${item.id}/design-link`)
      const popup = window.open(url, "team-store-studio", "width=1280,height=900,noopener=false")
      if (!popup) return toast.error("Popup blocked — allow popups for this site")
      popupRef.current = popup
      // Reload once the Studio closes (the design is saved on "Add to quote").
      const t = setInterval(() => {
        if (popup.closed) {
          clearInterval(t)
          reload().catch(() => undefined)
        }
      }, 1500)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const save = (item: Item, body: Record<string, unknown>, done = "Saved") =>
    api(`/admin/team-stores/${storeId}/items/${item.id}`, { method: "POST", body })
      .then(reload)
      .then(() => toast.success(done))
      .catch((e) => toast.error(e.message))

  return (
    <Container className="flex flex-col gap-3 p-6">
      <Heading level="h2">Items</Heading>
      {!editable ? (
        <Text size="small" className="text-ui-fg-muted">
          The organiser approved these designs. Price changes apply to new cart adds only.
        </Text>
      ) : null}
      {view.items.map((item) => (
        <ItemRow key={item.id} item={item} storeId={storeId} editable={editable} onStudio={() => openStudio(item)} onSave={save} reload={reload} />
      ))}
      {editable ? <AddItem storeId={storeId} reload={reload} /> : null}
    </Container>
  )
}

function ItemRow({
  item,
  storeId,
  editable,
  onStudio,
  onSave,
  reload,
}: {
  item: Item
  storeId: string
  editable: boolean
  onStudio: () => void
  onSave: (item: Item, body: Record<string, unknown>, done?: string) => Promise<unknown>
  reload: () => Promise<void>
}) {
  const [price, setPrice] = useState(item.unit_price == null ? "" : String(item.unit_price))
  const [cost, setCost] = useState(item.unit_cost_estimate == null ? "" : String(item.unit_cost_estimate))
  const [suggest, setSuggest] = useState<{ suggested_price: number; garment_cost: number | null; quantity: number } | null>(null)
  const sizes = item.product?.sizes ?? []
  const allowed = new Set(item.allowed_sizes?.sizes ?? sizes)
  const priceN = Number(price)
  const costN = Number(cost)

  const toggleSize = (size: string) => {
    const next = new Set(allowed)
    next.has(size) ? next.delete(size) : next.add(size)
    // All sizes = no restriction.
    onSave(item, { allowed_sizes: next.size === sizes.length ? null : sizes.filter((x) => next.has(x)) }, "Sizes saved")
  }

  return (
    <div className="flex flex-wrap gap-4 rounded-lg border p-3">
      <img src={item.mockups[0] ?? item.product?.thumbnail ?? ""} alt="" className="h-24 w-24 rounded object-contain bg-ui-bg-subtle" />
      <div className="flex min-w-[240px] flex-1 flex-col gap-2">
        <Text weight="plus">
          {item.product?.title ?? item.product_handle} — {item.colour}
        </Text>
        {!item.product ? <Text size="small" className="text-ui-fg-error">No product with handle “{item.product_handle}”.</Text> : null}
        <div className="flex flex-wrap gap-3">
          {sizes.map((size) => (
            <label key={size} className="flex items-center gap-1 text-sm">
              <Checkbox checked={allowed.has(size)} onCheckedChange={() => toggleSize(size)} />
              {size}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="small" variant="secondary" onClick={onStudio} disabled={!editable}>
            {item.has_design ? "Edit design in Studio" : "Design in Studio"}
          </Button>
          {!item.has_design ? <Badge size="2xsmall" color="orange">No design</Badge> : null}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={item.is_active} onCheckedChange={(v) => onSave(item, { is_active: v })} />
            On sale
          </label>
          {editable ? (
            <Button
              size="small"
              variant="transparent"
              onClick={() =>
                window.confirm("Remove this item?") &&
                api(`/admin/team-stores/${storeId}/items/${item.id}`, { method: "DELETE" }).then(reload).catch((e) => toast.error(e.message))
              }
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <div>
            <Label size="xsmall">Price inc GST</Label>
            <Input size="small" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-28" />
          </div>
          <div>
            <Label size="xsmall">Cost estimate</Label>
            <Input size="small" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="w-28" />
          </div>
          <Button size="small" onClick={() => onSave(item, { unit_price: price === "" ? null : priceN, unit_cost_estimate: cost === "" ? null : costN }, "Price saved")}>
            Save
          </Button>
        </div>
        <Text size="xsmall" className="text-ui-fg-muted">
          Margin {price && cost ? `${money(priceN - costN)} (${Math.round(((priceN - costN) / priceN) * 100)}%)` : "—"}
        </Text>
        <Button
          size="small"
          variant="transparent"
          disabled={!item.has_design}
          onClick={() =>
            api<{ suggested_price: number; garment_cost: number | null; quantity: number }>(`/admin/team-stores/${storeId}/items/${item.id}/suggest-price`)
              .then(setSuggest)
              .catch((e) => toast.error(e.message))
          }
        >
          Suggest a price
        </Button>
        {suggest ? (
          <Text size="xsmall">
            At {suggest.quantity} units: {money(suggest.suggested_price)} · garment cost {money(suggest.garment_cost)}{" "}
            <button
              className="text-ui-fg-interactive"
              onClick={() => {
                setPrice(String(suggest.suggested_price))
                if (!cost && suggest.garment_cost != null) setCost(String(suggest.garment_cost))
              }}
            >
              Use it
            </button>
          </Text>
        ) : null}
      </div>
    </div>
  )
}

type PickProduct = {
  id: string
  title: string
  handle: string
  variants: Array<{ id: string; title: string; options?: Array<{ value: string; option?: { title?: string } }> }>
}

function AddItem({ storeId, reload }: { storeId: string; reload: () => Promise<void> }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<PickProduct[]>([])
  const [picked, setPicked] = useState<PickProduct | null>(null)
  const [colour, setColour] = useState("")

  const search = async () => {
    const params = new URLSearchParams({ q: q.trim(), limit: "15", fields: "id,title,handle,variants.id,variants.title,variants.options.value,variants.options.option.title" })
    const r = await api<{ products: PickProduct[] }>(`/admin/products?${params}`).catch((e) => {
      toast.error(e.message)
      return { products: [] }
    })
    setResults(r.products)
  }
  const colours = picked ? [...new Set(picked.variants.map((v) => variantColour(v)).filter((c): c is string => !!c))] : []

  const add = async () => {
    if (!picked || !colour) return
    try {
      await api(`/admin/team-stores/${storeId}/items`, { method: "POST", body: { product_handle: picked.handle, colour } })
      setPicked(null)
      setColour("")
      setResults([])
      setQ("")
      await reload()
      toast.success("Item added — now design it in the Studio")
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <Text weight="plus" size="small">Add an item (one garment in one colour)</Text>
      <div className="flex gap-2">
        <Input size="small" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search garments, e.g. staple tee" />
        <Button size="small" variant="secondary" onClick={search}>Search</Button>
      </div>
      {results.length && !picked ? (
        <Table>
          <Table.Body>
            {results.map((p) => (
              <Table.Row key={p.id} className="cursor-pointer" onClick={() => setPicked(p)}>
                <Table.Cell>{p.title}</Table.Cell>
                <Table.Cell className="text-ui-fg-muted">{p.handle}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : null}
      {picked ? (
        <div className="flex flex-wrap items-center gap-2">
          <Text size="small">{picked.title}</Text>
          <Select value={colour} onValueChange={setColour}>
            <Select.Trigger className="w-56">
              <Select.Value placeholder="Colour" />
            </Select.Trigger>
            <Select.Content>
              {colours.map((c) => (
                <Select.Item key={c} value={c}>{c}</Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Button size="small" onClick={add} disabled={!colour}>Add</Button>
          <Button size="small" variant="transparent" onClick={() => setPicked(null)}>Change garment</Button>
        </div>
      ) : null}
    </div>
  )
}

function Run({ store, run, reload }: { store: View["store"]; run: RunSummary | null; reload: () => Promise<void> }) {
  const [stage, setStage] = useState("ordered")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  if (!run) return null
  const min = store.minimum_quantity ?? null

  const moveAll = async () => {
    if (!run.order_ids.length) return
    if (!window.confirm(`Move all ${run.order_ids.length} orders to "${RUN_STAGES.find((x) => x.value === stage)?.label}"?`)) return
    setBusy(true)
    try {
      let changed = 0
      const errors: string[] = []
      for (let i = 0; i < run.order_ids.length; i += 200) {
        const r = await api<{ changed: number; results: Array<{ order_id: string; error?: string }> }>("/admin/orders/bulk/production-stage", {
          method: "POST",
          body: { order_ids: run.order_ids.slice(i, i + 200), stage, note: `Team store run: ${store.title}` },
        })
        changed += r.changed
        errors.push(...r.results.filter((x) => x.error).map((x) => `${x.order_id}: ${x.error}`))
      }
      setResult(`${changed} moved.${errors.length ? ` ${errors.length} not moved: ${errors.slice(0, 3).join("; ")}` : ""}`)
      await reload()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="flex flex-col gap-3 p-6">
      <Heading level="h2">{store.quote_id ? "Production run" : "Orders so far"}</Heading>
      <Text size="small">
        {run.orders} orders · {run.units} units · {money(run.revenue)}
        {run.fundraising ? ` · ${money(run.fundraising)} raised for them (pay this back after the run)` : ""}
        {min ? ` · minimum ${min}${run.units < min ? " (under)" : ""}` : ""}
      </Text>
      {run.items.length ? (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Item</Table.HeaderCell>
              <Table.HeaderCell>Sizes</Table.HeaderCell>
              <Table.HeaderCell>Units</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {run.items.map((i) => (
              <Table.Row key={i.item_id}>
                <Table.Cell>{i.title}</Table.Cell>
                <Table.Cell>{i.sizes.map((x) => `${x.size} × ${x.quantity}`).join(", ")}</Table.Cell>
                <Table.Cell>{i.units}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : null}
      {run.buyers.length ? (
        <details>
          <summary className="cursor-pointer text-sm">Buyers ({run.buyers.length})</summary>
          <ul className="mt-2 text-sm">
            {run.buyers.map((b) => (
              <li key={b.order_id}>
                <AppLink href={`/app/orders/${b.order_id}`} className="text-ui-fg-interactive">#{b.display_id}</AppLink> {b.name ?? ""} {b.email ? `· ${b.email}` : ""} · {b.units} units
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {store.status === "closed" && run.order_ids.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            isLoading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const r = await api<{ approved: number; errors: string[] }>(`/admin/team-stores/${store.id}/start-run`, { method: "POST" })
                setResult(`Artwork approved on ${r.approved} orders.${r.errors.length ? ` ${r.errors.length} failed: ${r.errors.slice(0, 3).join("; ")}` : ""}`)
                await reload()
              } catch (e: any) {
                toast.error(e.message)
              } finally {
                setBusy(false)
              }
            }}
          >
            Start the run
          </Button>
          <Text size="xsmall" className="text-ui-fg-muted">Marks every order's artwork approved (the store approval) and sets due dates. No emails to buyers.</Text>
        </div>
      ) : null}
      {store.status === "in_production" && run.order_ids.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={stage} onValueChange={setStage}>
            <Select.Trigger className="w-72">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {RUN_STAGES.map((x) => (
                <Select.Item key={x.value} value={x.value}>{x.label}</Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Button size="small" isLoading={busy} onClick={moveAll}>Move all orders</Button>
          {result ? <Text size="small">{result}</Text> : null}
        </div>
      ) : null}
      {store.status === "in_production" ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          Orders refuse to start production until blanks have arrived. “In production” emails each buyer, as for any order.
        </Text>
      ) : null}
    </Container>
  )
}

export default TeamStorePage
