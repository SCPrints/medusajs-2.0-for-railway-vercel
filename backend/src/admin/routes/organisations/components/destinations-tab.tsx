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

export type OrganisationDestination = {
  id: string
  organisation_id: string
  name: string
  code: string | null
  address_1: string
  address_2: string | null
  city: string
  province: string | null
  postal_code: string
  country_code: string
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  delivery_notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

type EditorState = {
  open: boolean
  editingId: string | null
  name: string
  code: string
  address_1: string
  address_2: string
  city: string
  province: string
  postal_code: string
  country_code: string
  contact_name: string
  contact_phone: string
  contact_email: string
  delivery_notes: string
  isActive: boolean
  saving: boolean
}

const emptyEditor = (): EditorState => ({
  open: false,
  editingId: null,
  name: "",
  code: "",
  address_1: "",
  address_2: "",
  city: "",
  province: "",
  postal_code: "",
  country_code: "au",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  delivery_notes: "",
  isActive: true,
  saving: false,
})

type Props = {
  organisationId: string
  onCountChange?: (count: number) => void
}

const DestinationsTab = ({ organisationId, onCountChange }: Props) => {
  const [destinations, setDestinations] = useState<OrganisationDestination[]>(
    []
  )
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editor, setEditor] = useState<EditorState>(emptyEditor())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/admin/organisations/${organisationId}/destinations`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(await res.text())
      const json = (await res.json()) as {
        destinations?: OrganisationDestination[]
      }
      const list = json.destinations ?? []
      setDestinations(list)
      onCountChange?.(list.filter((d) => d.is_active).length)
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load destinations")
    } finally {
      setLoading(false)
    }
  }, [organisationId, onCountChange])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => setEditor({ ...emptyEditor(), open: true })

  const openEdit = (d: OrganisationDestination) =>
    setEditor({
      open: true,
      editingId: d.id,
      name: d.name,
      code: d.code ?? "",
      address_1: d.address_1,
      address_2: d.address_2 ?? "",
      city: d.city,
      province: d.province ?? "",
      postal_code: d.postal_code,
      country_code: d.country_code,
      contact_name: d.contact_name ?? "",
      contact_phone: d.contact_phone ?? "",
      contact_email: d.contact_email ?? "",
      delivery_notes: d.delivery_notes ?? "",
      isActive: d.is_active,
      saving: false,
    })

  const closeEditor = () => setEditor(emptyEditor())

  const submitEditor = async () => {
    if (!editor.name.trim()) return toast.error("Name required")
    if (!editor.address_1.trim()) return toast.error("Address line 1 required")
    if (!editor.city.trim()) return toast.error("City required")
    if (!editor.postal_code.trim()) return toast.error("Postal code required")
    setEditor((e) => ({ ...e, saving: true }))
    const body = {
      name: editor.name.trim(),
      code: editor.code.trim() || null,
      address_1: editor.address_1.trim(),
      address_2: editor.address_2.trim() || null,
      city: editor.city.trim(),
      province: editor.province.trim() || null,
      postal_code: editor.postal_code.trim(),
      country_code: editor.country_code.trim().toLowerCase() || "au",
      contact_name: editor.contact_name.trim() || null,
      contact_phone: editor.contact_phone.trim() || null,
      contact_email: editor.contact_email.trim() || null,
      delivery_notes: editor.delivery_notes.trim() || null,
      is_active: editor.isActive,
    }
    const url = editor.editingId
      ? `/admin/organisations/${organisationId}/destinations/${editor.editingId}`
      : `/admin/organisations/${organisationId}/destinations`
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(editor.editingId ? "Destination updated" : "Destination created")
      closeEditor()
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed")
      setEditor((e) => ({ ...e, saving: false }))
    }
  }

  const deactivate = async (d: OrganisationDestination) => {
    if (
      !window.confirm(
        `Deactivate ${d.name}? Existing orders shipping here are unaffected.`
      )
    )
      return
    try {
      await fetch(
        `/admin/organisations/${organisationId}/destinations/${d.id}`,
        { method: "DELETE", credentials: "include" }
      )
      toast.success("Deactivated")
      await load()
    } catch {
      toast.error("Deactivate failed")
    }
  }

  const visible = showInactive
    ? destinations
    : destinations.filter((d) => d.is_active)

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <Text size="small" className="text-ui-fg-subtle">
          Ship-to addresses in this org's store network. Used by the fulfillment
          order entry form.
        </Text>
        <div className="flex items-center gap-x-2">
          <Switch
            id="show-inactive-destinations"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive-destinations" size="xsmall">
            Show inactive
          </Label>
          <Button size="small" onClick={openCreate}>
            + Add destination
          </Button>
        </div>
      </div>

      {editor.open ? (
        <Container className="border border-ui-border-base p-4 flex flex-col gap-y-3">
          <Heading level="h3" className="text-base">
            {editor.editingId ? "Edit destination" : "New destination"}
          </Heading>
          <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
            <div>
              <Label size="xsmall">Name *</Label>
              <Input
                value={editor.name}
                onChange={(e) => setEditor((s) => ({ ...s, name: e.target.value }))}
                placeholder="Lifegrain Sutherland Hospital"
              />
            </div>
            <div>
              <Label size="xsmall">Code</Label>
              <Input
                value={editor.code}
                onChange={(e) => setEditor((s) => ({ ...s, code: e.target.value }))}
                placeholder="SUTH-HOSP"
              />
            </div>
            <div>
              <Label size="xsmall">Address line 1 *</Label>
              <Input
                value={editor.address_1}
                onChange={(e) => setEditor((s) => ({ ...s, address_1: e.target.value }))}
              />
            </div>
            <div>
              <Label size="xsmall">Address line 2</Label>
              <Input
                value={editor.address_2}
                onChange={(e) => setEditor((s) => ({ ...s, address_2: e.target.value }))}
              />
            </div>
            <div>
              <Label size="xsmall">City *</Label>
              <Input
                value={editor.city}
                onChange={(e) => setEditor((s) => ({ ...s, city: e.target.value }))}
              />
            </div>
            <div>
              <Label size="xsmall">State / province</Label>
              <Input
                value={editor.province}
                onChange={(e) => setEditor((s) => ({ ...s, province: e.target.value }))}
                placeholder="NSW"
              />
            </div>
            <div>
              <Label size="xsmall">Postal code *</Label>
              <Input
                value={editor.postal_code}
                onChange={(e) => setEditor((s) => ({ ...s, postal_code: e.target.value }))}
              />
            </div>
            <div>
              <Label size="xsmall">Country code</Label>
              <Input
                value={editor.country_code}
                onChange={(e) => setEditor((s) => ({ ...s, country_code: e.target.value }))}
              />
            </div>
            <div>
              <Label size="xsmall">Contact name</Label>
              <Input
                value={editor.contact_name}
                onChange={(e) => setEditor((s) => ({ ...s, contact_name: e.target.value }))}
              />
            </div>
            <div>
              <Label size="xsmall">Contact phone</Label>
              <Input
                value={editor.contact_phone}
                onChange={(e) => setEditor((s) => ({ ...s, contact_phone: e.target.value }))}
              />
            </div>
            <div className="small:col-span-2">
              <Label size="xsmall">Contact email</Label>
              <Input
                value={editor.contact_email}
                onChange={(e) => setEditor((s) => ({ ...s, contact_email: e.target.value }))}
              />
            </div>
            <div className="small:col-span-2">
              <Label size="xsmall">Delivery notes</Label>
              <Textarea
                rows={2}
                value={editor.delivery_notes}
                onChange={(e) => setEditor((s) => ({ ...s, delivery_notes: e.target.value }))}
                placeholder="Gate code: 2200. Receiving 7am-3pm Mon-Fri."
              />
            </div>
            <div className="flex items-end gap-x-2 small:col-span-2">
              <Switch
                id="destination-active"
                checked={editor.isActive}
                onCheckedChange={(v) => setEditor((s) => ({ ...s, isActive: v }))}
              />
              <Label htmlFor="destination-active">Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-x-2">
            <Button size="small" variant="secondary" onClick={closeEditor} disabled={editor.saving}>
              Cancel
            </Button>
            <Button size="small" onClick={submitEditor} disabled={editor.saving}>
              {editor.saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </Container>
      ) : null}

      {loading ? (
        <Text className="text-ui-fg-muted text-sm">Loading destinations…</Text>
      ) : visible.length === 0 ? (
        <Container className="flex flex-col items-center gap-y-2 py-8 bg-ui-bg-subtle/40">
          <Text className="text-ui-fg-muted text-sm">No destinations yet.</Text>
          <Text size="xsmall" className="text-ui-fg-muted">
            Click "+ Add destination" to add an address.
          </Text>
        </Container>
      ) : (
        <Container className="p-0 overflow-hidden">
          <div className="flex items-center gap-x-3 px-4 py-2 border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle text-xs font-medium uppercase tracking-wide">
            <span className="flex-1">Name</span>
            <span className="w-32">Code</span>
            <span className="w-40">City</span>
            <span className="w-16 text-center">Active</span>
            <span className="w-32 text-right">Actions</span>
          </div>
          {visible.map((d) => (
            <div
              key={d.id}
              className={`flex items-center gap-x-3 px-4 py-3 border-b border-ui-border-base last:border-b-0 hover:bg-ui-bg-subtle/30 transition ${d.is_active ? "" : "opacity-60"}`}
            >
              <div className="flex-1 min-w-0">
                <Text weight="plus" size="small" className="truncate">
                  {d.name}
                </Text>
                <Text size="xsmall" className="text-ui-fg-muted truncate">
                  {d.address_1}
                  {d.address_2 ? `, ${d.address_2}` : ""}
                </Text>
              </div>
              <div className="w-32 text-sm font-mono truncate text-ui-fg-subtle">
                {d.code ?? "—"}
              </div>
              <div className="w-40 text-sm truncate">
                {d.city}
                {d.province ? `, ${d.province}` : ""}
              </div>
              <div className="w-16 text-center">
                {d.is_active ? (
                  <Badge color="green" size="2xsmall">
                    Yes
                  </Badge>
                ) : (
                  <Badge color="grey" size="2xsmall">
                    No
                  </Badge>
                )}
              </div>
              <div className="w-32 text-right flex justify-end gap-x-2">
                <button
                  type="button"
                  onClick={() => openEdit(d)}
                  className="text-xs text-ui-fg-interactive hover:underline"
                >
                  Edit
                </button>
                {d.is_active ? (
                  <button
                    type="button"
                    onClick={() => deactivate(d)}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Deactivate
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </Container>
      )}
    </div>
  )
}

export default DestinationsTab
