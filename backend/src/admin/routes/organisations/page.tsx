import { tinted, NAV_COLOR } from "../../lib/nav-tint"
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
import { useSearchParams } from "react-router-dom"

import { HelpTooltip } from "../../components/reports/help-tooltip"
import AccountTab from "./components/account-tab"
import BrandKitTab from "./components/brand-kit-tab"
import DesignsTab from "./components/designs-tab"
import DestinationsTab from "./components/destinations-tab"
import InventoryTab from "./components/inventory-tab"
import { AppLink } from "../../lib/nav"
import { TIERS, TIER_GROUP_NAME_PREFIX } from "../../../lib/customer-tiers"
import { orgTier } from "../../../lib/org-range-from-order"

/** Members are put in this tier's customer group when they join (and when it's set). */
function TierSelect({ value, onChange }: { value: string | null; onChange: (slug: string | null) => void }) {
  return (
    <select
      className="h-8 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
      value={orgTier(value)?.slug ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">None</option>
      {TIERS.map((t) => (
        <option key={t.slug} value={t.slug}>
          {t.name.replace(TIER_GROUP_NAME_PREFIX, "")}
        </option>
      ))}
    </select>
  )
}

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
  metadata?: { portal_extras?: string[] } | null
}

type Member = {
  id: string
  customer_id: string
  role: "owner" | "purchaser" | "viewer"
  accepted_at: string | null
  email?: string | null
  name?: string | null
  company_name?: string | null
}

type CustomerHit = { id: string; email: string | null; first_name: string | null; last_name: string | null; company_name: string | null }
const customerLabel = (c: CustomerHit) =>
  [[c.first_name, c.last_name].filter(Boolean).join(" "), c.email, c.company_name].filter(Boolean).join(" · ") || c.id

type DetailTab =
  | "overview"
  | "designs"
  | "inventory"
  | "destinations"
  | "members"
  | "account"
  | "brand_kit"

const TAB_LABELS: Record<DetailTab, string> = {
  overview: "Overview",
  designs: "Designs",
  inventory: "Inventory",
  destinations: "Destinations",
  members: "Members",
  account: "Account",
  brand_kit: "Brand kit",
}

const OrganisationsPage = () => {
  const [orgs, setOrgs] = useState<Organisation[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // /app/organisations?org=<id>&tab=brand_kit (the job window links here).
  const [params] = useSearchParams()
  const orgParam = params.get("org")
  const tabParam = params.get("tab")
  useEffect(() => {
    if (!orgParam) return
    setSelectedId(orgParam)
    if (tabParam === "brand_kit") setActiveTab("brand_kit")
  }, [orgParam, tabParam])
  const [selected, setSelected] = useState<Organisation | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [memberDraft, setMemberDraft] = useState("")
  const [memberHits, setMemberHits] = useState<CustomerHit[]>([])
  const [memberPick, setMemberPick] = useState<CustomerHit | null>(null)
  // Find customers by name or email as staff type (customer ids still work).
  useEffect(() => {
    const q = memberDraft.trim()
    if (memberPick || q.length < 2 || q.startsWith("cus_")) return setMemberHits([])
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/admin/customers?q=${encodeURIComponent(q)}&limit=8&fields=id,email,first_name,last_name,company_name`,
          { credentials: "include" }
        )
        const j = await r.json()
        setMemberHits(j.customers ?? [])
      } catch {
        setMemberHits([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [memberDraft, memberPick])
  const [memberRole, setMemberRole] = useState<"owner" | "purchaser" | "viewer">(
    "purchaser"
  )
  // An organisation's first member is almost always its owner.
  useEffect(() => {
    setMemberRole(members.length ? "purchaser" : "owner")
  }, [selected?.id, members.length])
  const [activeTab, setActiveTab] = useState<DetailTab>("overview")
  const [designCount, setDesignCount] = useState<number | null>(null)
  const [destinationCount, setDestinationCount] = useState<number | null>(null)
  const [inventoryCount, setInventoryCount] = useState<number | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [nName, setNName] = useState("")
  const [nHandle, setNHandle] = useState("")
  const [handleTouched, setHandleTouched] = useState(false)
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
      const created = (await res.json().catch(() => null)) as { organisation?: { id: string } } | null
      toast.success("Created")
      setCreateOpen(false)
      setNName("")
      setNHandle("")
      setHandleTouched(false)
      setNEmail("")
      setNAbn("")
      setNNotes("")
      setNTier("")
      setNTaxExempt(false)
      await load()
      if (created?.organisation?.id) setSelectedId(created.organisation.id)
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
    const customerId = memberPick?.id ?? (memberDraft.trim().startsWith("cus_") ? memberDraft.trim() : "")
    if (!selected || !customerId) {
      toast.error("Pick the customer from the list.")
      return
    }
    try {
      const res = await fetch(
        `/admin/organisations/${selected.id}/members`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: customerId,
            role: memberRole,
          }),
        }
      )
      if (!res.ok) throw new Error(await res.text())
      setMemberDraft("")
      setMemberPick(null)
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
          <TierSelect
            value={selected.default_pricing_tier}
            onChange={(slug) => patchSelected({ default_pricing_tier: slug })}
          />
        </div>
        <div className="small:col-span-2">
          <Label size="xsmall" className="flex items-center gap-x-1">
            Primary contact
            <HelpTooltip
              text={{
                title: "Primary contact",
                body: "The member stock orders and invoices are addressed to. When it's not set, the first owner is used.",
                bullets: ["Pick from this organisation's members. Add them on the Members tab first."],
              }}
            />
          </Label>
          <select
            className="h-8 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
            value={primaryContactId}
            onChange={(e) => patchSelected({ primary_contact_customer_id: e.target.value || null })}
          >
            <option value="">First owner (default)</option>
            {members.map((m) => (
              <option key={m.id} value={m.customer_id}>
                {[m.name, m.email].filter(Boolean).join(" · ") || m.customer_id} ({m.role})
              </option>
            ))}
            {/* An older contact who isn't a member any more stays visible. */}
            {primaryContactId && !members.some((m) => m.customer_id === primaryContactId) ? (
              <option value={primaryContactId}>{primaryContactId} (not a member)</option>
            ) : null}
          </select>
          {primaryContactId ? (
            <AppLink
              href={`/app/customers/${primaryContactId}`}
              className="mt-1 inline-block text-xs text-ui-fg-interactive hover:underline"
            >
              Open customer →
            </AppLink>
          ) : null}
        </div>
        <div className="flex items-end gap-x-2 small:col-span-2">
          <Switch
            id="tax-exempt"
            checked={selected.tax_exempt}
            onCheckedChange={(v) => patchSelected({ tax_exempt: v })}
          />
          <Label htmlFor="tax-exempt">Tax-exempt</Label>
        </div>
        {/* Optional tabs on the customer's organisation page: off until they ask for them. */}
        {([["allowance", "Show the Uniform allowance tab"], ["brand_kit", "Show the Brand kit tab"]] as const).map(([key, label]) => {
          const on = selected.metadata?.portal_extras ?? []
          return (
            <div key={key} className="flex items-end gap-x-2">
              <Switch
                id={`extra-${key}`}
                checked={on.includes(key)}
                onCheckedChange={(v) => patchSelected({ portal_extras: v ? [...on, key] : on.filter((k) => k !== key) })}
              />
              <Label htmlFor={`extra-${key}`}>{label}</Label>
            </div>
          )
        })}
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
        <div className="relative flex-1">
          <Input
            placeholder="Customer name or email"
            value={memberPick ? customerLabel(memberPick) : memberDraft}
            onChange={(e) => {
              setMemberPick(null)
              setMemberDraft(e.target.value)
            }}
          />
          {memberHits.length > 0 && !memberPick ? (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-ui-border-base bg-ui-bg-base shadow-elevation-flyout">
              {memberHits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setMemberPick(c)
                      setMemberHits([])
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-ui-fg-base hover:bg-ui-bg-base-hover"
                  >
                    {customerLabel(c)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <select
          value={memberRole}
          onChange={(e) => setMemberRole(e.target.value as any)}
          className="rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base"
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
                <AppLink
                  href={`/app/customers/${m.customer_id}`}
                  className="text-sm font-semibold hover:underline"
                >
                  {m.name || m.email || m.customer_id}
                </AppLink>
                <Text size="xsmall" className="text-ui-fg-muted">
                  {[m.email && m.name ? m.email : null, m.company_name, m.role].filter(Boolean).join(" · ")}
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


  const renderTabContent = () => {
    if (!selected) return null
    switch (activeTab) {
      case "overview":
        return renderOverview()
      case "members":
        return renderMembers()
      case "brand_kit":
        return <BrandKitTab key={selected.id} organisationId={selected.id} />
      case "account":
        // key: reload the tab's own state when staff pick another organisation.
        return <AccountTab key={selected.id} organisationId={selected.id} />
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
                "Default pricing tier: every member is put in that tier's customer group (when they join, and when the tier is set).",
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
            <Input
              value={nName}
              onChange={(e) => {
                setNName(e.target.value)
                // Fill the handle from the name until staff type their own.
                if (!handleTouched) {
                  setNHandle(
                    e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
                  )
                }
              }}
            />
          </div>
          <div>
            <Label size="xsmall">Handle * (url-safe)</Label>
            <Input
              value={nHandle}
              onChange={(e) => {
                setNHandle(e.target.value)
                setHandleTouched(true)
              }}
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
            <TierSelect value={nTier} onChange={(slug) => setNTier(slug ?? "")} />
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
                    "account",
                    "brand_kit",
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
  nested: "/customers",
  label: "Organisations",
  icon: tinted(BuildingStorefront, NAV_COLOR.crm),
  rank: 50,
})

export default OrganisationsPage
