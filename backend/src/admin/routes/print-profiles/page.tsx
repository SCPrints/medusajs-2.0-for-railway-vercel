import { tinted, NAV_COLOR } from "../../lib/nav-tint"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Text,
  Textarea,
} from "@medusajs/ui"
import { ArrowPath, Plus, PencilSquare, Trash, Swatch } from "@medusajs/icons"
import { useCallback, useEffect, useMemo, useState } from "react"
import { HelpTooltip } from "../../components/reports/help-tooltip"
import {
  AreaRow,
  BLANK_AREA,
  SIDE_LABEL,
  areaSummary,
  type Area,
} from "../../components/print-profile/area-editor"

type Profile = {
  id: string
  name: string
  handle: string
  description: string | null
  is_system: boolean
  position: number
  areas: Area[]
}
type Draft = {
  name: string
  handle: string
  description: string
  areas: Area[]
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const BLANK_DRAFT: Draft = { name: "", handle: "", description: "", areas: [] }

const profileToDraft = (p: Profile): Draft => ({
  name: p.name,
  handle: p.handle,
  description: p.description ?? "",
  areas: (p.areas ?? []).map((a) => ({
    key: a.key,
    label: a.label,
    methods: [...(a.methods ?? [])],
    sizes: [...(a.sizes ?? [])],
    ...(a.max_prints ? { max_prints: a.max_prints } : {}),
  })),
})

/* ── create / edit drawer ── */

const ProfileDrawer = ({
  open,
  onClose,
  edit,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  edit: Profile | null
  onSaved: () => void
}) => {
  const [draft, setDraft] = useState<Draft>(BLANK_DRAFT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(edit ? profileToDraft(edit) : { ...BLANK_DRAFT, areas: [{ ...BLANK_AREA }] })
      setError(null)
    }
  }, [open, edit])

  useEffect(() => {
    if (!edit && draft.name && !draft.handle) {
      setDraft((d) => ({ ...d, handle: slugify(d.name) }))
    }
  }, [draft.name, draft.handle, edit])

  const addArea = () => setDraft((d) => ({ ...d, areas: [...d.areas, { ...BLANK_AREA }] }))
  const updateArea = (idx: number, a: Area) =>
    setDraft((d) => {
      const areas = [...d.areas]
      areas[idx] = a
      return { ...d, areas }
    })
  const removeArea = (idx: number) =>
    setDraft((d) => ({ ...d, areas: d.areas.filter((_, i) => i !== idx) }))

  const submit = async () => {
    if (!draft.name.trim()) {
      setError("Name is required.")
      return
    }
    for (const a of draft.areas) {
      if (!a.methods.length) {
        setError(`${SIDE_LABEL[a.key] ?? a.key}: pick at least one technique.`)
        return
      }
      if (!a.sizes.length) {
        setError(`${SIDE_LABEL[a.key] ?? a.key}: pick at least one size.`)
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      const url = edit ? `/admin/print-profiles/${edit.id}` : "/admin/print-profiles"
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: draft.name.trim(),
          handle: draft.handle.trim() || undefined,
          description: draft.description.trim() || null,
          areas: draft.areas.map((a) => ({
            key: a.key,
            label: a.label || SIDE_LABEL[a.key] || a.key,
            methods: a.methods,
            sizes: a.sizes,
            ...(a.max_prints ? { max_prints: a.max_prints } : {}),
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`)
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Drawer.Content className="max-w-xl">
        <Drawer.Header>
          <Drawer.Title>{edit ? "Edit print profile" : "New print profile"}</Drawer.Title>
          <Drawer.Description>
            Defines which locations a garment can be printed on, and per location
            which techniques + sizes are allowed. Products assigned this profile
            inherit these rules in the customizer.
          </Drawer.Description>
        </Drawer.Header>

        <Drawer.Body className="overflow-auto">
          <div className="flex flex-col gap-y-4 p-1">
            {edit?.is_system ? (
              <Badge size="2xsmall" color="blue">
                System profile — edits apply to every product on it.
              </Badge>
            ) : null}

            <div className="flex flex-col gap-y-1">
              <Label className="text-xs">Name *</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.currentTarget.value }))}
                placeholder="e.g. Short Sleeve Garment"
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label className="text-xs">Handle</Label>
              <Input
                value={draft.handle}
                onChange={(e) => setDraft((d) => ({ ...d, handle: e.currentTarget.value }))}
                placeholder="auto from name"
                disabled={Boolean(edit?.is_system)}
              />
              <Text size="xsmall" className="text-ui-fg-muted">
                Products reference this handle. Avoid changing it after products
                are assigned.
              </Text>
            </div>

            <div className="flex flex-col gap-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.currentTarget.value }))}
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Print locations</Label>
                <Button size="small" variant="secondary" onClick={addArea}>
                  <Plus className="mr-1" /> Add location
                </Button>
              </div>
              {draft.areas.length === 0 ? (
                <Text size="xsmall" className="text-ui-fg-muted">
                  No locations — this garment won&rsquo;t be customisable. Add at
                  least one.
                </Text>
              ) : (
                <div className="flex flex-col gap-y-2">
                  {draft.areas.map((area, idx) => (
                    <AreaRow
                      key={idx}
                      area={area}
                      onChange={(a) => updateArea(idx, a)}
                      onRemove={() => removeArea(idx)}
                    />
                  ))}
                </div>
              )}
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
            {edit ? "Save changes" : "Create profile"}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

/* ── list row ── */

const ProfileRow = ({
  profile,
  onEdit,
  onDelete,
}: {
  profile: Profile
  onEdit: () => void
  onDelete: () => void
}) => (
  <div className="flex items-center gap-x-4 px-4 py-3 border-b border-ui-border-base last:border-b-0 hover:bg-ui-bg-subtle/30 transition">
    <div className="flex flex-col flex-1 min-w-0">
      <Text size="small" className="font-medium truncate">
        {profile.name}
        {profile.is_system ? (
          <Badge size="2xsmall" color="blue" className="ml-2">
            system
          </Badge>
        ) : null}
      </Text>
      <Text size="xsmall" className="text-ui-fg-muted truncate">
        {profile.handle} · {areaSummary(profile.areas)}
      </Text>
    </div>
    <div className="flex items-center gap-x-1 shrink-0">
      <Button size="small" variant="transparent" onClick={onEdit}>
        <PencilSquare />
      </Button>
      {!profile.is_system ? (
        <Button
          size="small"
          variant="transparent"
          onClick={onDelete}
          className="text-ui-fg-muted hover:text-ui-tag-red-icon"
        >
          <Trash />
        </Button>
      ) : null}
    </div>
  </div>
)

const PrintProfilesPage = () => {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [edit, setEdit] = useState<Profile | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/admin/print-profiles", { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setProfiles(data.print_profiles ?? [])
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sorted = useMemo(
    () => [...profiles].sort((a, b) => a.position - b.position),
    [profiles]
  )

  const handleDelete = async (p: Profile) => {
    if (!window.confirm(`Delete "${p.name}"? Products on it fall back to automatic rules.`))
      return
    try {
      const res = await fetch(`/admin/print-profiles/${p.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.message ?? `HTTP ${res.status}`)
      }
      setProfiles((prev) => prev.filter((x) => x.id !== p.id))
    } catch (err: any) {
      window.alert(`Delete failed: ${err?.message ?? err}`)
    }
  }

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex items-start justify-between">
        <div>
          <Heading level="h1" className="flex items-center">
            Print profiles
            <HelpTooltip
              text={{
                title: "Print profiles",
                body: "Reusable rules for what can be printed where, with which technique, at what size. Assign a profile to products on the product page or in Product data → bulk; the storefront customizer enforces it. This replaces the old invisible rules that were guessed from the product title/tags.",
                bullets: [
                  "Locations: front, back, sleeves, neck tag — pick the ones this garment supports.",
                  "Techniques: per location, allow Print (DTF) and/or Embroidery.",
                  "Sizes: per location, the print-size tiles the customer can pick (A6 / A4 / A3 / Oversize).",
                  "System profiles (Short Sleeve, Long Sleeve, etc.) can be edited — changes apply to every product on them — but not deleted.",
                  "Full-custom: a single product can override its profile with its own locations on the product page.",
                ],
              }}
            />
          </Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            What each garment can be printed on, and with what technique + size.
            The customizer reads these — products are assigned a profile on the
            product page or via Product data.
          </Text>
        </div>
        <div className="flex items-center gap-x-2">
          <Button size="small" variant="secondary" onClick={load} disabled={loading}>
            <ArrowPath className="mr-1" /> Refresh
          </Button>
          <Button
            size="small"
            onClick={() => {
              setEdit(null)
              setDrawerOpen(true)
            }}
          >
            <Plus className="mr-1" /> New profile
          </Button>
        </div>
      </Container>

      {error ? (
        <Container>
          <Text className="text-ui-tag-red-icon">Failed to load: {error}</Text>
        </Container>
      ) : null}

      {!loading && profiles.length === 0 && !error ? (
        <Container className="flex flex-col items-center gap-y-3 py-12">
          <Text className="text-ui-fg-muted">
            No profiles yet. Run the seed script (seed-print-profiles) or create one.
          </Text>
          <Button
            size="small"
            onClick={() => {
              setEdit(null)
              setDrawerOpen(true)
            }}
          >
            <Plus className="mr-1" /> Create a profile
          </Button>
        </Container>
      ) : null}

      {sorted.length > 0 ? (
        <Container className="p-0 overflow-hidden">
          {sorted.map((profile) => (
            <ProfileRow
              key={profile.id}
              profile={profile}
              onEdit={() => {
                setEdit(profile)
                setDrawerOpen(true)
              }}
              onDelete={() => handleDelete(profile)}
            />
          ))}
        </Container>
      ) : null}

      <ProfileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        edit={edit}
        onSaved={load}
      />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Print profiles",
  icon: tinted(Swatch, NAV_COLOR.catalog),
  rank: 33,
})

export default PrintProfilesPage
