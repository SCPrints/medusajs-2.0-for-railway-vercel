import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingStorefront } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { HelpTooltip } from "../../components/reports/help-tooltip"
import DesignsTab from "./components/designs-tab"
import DestinationsTab from "./components/destinations-tab"
import InventoryTab from "./components/inventory-tab"

type Organisation = {
  id: string
  handle: string
  name: string
  abn: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  default_pricing_tier: string | null
  tax_exempt: boolean
  tax_exempt_reason: string | null
  primary_contact_customer_id?: string | null
}

type Member = {
  id: string
  customer_id: string
  role: "owner" | "purchaser" | "viewer"
  accepted_at: string | null
}

type DetailTab =
  | "overview"
  | "designs"
  | "inventory"
  | "destinations"
  | "members"

const TAB_LABELS: Record<DetailTab, string> = {
  overview: "Overview",
  designs: "Designs",
  inventory: "Inventory",
  destinations: "Destinations",
  members: "Members",
}

const OrganisationsPage = () => {
  const [orgs, setOrgs] = useState<Organisation[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Organisation | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [memberDraft, setMemberDraft] = useState("")
  const [memberRole, setMemberRole] = useState<"owner" | "purchaser" | "viewer">(
    "purchaser"
  )
  const [activeTab, setActiveTab] = useState<DetailTab>("overview")
  const [designCount, setDesignCount] = useState<number | null>(null)
  const [destinationCount, setDestinationCount] = useState<number | null>(null)
  const [inventoryCount, setInventoryCount] = useState<number | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [nName, setNName] = useState("")
  const [nHandle, setNHandle] = useState("")
  const [nEmail, setNEmail] = useState("")
  const [nAbn, setNAbn] = useState("")
  const [nNotes, setNNotes] = useState("")
  const [nTier, setNTier] = useState("")
  const [nTaxExempt, setNTaxExempt] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("q", search)
      const res = await fetch(`/admin/organisations?${params.toString()}`, {
        credentials: "include",
      })
      const json = (await res.json()) as { organisations?: Organisation[] }
      setOrgs(json.organisations ?? [])
    } catch {
      toast.error("Failed to load organisations")
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    load()
  }, [load])

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/admin/organisations/${id}`, {
        credentials: "include",
      })
      const json = (await res.json()) as {
        organisation: Organisation
        members: Member[]
      }
      setSelected(json.organisation)
      setMembers(json.members ?? [])
    } catch {
      toast.error("Failed to load organisation")
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      setMembers([])
      return
    }
    loadDetail(selectedId)
  }, [selectedId, loadDetail])

  const submitNew = async () => {
    if (!nName.trim() || !nHandle.trim()) {
      toast.error("Name and handle required")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/admin/organisations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nName.trim(),
          handle: nHandle.trim(),
          contact_email: nEmail.trim() || undefined,
          abn: nAbn.trim() || undefined,
          notes: nNotes.trim() || undefined,
          default_pricing_tier: nTier.trim() || undefined,
          tax_exempt: nTaxExempt,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success("Created")
      setCreateOpen(false)
      setNName("")
      setNHandle("")
      setNEmail("")
      setNAbn("")
      setNNotes("")
      setNTier("")
      setNTaxExempt(false)
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? "Create failed")
    } finally {
      setSaving(false)
    }
  }

  const patchSelected = async (patch: Record<string, unknown>) => {
    if (!selected) return
    try {
      const res = await fetch(`/admin/organisations/${selected.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await res.text())
      await loadDetail(selected.id)
      toast.success("Saved")
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed")
    }
  }

  const addMember = async () => {
    if (!selected || !memberDraft.trim()) return
    try {
      const res = await fetch(
        `/admin/organisations/${selected.id}/members`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: memberDraft.trim(),
            role: memberRole,
          }),
        }
      )
      if (!res.ok) throw new Error(await res.text())
      setMemberDraft("")
      await loadDetail(selected.id)
    } catch (err: any) {
      toast.error(err?.message ?? "Add failed")
    }
  }

  const removeMember = async (m: Member) => {
    if (!selected) return
    try {
      await fetch(
        `/admin/organisations/${selected.id}/members?customer_id=${encodeURIComponent(m.customer_id)}`,
        { method: "DELETE", credentials: "include" }
      )
      await loadDetail(selected.id)
    } catch {
      toast.error("Remove failed")
    }
  }

  const renderOverview = () => {
    if (!selected) return null
    const primaryContactId = selected.primary_contact_customer_id ?? ""
    return (
      <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
        <div>
          <Label size="xsmall">Name</Label>
          <Input
            defaultValue={selected.name}
            onBlur={(e) =>
              e.target.value !== selected.name &&
              patchSelected({ name: e.target.value })
            }
          />
        </div>
        <div>
          <Label size="xsmall">Contact email</Label>
          <Input
            defaultValue={selected.contact_email ?? ""}
            onBlur={(e) =>
              patchSelected({
                contact_email: e.target.value || null,
              })
            }
          />
        </div>
        <div>
          <Label size="xsmall">ABN</Label>
          <Input
            defaultValue={selected.abn ?? ""}
            onBlur={(e) => patchSelected({ abn: e.target.value || null })}
          />
        </div>
        <div>
          <Label size="xsmall">Default pricing tier</Label>
          <Input
            defaultValue={selected.default_pricing_tier ?? ""}
            onBlur={(e) =>
              patchSelected({
                default_pricing_tier: e.target.value || null,
              })
            }
          />
        </div>
        <div className="small:col-span-2">
          <Label size="xsmall" className="flex items-center gap-x-1">
            Primary contact customer
            <HelpTooltip
              text={{
                title: "Primary contact customer",
                body: "The single customer-of-record used on every fulfillment order placed against this org. Required before staff can enter fulfillment orders.",
                bullets: [
                  "Paste a customer ID (e.g. cus_01H…). The customer must already exist in Medusa.",
                  "Fulfillment orders use this customer for billing/audit; the actual member who placed each order is stamped on order.metadata.placed_by_customer_id.",
                  "Owner changes don't break historical orders — this is a long-lived business contact, not the rotating staff owner.",
                ],
              }}
            />
          </Label>
          <Input
            placeholder="cus_… (paste a customer ID)"
            defaultValue={primaryContactId}
            onBlur={(e) => {
              const next = e.target.value.trim()
              if (next === primaryContactId) return
              patchSelected({
                primary_contact_customer_id: next || null,
              })
            }}
          />
          {primaryContactId ? (
            <a
              href={`/app/customers/${primaryContactId}`}
              className="mt-1 inline-block text-xs text-ui-fg-interactive hover:underline"
            >
              Open customer →
            </a>
          ) : (
            <Text size="xsmall" className="text-ui-fg-muted mt-1">
              Not set — fulfillment order entry will be blocked until this is configured.
            </Text>
          )}
        </div>
        <div className="flex items-end gap-x-2 small:col-span-2">
          <Switch
            id="tax-exempt"
            checked={selected.tax_exempt}
            onCheckedChange={(v) => patchSelected({ tax_exempt: v })}
          />
          <Label htmlFor="tax-exempt">Tax-exempt</Label>
        </div>
        <div className="small:col-span-2">
          <Label size="xsmall">Notes</Label>
          <Textarea
            rows={3}
            defaultValue={selected.notes ?? ""}
            onBlur={(e) => patchSelected({ notes: e.target.value || null })}
          />
        </div>
      </div>
    )
  }

  const renderMembers = () => (
    <div>
      <div className="flex items-center gap-x-2">
        <Input
          placeholder="customer_id (cus_...)"
          value={memberDraft}
          onChange={(e) => setMemberDraft(e.target.value)}
        />
        <select
          value={memberRole}
          onChange={(e) => setMemberRole(e.target.value as any)}
          className="rounded-md border border-ui-border-base bg-white px-2 py-1.5 text-sm"
        >
          <option value="owner">Owner</option>
          <option value="purchaser">Purchaser</option>
          <option value="viewer">Viewer</option>
        </select>
        <Button size="small" onClick={addMember}>
          Add
        </Button>
      </div>
      {members.length === 0 ? (
        <Text size="xsmall" className="text-ui-fg-muted mt-2">
          No members yet.
        </Text>
      ) : (
        <ul className="mt-2 divide-y">
          {members.map((m) => (
            <li
              key={m.id}
              className="py-2 flex items-center justify-between"
            >
              <div>
                <a
                  href={`/app/customers/${m.customer_id}`}
                  className="text-sm font-semibold hover:underline"
                >
                  {m.customer_id}
                </a>
                <Text size="xsmall" className="text-ui-fg-muted">
                  {m.role}
                </Text>
              </div>
              <button
                type="button"
                onClick={() => removeMember(m)}
                className="text-xs text-rose-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  const renderPlaceholder = (tab: DetailTab) => (
    <Container className="flex flex-col items-center gap-y-2 py-12 bg-ui-bg-subtle/40">
      <Text className="text-ui-fg-muted text-sm">
        {TAB_LABELS[tab]} management coming soon.
      </Text>
      <Text size="xsmall" className="text-ui-fg-muted">
        This tab is reserved for the customer fulfillment service Phase 1 build.
      </Text>
    </Container>
  )

  const renderTabContent = () => {
    if (!selected) return null
    switch (activeTab) {
      case "overview":
        return renderOverview()
      case "members":
        return renderMembers()
      case "designs":
        return (
          <DesignsTab
            organisationId={selected.id}
            onCountChange={setDesignCount}
          />
        )
      case "destinations":
        return (
          <DestinationsTab
            organisationId={selected.id}
            onCountChange={setDestinationCount}
          />
        )
      case "inventory":
        return (
          <InventoryTab
            organisationId={selected.id}
            onCountChange={setInventoryCount}
          />
        )
      default:
        return null
    }
  }

  const tabCount = (tab: DetailTab): number | null => {
    if (!selected) return null
    if (tab === "members") return members.length
    if (tab === "designs") return designCount
    if (tab === "inventory") return inventoryCount
    if (tab === "destinations") return destinationCount
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1" className="flex items-center">
          Organisations
          <HelpTooltip
            text={{
              title: "Organisation accounts",
              body: "Top-level accounts for schools, sports clubs, businesses — anything that groups multiple customers under one shared purchasing identity.",
              bullets: [
                "Each member is linked to a customer record. Members have a role (owner / purchaser / viewer).",
                "Set a default_pricing_tier to drive future price-list overrides.",
                "tax_exempt on the org snapshots to orders placed by members.",
                "Designs / Inventory / Destinations tabs are part of the customer fulfillment service build — see Docs/FULFILLMENT_PHASE_1_SPEC.md.",
              ],
            }}
          />
        </Heading>
        <div className="flex items-center gap-x-2">
          <Badge color="blue">{orgs.length}</Badge>
          <Button size="small" onClick={() => setCreateOpen((v) => !v)}>
            {createOpen ? "Cancel" : "New organisation"}
          </Button>
        </div>
      </div>

      {createOpen ? (
        <div className="px-6 py-4 grid grid-cols-1 small:grid-cols-2 gap-3 border-b border-ui-border-base">
          <div>
            <Label size="xsmall">Name *</Label>
            <Input value={nName} onChange={(e) => setNName(e.target.value)} />
          </div>
          <div>
            <Label size="xsmall">Handle * (url-safe)</Label>
            <Input
              value={nHandle}
              onChange={(e) => setNHandle(e.target.value)}
              placeholder="e.g. marrickville-lions"
            />
          </div>
          <div>
            <Label size="xsmall">Contact email</Label>
            <Input value={nEmail} onChange={(e) => setNEmail(e.target.value)} />
          </div>
          <div>
            <Label size="xsmall">ABN</Label>
            <Input value={nAbn} onChange={(e) => setNAbn(e.target.value)} />
          </div>
          <div>
            <Label size="xsmall">Default pricing tier</Label>
            <Input
              value={nTier}
              onChange={(e) => setNTier(e.target.value)}
              placeholder="e.g. wholesale, vip"
            />
          </div>
          <div className="flex items-end gap-x-2">
            <Switch
              id="new-tax-exempt"
              checked={nTaxExempt}
              onCheckedChange={(v) => setNTaxExempt(v)}
            />
            <Label htmlFor="new-tax-exempt">Tax-exempt</Label>
          </div>
          <div className="small:col-span-2">
            <Label size="xsmall">Notes</Label>
            <Textarea
              rows={2}
              value={nNotes}
              onChange={(e) => setNNotes(e.target.value)}
            />
          </div>
          <div className="small:col-span-2 flex justify-end">
            <Button size="small" onClick={submitNew} disabled={saving}>
              Save
            </Button>
          </div>
        </div>
      ) : null}

      <div className="px-6 py-3 border-b border-ui-border-base">
        <Input
          placeholder="Search by name, handle, ABN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-0">
        <div className="border-r border-ui-border-base">
          {loading ? (
            <Text className="p-6 text-ui-fg-muted text-sm">Loading…</Text>
          ) : orgs.length === 0 ? (
            <Text className="p-6 text-ui-fg-muted text-sm">No organisations.</Text>
          ) : (
            <ul className="divide-y">
              {orgs.map((o) => (
                <li
                  key={o.id}
                  className={`px-6 py-3 cursor-pointer hover:bg-ui-bg-subtle ${selectedId === o.id ? "bg-ui-bg-subtle" : ""}`}
                  onClick={() => setSelectedId(o.id)}
                >
                  <div className="flex items-center justify-between">
                    <Text weight="plus">{o.name}</Text>
                    {o.tax_exempt ? <Badge color="orange">Tax-exempt</Badge> : null}
                  </div>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {o.handle}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-6">
          {!selected ? (
            <Text className="text-ui-fg-muted text-sm">
              Pick an organisation on the left to view + edit.
            </Text>
          ) : (
            <div className="flex flex-col gap-y-4">
              <Heading level="h2">{selected.name}</Heading>

              <div className="flex gap-x-1 border-b border-ui-border-base px-1 -mx-1">
                {(
                  [
                    "overview",
                    "designs",
                    "inventory",
                    "destinations",
                    "members",
                  ] as const
                ).map((tab) => {
                  const active = activeTab === tab
                  const count = tabCount(tab)
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={[
                        "px-3 py-2 text-sm font-medium transition border-b-2 -mb-px",
                        active
                          ? "border-ui-fg-base text-ui-fg-base"
                          : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base",
                      ].join(" ")}
                    >
                      {TAB_LABELS[tab]}
                      {count !== null ? (
                        <span className="ml-2 rounded-full bg-ui-bg-subtle px-1.5 py-0.5 text-xs">
                          {count}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              <div>{renderTabContent()}</div>
            </div>
          )}
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Organisations",
  icon: BuildingStorefront,
})

export default OrganisationsPage
