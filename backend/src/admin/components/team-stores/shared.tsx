import { Button, Input, Label, Select, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

/** Admin fetch: JSON in/out, throws the backend's message. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `HTTP ${res.status}`)
  return json as T
}

export type StoreDraft = {
  organisation_id: string
  title: string
  handle?: string
  intro?: string | null
  banner_url?: string | null
  accent_colour?: string | null
  opens_at?: string | null
  closes_at: string
  password?: string
  delivery_mode: "bulk" | "individual"
  delivery_destination_id?: string | null
  expected_quantity: number
  minimum_quantity?: number | null
  fundraising_per_item?: number
}

/** ISO → the value a datetime-local input shows (staff's own time zone). */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

type Org = { id: string; name: string }
type Dest = { id: string; name: string; city: string }

export function StoreForm({
  initial,
  submitLabel,
  onSubmit,
  lockOrganisation,
}: {
  initial?: Partial<StoreDraft> & { has_password?: boolean; metadata?: Record<string, any> | null }
  submitLabel: string
  onSubmit: (draft: StoreDraft) => Promise<void>
  lockOrganisation?: boolean
}) {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [dests, setDests] = useState<Dest[]>([])
  const [busy, setBusy] = useState(false)
  const [d, setD] = useState({
    organisation_id: initial?.organisation_id ?? "",
    title: initial?.title ?? "",
    handle: initial?.handle ?? "",
    intro: initial?.intro ?? "",
    banner_url: initial?.banner_url ?? "",
    accent_colour: initial?.accent_colour ?? "",
    opens_at: toLocalInput(initial?.opens_at),
    closes_at: toLocalInput(initial?.closes_at),
    password: "",
    delivery_mode: initial?.delivery_mode ?? "bulk",
    delivery_destination_id: initial?.delivery_destination_id ?? "",
    expected_quantity: String(initial?.expected_quantity ?? ""),
    minimum_quantity: initial?.minimum_quantity == null ? "" : String(initial.minimum_quantity),
    fundraising_per_item: initial?.metadata?.fundraising_per_item ? String(initial.metadata.fundraising_per_item) : "",
  })
  const set = (k: keyof typeof d) => (v: string) => setD((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    api<{ organisations: Org[] }>("/admin/organisations").then((r) => setOrgs(r.organisations)).catch(() => setOrgs([]))
  }, [])
  useEffect(() => {
    if (!d.organisation_id) return setDests([])
    api<{ destinations: Dest[] }>(`/admin/organisations/${d.organisation_id}/destinations`)
      .then((r) => setDests(r.destinations))
      .catch(() => setDests([]))
  }, [d.organisation_id])

  const submit = async () => {
    if (!d.organisation_id || !d.title.trim() || !d.closes_at) {
      toast.error("Organisation, title and closing date are needed.")
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        organisation_id: d.organisation_id,
        title: d.title.trim(),
        ...(d.handle.trim() ? { handle: d.handle.trim() } : {}),
        intro: d.intro.trim() || null,
        banner_url: d.banner_url.trim() || null,
        accent_colour: d.accent_colour.trim() || null,
        opens_at: fromLocalInput(d.opens_at),
        closes_at: fromLocalInput(d.closes_at)!,
        ...(d.password ? { password: d.password } : {}),
        delivery_mode: d.delivery_mode as "bulk" | "individual",
        delivery_destination_id: d.delivery_destination_id || null,
        expected_quantity: Number(d.expected_quantity) || 0,
        minimum_quantity: d.minimum_quantity ? Number(d.minimum_quantity) : null,
        fundraising_per_item: Number(d.fundraising_per_item) || 0,
      })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, el: JSX.Element, hint?: string) => (
    <div className="flex flex-col gap-1">
      <Label size="small">{label}</Label>
      {el}
      {hint ? <Text size="xsmall" className="text-ui-fg-muted">{hint}</Text> : null}
    </div>
  )

  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border p-4 md:grid-cols-2">
      {field(
        "Organisation",
        <Select value={d.organisation_id} onValueChange={set("organisation_id")} disabled={lockOrganisation}>
          <Select.Trigger>
            <Select.Value placeholder="Pick the club / school / company" />
          </Select.Trigger>
          <Select.Content>
            {orgs.map((o) => (
              <Select.Item key={o.id} value={o.id}>
                {o.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      )}
      {field("Title", <Input value={d.title} onChange={(e) => set("title")(e.target.value)} placeholder="Cronulla Sharks Juniors 2027 Kit" />)}
      {field("Link name", <Input value={d.handle} onChange={(e) => set("handle")(e.target.value)} placeholder="from the title" />, "scprints.com.au/au/team-store/<link name>")}
      {field("Opens", <Input type="datetime-local" value={d.opens_at} onChange={(e) => set("opens_at")(e.target.value)} />, "Empty = opens when you press Open.")}
      {field("Closes", <Input type="datetime-local" value={d.closes_at} onChange={(e) => set("closes_at")(e.target.value)} />)}
      {field(
        "Delivery",
        <Select value={d.delivery_mode} onValueChange={set("delivery_mode")}>
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="bulk">Bulk to the club (free to buyers)</Select.Item>
            <Select.Item value="individual">Ship to each buyer (normal rate)</Select.Item>
          </Select.Content>
        </Select>
      )}
      {d.delivery_mode === "bulk"
        ? field(
            "Club delivery address",
            <Select value={d.delivery_destination_id} onValueChange={set("delivery_destination_id")}>
              <Select.Trigger>
                <Select.Value placeholder={dests.length ? "Pick an address" : "Add one on the organisation first"} />
              </Select.Trigger>
              <Select.Content>
                {dests.map((x) => (
                  <Select.Item key={x.id} value={x.id}>
                    {x.name} — {x.city}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          )
        : null}
      {field("Expected units", <Input type="number" min={0} value={d.expected_quantity} onChange={(e) => set("expected_quantity")(e.target.value)} />, "Sets the suggested price.")}
      {field("Minimum units", <Input type="number" min={0} value={d.minimum_quantity} onChange={(e) => set("minimum_quantity")(e.target.value)} />, "Under this at close: you choose print or refund.")}
      {field(
        "Password",
        <Input type="text" value={d.password} onChange={(e) => set("password")(e.target.value)} placeholder={initial?.has_password ? "Set — type to change" : "Optional"} />
      )}
      {field(
        "Fundraising per item ($, inc GST)",
        <Input type="number" min={0} max={100} step="0.5" value={d.fundraising_per_item} onChange={(e) => set("fundraising_per_item")(e.target.value)} placeholder="0 = none. Added to every price; we pay it back to them." />
      )}
      {field("Accent colour", <Input value={d.accent_colour} onChange={(e) => set("accent_colour")(e.target.value)} placeholder="#0b1f3a" />)}
      {field("Banner image URL", <Input value={d.banner_url} onChange={(e) => set("banner_url")(e.target.value)} />)}
      <div className="md:col-span-2">
        {field("Intro", <Textarea rows={3} value={d.intro} onChange={(e) => set("intro")(e.target.value)} placeholder="Shown at the top of the store." />)}
      </div>
      <div className="md:col-span-2">
        <Button onClick={submit} isLoading={busy}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
