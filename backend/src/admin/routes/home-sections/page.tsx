import { defineRouteConfig } from "@medusajs/admin-sdk"
import { SquaresPlus } from "@medusajs/icons"
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
import { HomeSectionProductPicker } from "../../components/home-section/product-picker"

type Section = {
  id: string
  handle: string
  title: string
  subtitle: string | null
  product_handles: string[]
  is_published: boolean
  weight: number
}

type Draft = {
  title: string
  subtitle: string
  weight: string
  product_handles: string[]
}

const emptyDraft: Draft = {
  title: "",
  subtitle: "",
  weight: "0",
  product_handles: [],
}

const HomeSectionsPage = () => {
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        "/admin/home-sections?include_unpublished=true",
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setSections(data.sections ?? [])
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const startCreate = () => {
    setEditingId(null)
    setCreating(true)
    setDraft(emptyDraft)
  }

  const startEdit = (s: Section) => {
    setCreating(false)
    setEditingId(s.id)
    setDraft({
      title: s.title,
      subtitle: s.subtitle ?? "",
      weight: String(s.weight),
      product_handles: s.product_handles ?? [],
    })
  }

  const cancel = () => {
    setEditingId(null)
    setCreating(false)
    setDraft(emptyDraft)
  }

  const save = async () => {
    if (!draft.title.trim()) {
      toast.error("Title is required")
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim() || undefined,
        weight: Number(draft.weight) || 0,
        product_handles: draft.product_handles,
      }
      const url = editingId
        ? `/admin/home-sections/${editingId}`
        : "/admin/home-sections"
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(editingId ? "Section updated" : "Section created")
      cancel()
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const togglePublished = async (s: Section) => {
    try {
      const res = await fetch(`/admin/home-sections/${s.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: !s.is_published }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? "Failed")
    }
  }

  const remove = async (s: Section) => {
    if (!confirm(`Delete the “${s.title}” section? This cannot be undone.`)) {
      return
    }
    try {
      const res = await fetch(`/admin/home-sections/${s.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success("Deleted")
      if (editingId === s.id) cancel()
      await load()
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed")
    }
  }

  const formOpen = creating || editingId !== null

  return (
    <Container className="flex flex-col gap-4 p-0">
      <div className="flex items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-2">
          <Heading level="h1">Home page sections</Heading>
          <HelpTooltip
            text={{
              title: "Home page sections",
              body: "Curated product rows shown on the storefront home page, top to bottom in weight order (lower weight = higher on the page).",
              bullets: [
                "Each section has its own title, optional subtitle, and a hand-picked, reorderable list of products and/or bundles.",
                "Products and bundles are referenced by handle, so they survive supplier re-imports.",
                "Unpublished sections are hidden from the storefront but kept here.",
                "A product flagged “Unresolved” no longer exists in the catalog — the storefront skips it; remove or replace it.",
              ],
            }}
          />
        </div>
        {!formOpen ? (
          <Button variant="primary" size="small" onClick={startCreate}>
            New section
          </Button>
        ) : null}
      </div>

      {/* Editor */}
      {formOpen ? (
        <div className="mx-6 flex flex-col gap-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle p-5">
          <Heading level="h2">
            {editingId ? "Edit section" : "New section"}
          </Heading>

          <div className="flex flex-col gap-1.5">
            <Label size="small">Title</Label>
            <Input
              value={draft.title}
              placeholder="e.g. Popular garments to start your order"
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label size="small">Subtitle / eyebrow (optional)</Label>
            <Textarea
              value={draft.subtitle}
              rows={2}
              placeholder="Short supporting line shown under or above the title"
              onChange={(e) =>
                setDraft((d) => ({ ...d, subtitle: e.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Label size="small">Weight</Label>
              <HelpTooltip text="Lower numbers appear higher on the home page. Ties keep their existing order." />
            </div>
            <Input
              type="number"
              className="w-28"
              value={draft.weight}
              onChange={(e) =>
                setDraft((d) => ({ ...d, weight: e.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label size="small">Products</Label>
            <HomeSectionProductPicker
              value={draft.product_handles}
              onChange={(next) =>
                setDraft((d) => ({ ...d, product_handles: next }))
              }
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} isLoading={saving}>
              {editingId ? "Save changes" : "Create section"}
            </Button>
            <Button variant="secondary" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {/* List */}
      <div className="flex flex-col gap-3 px-6 pb-6">
        {loading ? (
          <Text className="text-ui-fg-muted">Loading…</Text>
        ) : sections.length === 0 ? (
          <Text className="text-ui-fg-muted">
            No home sections yet. Create one to control what shows on the home
            page — until then the home page falls back to its default products.
          </Text>
        ) : (
          sections.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-4"
            >
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Text weight="plus" className="text-ui-fg-base">
                    {s.title}
                  </Text>
                  {s.is_published ? (
                    <Badge size="2xsmall" color="green">
                      Published
                    </Badge>
                  ) : (
                    <Badge size="2xsmall" color="grey">
                      Hidden
                    </Badge>
                  )}
                  <Badge size="2xsmall" color="blue">
                    weight {s.weight}
                  </Badge>
                </div>
                {s.subtitle ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    {s.subtitle}
                  </Text>
                ) : null}
                <Text size="xsmall" className="text-ui-fg-muted">
                  {s.product_handles.length} item
                  {s.product_handles.length === 1 ? "" : "s"} · /{s.handle}
                </Text>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={s.is_published}
                    onCheckedChange={() => togglePublished(s)}
                  />
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {s.is_published ? "Live" : "Off"}
                  </Text>
                </div>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => startEdit(s)}
                >
                  Edit
                </Button>
                <Button
                  variant="transparent"
                  size="small"
                  onClick={() => remove(s)}
                  className="text-ui-fg-muted hover:text-ui-tag-red-icon"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Home Sections",
  icon: SquaresPlus,
})

export default HomeSectionsPage
