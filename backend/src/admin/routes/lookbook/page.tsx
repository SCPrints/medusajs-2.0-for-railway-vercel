import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { HelpTooltip } from "../../components/reports/help-tooltip"
import { LookbookProductPicker } from "../../components/lookbook/product-picker"

type Item = {
  id: string
  title: string
  description: string | null
  image_url: string
  order_id: string | null
  product_handles: { handles?: string[] }
  product_ids: { ids?: string[] }
  tags: { values?: string[] }
  attribution: string | null
  is_published: boolean
  weight: number
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const v = r.result
      if (typeof v === "string") resolve(v)
      else reject(new Error("FileReader returned non-string"))
    }
    r.onerror = reject
    r.readAsDataURL(file)
  })

const PAGE_SIZE = 24

type FormState = {
  title: string
  description: string
  tagsCsv: string
  attribution: string
  orderId: string
  weight: string
  productHandles: string[]
  file: File | null
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  tagsCsv: "",
  attribution: "",
  orderId: "",
  weight: "0",
  productHandles: [],
  file: null,
}

const LookbookPage = () => {
  const [items, setItems] = useState<Item[]>([])
  const [count, setCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  // null = creating a new tile; an id = editing that tile.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Current image of the tile being edited (so staff see it before replacing).
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true)
    try {
      const res = await fetch(
        `/admin/lookbook?include_unpublished=true&limit=${PAGE_SIZE}&offset=${nextOffset}`,
        { credentials: "include" }
      )
      const json = (await res.json()) as { items?: Item[]; count?: number }
      const total = json.count ?? 0
      // If this page is now empty (e.g. deleted the last tile on it), step back.
      if (nextOffset > 0 && (json.items?.length ?? 0) === 0 && total > 0) {
        const prev = Math.max(nextOffset - PAGE_SIZE, 0)
        setOffset(prev)
        return load(prev)
      }
      setItems(json.items ?? [])
      setCount(total)
      setOffset(nextOffset)
    } catch {
      toast.error("Failed to load lookbook")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(0)
  }, [load])

  const closeForm = () => {
    setOpen(false)
    setEditingId(null)
    setEditingImageUrl(null)
    setForm(EMPTY_FORM)
  }

  const openCreate = () => {
    setEditingId(null)
    setEditingImageUrl(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  const openEdit = (item: Item) => {
    setEditingId(item.id)
    setEditingImageUrl(item.image_url)
    setForm({
      title: item.title,
      description: item.description ?? "",
      tagsCsv: (item.tags?.values ?? []).join(", "),
      attribution: item.attribution ?? "",
      orderId: item.order_id ?? "",
      weight: String(item.weight ?? 0),
      productHandles: item.product_handles?.handles ?? [],
      file: null,
    })
    setOpen(true)
    // Bring the form into view — the grid can be long.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Title required")
      return
    }
    // Image is required to CREATE a tile, optional when editing (keep existing).
    if (!editingId && !form.file) {
      toast.error("Pick an image")
      return
    }
    setSaving(true)
    try {
      const tags = form.tagsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const weight = parseInt(form.weight, 10)
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        attribution: form.attribution.trim() || undefined,
        order_id: form.orderId.trim() || undefined,
        product_handles: form.productHandles,
        tags,
        weight: Number.isFinite(weight) ? weight : 0,
      }
      if (form.file) {
        const dataUrl = await fileToDataUrl(form.file)
        payload.image_data_base64 = dataUrl
        payload.image_filename = form.file.name
        payload.image_mime_type = form.file.type
      }

      const url = editingId ? `/admin/lookbook/${editingId}` : "/admin/lookbook"
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(editingId ? "Updated" : "Saved")
      closeForm()
      // Editing keeps you on the current page; creating jumps to the top.
      await load(editingId ? offset : 0)
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const togglePublished = async (item: Item) => {
    try {
      await fetch(`/admin/lookbook/${item.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: !item.is_published }),
      })
      await load(offset)
    } catch {
      toast.error("Update failed")
    }
  }

  const remove = async (item: Item) => {
    if (!confirm("Delete this lookbook tile?")) return
    try {
      await fetch(`/admin/lookbook/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (editingId === item.id) closeForm()
      await load(offset)
    } catch {
      toast.error("Delete failed")
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1" className="flex items-center">
          Lookbook
          <HelpTooltip
            text={{
              title: "Lookbook (public gallery)",
              body: "Curated photos of real SC PRINTS jobs, rendered as a Pinterest-style grid on /lookbook (and the sphere/cube galleries). Use it to soft-sell the outcome (a tagged hoodie on a real player) rather than the blank.",
              bullets: [
                "Each tile has a title, photo, optional description + attribution.",
                "Tag tiles by theme (sports, corporate, school, embroidery) — the public page shows tags as filter chips.",
                "Link a tile to the actual garment(s): the storefront 'Start a job like this' CTA deep-links to the first linked product's page. Products are referenced by handle, so links survive re-imports.",
                "Edit any tile to change its details, swap the photo, re-order or change its linked products.",
                "Toggle Published to hide a tile without deleting it.",
                "Weight controls order (lower = earlier); 0 is the default.",
              ],
            }}
          />
        </Heading>
        <div className="flex items-center gap-x-2">
          <Badge color="blue">{count} tiles</Badge>
          <Button size="small" onClick={() => (open ? closeForm() : openCreate())}>
            {open ? "Cancel" : "New tile"}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="px-6 py-4 border-b border-ui-border-base">
          <div className="mb-3 flex items-center gap-x-2">
            <Text weight="plus" size="small">
              {editingId ? "Edit tile" : "New tile"}
            </Text>
            {editingId ? (
              <Badge size="2xsmall" color="grey">
                {editingId}
              </Badge>
            ) : null}
          </div>
          <div className="grid grid-cols-1 small:grid-cols-2 gap-3">
            <div>
              <Label size="xsmall">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="e.g. Marrickville Lions 2026 hoodies"
              />
            </div>
            <div>
              <Label size="xsmall">Attribution</Label>
              <Input
                value={form.attribution}
                onChange={(e) => setField("attribution", e.target.value)}
                placeholder="Photo by …"
              />
            </div>
            <div className="small:col-span-2">
              <Label size="xsmall">Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>
            <div>
              <Label size="xsmall">Tags (comma separated)</Label>
              <Input
                value={form.tagsCsv}
                onChange={(e) => setField("tagsCsv", e.target.value)}
                placeholder="sports, hoodie, embroidery"
              />
            </div>
            <div>
              <Label size="xsmall">Order ID (optional)</Label>
              <Input
                value={form.orderId}
                onChange={(e) => setField("orderId", e.target.value)}
                placeholder="ord_..."
              />
            </div>
            <div>
              <Label size="xsmall">Weight (lower = earlier)</Label>
              <Input
                type="number"
                value={form.weight}
                onChange={(e) => setField("weight", e.target.value)}
              />
            </div>
            <div className="small:col-span-2">
              <Label size="xsmall">Linked products</Label>
              <LookbookProductPicker
                value={form.productHandles}
                onChange={(next) => setField("productHandles", next)}
              />
            </div>
            <div className="small:col-span-2">
              <Label size="xsmall">
                {editingId ? "Replace image (optional)" : "Image *"}
              </Label>
              {editingId && editingImageUrl ? (
                <div className="mb-2 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={editingImageUrl}
                    alt="Current"
                    className="h-16 w-16 rounded-md border border-ui-border-base object-cover"
                  />
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Current photo — leave the picker empty to keep it.
                  </Text>
                </div>
              ) : null}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setField("file", e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </div>
            <div className="small:col-span-2 flex justify-end gap-x-2">
              <Button
                size="small"
                variant="secondary"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="small" onClick={submit} disabled={saving}>
                {editingId ? "Save changes" : "Save tile"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="px-6 py-4">
        {loading ? (
          <Text size="xsmall" className="text-ui-fg-muted">Loading…</Text>
        ) : items.length === 0 ? (
          <Text size="xsmall" className="text-ui-fg-muted">
            No tiles yet. Click <em>New tile</em> to add the first one.
          </Text>
        ) : (
          <ul className="grid grid-cols-2 small:grid-cols-3 large:grid-cols-4 gap-3">
            {items.map((item) => {
              const linkedCount = item.product_handles?.handles?.length ?? 0
              return (
                <li
                  key={item.id}
                  className="rounded-md border border-ui-border-base bg-ui-bg-base overflow-hidden"
                >
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="h-40 w-full object-cover"
                  />
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <Text weight="plus" size="small" className="truncate">
                        {item.title}
                      </Text>
                      {item.is_published ? (
                        <Badge color="green">On</Badge>
                      ) : (
                        <Badge color="grey">Off</Badge>
                      )}
                    </div>
                    {linkedCount > 0 ? (
                      <Text size="xsmall" className="mt-1 text-ui-fg-muted">
                        {linkedCount} linked product{linkedCount === 1 ? "" : "s"}
                      </Text>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="text-ui-fg-interactive underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePublished(item)}
                        className="text-ui-fg-base underline"
                      >
                        {item.is_published ? "Hide" : "Publish"}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(item)}
                        className="text-ui-fg-muted hover:text-ui-tag-red-icon"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {count > PAGE_SIZE ? (
          <div className="mt-4 flex items-center justify-between border-t border-ui-border-base pt-4">
            <Text size="xsmall" className="text-ui-fg-muted">
              {`${offset + 1}–${Math.min(offset + items.length, count)} of ${count}`}
            </Text>
            <div className="flex items-center gap-x-2">
              <Button
                size="small"
                variant="secondary"
                disabled={loading || offset === 0}
                onClick={() => load(Math.max(offset - PAGE_SIZE, 0))}
              >
                Previous
              </Button>
              <Button
                size="small"
                variant="secondary"
                disabled={loading || offset + PAGE_SIZE >= count}
                onClick={() => load(offset + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Container>
  )
}

// Page is now embedded as "Lookbook" tab in Studio & Lookbook;
// direct URL /app/lookbook still works for deep links

export default LookbookPage
