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
  Select,
  Switch,
  Text,
  Textarea,
} from "@medusajs/ui"
import { ArrowPath, Plus, PencilSquare, Trash, ShoppingCart } from "@medusajs/icons"
import { useCallback, useEffect, useMemo, useState } from "react"
import { HelpTooltip } from "../../components/reports/help-tooltip"
import { slugifyBundleHandle } from "../../lib/bundle-handle"

type PrintPosition = {
  side: string
  method: "print" | "embroidery"
  size_id?: string
  stitch_count?: number
  width_mm?: number
  height_mm?: number
}

type Choice = { label: string; product_handle: string }

type BundleItem = {
  id: string
  bundle_id: string
  product_handle: string
  label: string
  quantity_per_unit: number
  decoration_type: "embroidery" | "print" | "none"
  position: number
  print_positions: { positions?: PrintPosition[] } | null
  choices: { options?: Choice[] } | null
}

type Bundle = {
  id: string
  title: string
  handle: string
  subtitle: string | null
  status: "active" | "draft"
  thumbnail_url: string | null
  quantity_multiplier_label: string | null
  discount_pct: number
  items: BundleItem[]
  created_at: string
  updated_at: string
}

type ItemDraft = {
  product_handle: string
  label: string
  quantity_per_unit: number
  decoration_type: "embroidery" | "print" | "none"
  position: number
  positions: PrintPosition[]
  choices: Choice[]
}

type BundleDraft = {
  title: string
  handle: string
  subtitle: string
  status: "active" | "draft"
  thumbnail_url: string
  quantity_multiplier_label: string
  discount_pct: number
  items: ItemDraft[]
}

const BLANK_ITEM: ItemDraft = {
  product_handle: "",
  label: "",
  quantity_per_unit: 1,
  decoration_type: "embroidery",
  position: 0,
  positions: [{ side: "front", method: "embroidery", stitch_count: 4000, width_mm: 90, height_mm: 60 }],
  choices: [],
}

const BLANK_DRAFT: BundleDraft = {
  title: "",
  handle: "",
  subtitle: "",
  status: "active",
  thumbnail_url: "",
  quantity_multiplier_label: "",
  discount_pct: 0,
  items: [],
}

const bundleToDraft = (bundle: Bundle): BundleDraft => ({
  title: bundle.title,
  handle: bundle.handle,
  subtitle: bundle.subtitle ?? "",
  status: bundle.status,
  thumbnail_url: bundle.thumbnail_url ?? "",
  quantity_multiplier_label: bundle.quantity_multiplier_label ?? "",
  discount_pct: bundle.discount_pct ?? 0,
  items: (bundle.items ?? [])
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      product_handle: i.product_handle,
      label: i.label,
      quantity_per_unit: i.quantity_per_unit,
      decoration_type: i.decoration_type,
      position: i.position,
      positions: i.print_positions?.positions ?? defaultPositionsFor(i.decoration_type),
      choices: i.choices?.options ?? [],
    })),
})

const draftToPayload = (draft: BundleDraft) => ({
  title: draft.title.trim(),
  handle: draft.handle.trim() || undefined,
  subtitle: draft.subtitle.trim() || null,
  status: draft.status,
  thumbnail_url: draft.thumbnail_url.trim() || null,
  quantity_multiplier_label: draft.quantity_multiplier_label.trim() || null,
  discount_pct: draft.discount_pct,
  items: draft.items.map((item, idx) => ({
    product_handle: item.product_handle.trim(),
    label: item.label.trim(),
    quantity_per_unit: item.quantity_per_unit,
    // Summary label for older views; positions are what's priced.
    decoration_type: summariseDecoration(item.positions),
    position: idx,
    print_positions: { positions: item.positions },
    choices: { options: item.choices.filter((c) => c.label.trim() && c.product_handle.trim()) },
  })),
})

// Mirrors resolvePrintPositions in backend/src/lib/bundle-lines.ts — items
// saved before positions existed are priced as one front decoration.
const defaultPositionsFor = (decoration: ItemDraft["decoration_type"]): PrintPosition[] =>
  decoration === "embroidery"
    ? [{ side: "front", method: "embroidery", stitch_count: 4000, width_mm: 90, height_mm: 60 }]
    : decoration === "print"
      ? [{ side: "front", method: "print", size_id: "up_to_a4" }]
      : []

const summariseDecoration = (positions: PrintPosition[]): ItemDraft["decoration_type"] =>
  positions.length === 0
    ? "none"
    : positions.some((p) => p.method === "embroidery")
      ? "embroidery"
      : "print"

const SIDE_OPTIONS = [
  ["front", "Front"],
  ["back", "Back"],
  ["left_sleeve", "Left sleeve"],
  ["right_sleeve", "Right sleeve"],
  ["printed_tag", "Neck tag"],
] as const

const SIZE_OPTIONS = [
  ["up_to_a6", "Up to A6 (logo)"],
  ["up_to_a4", "Up to A4"],
  ["up_to_a3", "Up to A3"],
  ["oversize", "Oversize"],
] as const

const numberInput = (v: string) => Math.max(0, parseInt(v) || 0)

const PositionRow = ({
  position,
  usedSides,
  onChange,
  onRemove,
}: {
  position: PrintPosition
  usedSides: string[]
  onChange: (p: PrintPosition) => void
  onRemove: () => void
}) => (
  <div className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2 items-end">
    <Select value={position.side} onValueChange={(side) => onChange({ ...position, side })}>
      <Select.Trigger size="small">
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        {SIDE_OPTIONS.filter(([v]) => v === position.side || !usedSides.includes(v)).map(([v, l]) => (
          <Select.Item key={v} value={v}>
            {l}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
    <Select
      value={position.method}
      onValueChange={(m) =>
        onChange(
          m === "embroidery"
            ? { side: position.side, method: "embroidery", stitch_count: 4000, width_mm: 90, height_mm: 60 }
            : { side: position.side, method: "print", size_id: "up_to_a4" }
        )
      }
    >
      <Select.Trigger size="small">
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="embroidery">Embroidery</Select.Item>
        <Select.Item value="print">Print (DTF)</Select.Item>
      </Select.Content>
    </Select>
    {position.method === "print" ? (
      <Select value={position.size_id ?? "up_to_a4"} onValueChange={(size_id) => onChange({ ...position, size_id })}>
        <Select.Trigger size="small">
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {SIZE_OPTIONS.map(([v, l]) => (
            <Select.Item key={v} value={v}>
              {l}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    ) : (
      <div className="grid grid-cols-3 gap-1">
        <Input
          size="small"
          type="number"
          title="Stitch count"
          value={position.stitch_count ?? 4000}
          onChange={(e) => onChange({ ...position, stitch_count: numberInput(e.currentTarget.value) })}
        />
        <Input
          size="small"
          type="number"
          title="Width (mm)"
          value={position.width_mm ?? 90}
          onChange={(e) => onChange({ ...position, width_mm: numberInput(e.currentTarget.value) })}
        />
        <Input
          size="small"
          type="number"
          title="Height (mm)"
          value={position.height_mm ?? 60}
          onChange={(e) => onChange({ ...position, height_mm: numberInput(e.currentTarget.value) })}
        />
      </div>
    )}
    <Button size="small" variant="transparent" onClick={onRemove} className="text-ui-fg-muted hover:text-ui-tag-red-icon">
      <Trash />
    </Button>
  </div>
)

const ItemRow = ({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: ItemDraft
  index: number
  onChange: (updated: ItemDraft) => void
  onRemove: () => void
}) => (
  <div className="flex flex-col gap-y-2 p-3 border border-ui-border-base rounded-md bg-ui-bg-subtle/30">
    <div className="flex items-center justify-between">
      <Text size="xsmall" className="text-ui-fg-muted font-medium">
        Item {index + 1}
      </Text>
      <Button size="small" variant="transparent" onClick={onRemove} className="text-ui-fg-muted hover:text-ui-tag-red-icon">
        <Trash />
      </Button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-y-1">
        <Label className="text-xs">Product handle *</Label>
        <Input
          size="small"
          value={item.product_handle}
          onChange={(e) => onChange({ ...item, product_handle: e.currentTarget.value })}
          placeholder="e.g. as-colour-5001"
        />
      </div>
      <div className="flex flex-col gap-y-1">
        <Label className="text-xs">Label *</Label>
        <Input
          size="small"
          value={item.label}
          onChange={(e) => onChange({ ...item, label: e.currentTarget.value })}
          placeholder="e.g. Hi-Vis polo shirts"
        />
      </div>
      <div className="flex flex-col gap-y-1">
        <Label className="text-xs">Qty per unit</Label>
        <Input
          size="small"
          type="number"
          min={1}
          value={item.quantity_per_unit}
          onChange={(e) =>
            onChange({
              ...item,
              quantity_per_unit: Math.max(1, parseInt(e.currentTarget.value) || 1),
            })
          }
        />
      </div>
    </div>

    <div className="flex flex-col gap-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">
          Decoration positions{" "}
          <span className="text-ui-fg-muted font-normal">(priced at checkout — stitches · W × H mm for embroidery)</span>
        </Label>
        {item.positions.length < SIDE_OPTIONS.length ? (
          <Button
            size="small"
            variant="transparent"
            onClick={() => {
              const free = SIDE_OPTIONS.find(([v]) => !item.positions.some((p) => p.side === v))![0]
              onChange({ ...item, positions: [...item.positions, { side: free, method: "print", size_id: "up_to_a4" }] })
            }}
          >
            <Plus className="mr-1" /> Position
          </Button>
        ) : null}
      </div>
      {item.positions.length === 0 ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          No decoration — this garment goes in the pack blank.
        </Text>
      ) : (
        item.positions.map((pos, pi) => (
          <PositionRow
            key={pi}
            position={pos}
            usedSides={item.positions.map((p) => p.side)}
            onChange={(p) => {
              const positions = [...item.positions]
              positions[pi] = p
              onChange({ ...item, positions })
            }}
            onRemove={() => onChange({ ...item, positions: item.positions.filter((_, i) => i !== pi) })}
          />
        ))
      )}
    </div>

    <div className="flex flex-col gap-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">
          Garment choices{" "}
          <span className="text-ui-fg-muted font-normal">(optional — e.g. Mens / Womens)</span>
        </Label>
        <Button
          size="small"
          variant="transparent"
          onClick={() =>
            onChange({
              ...item,
              choices: item.choices.length
                ? [...item.choices, { label: "", product_handle: "" }]
                : [
                    { label: "", product_handle: item.product_handle },
                    { label: "", product_handle: "" },
                  ],
            })
          }
        >
          <Plus className="mr-1" /> Choice
        </Button>
      </div>
      {item.choices.map((choice, ci) => (
        <div key={ci} className="grid grid-cols-[1fr_1.6fr_auto] gap-2">
          <Input
            size="small"
            value={choice.label}
            placeholder={ci === 0 ? "e.g. Mens" : "e.g. Womens"}
            onChange={(e) => {
              const choices = [...item.choices]
              choices[ci] = { ...choice, label: e.currentTarget.value }
              onChange({ ...item, choices })
            }}
          />
          <Input
            size="small"
            value={choice.product_handle}
            placeholder="product handle"
            onChange={(e) => {
              const choices = [...item.choices]
              choices[ci] = { ...choice, product_handle: e.currentTarget.value }
              onChange({ ...item, choices })
            }}
          />
          <Button
            size="small"
            variant="transparent"
            onClick={() => onChange({ ...item, choices: item.choices.filter((_, i) => i !== ci) })}
            className="text-ui-fg-muted hover:text-ui-tag-red-icon"
          >
            <Trash />
          </Button>
        </div>
      ))}
      {item.choices.length ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          The item&rsquo;s product handle above is the default; customers pick between these. Every choice is
          decorated with the same positions.
        </Text>
      ) : null}
    </div>
  </div>
)

const BundleFormDrawer = ({
  open,
  onClose,
  editBundle,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editBundle: Bundle | null
  onSaved: () => void
}) => {
  const [draft, setDraft] = useState<BundleDraft>(BLANK_DRAFT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(editBundle ? bundleToDraft(editBundle) : { ...BLANK_DRAFT, items: [] })
      setError(null)
    }
  }, [open, editBundle])

  useEffect(() => {
    if (!editBundle && draft.title && !draft.handle) {
      setDraft((d) => ({ ...d, handle: slugifyBundleHandle(d.title) }))
    }
  }, [draft.title, draft.handle, editBundle])

  const addItem = () => {
    setDraft((d) => ({
      ...d,
      items: [...d.items, { ...BLANK_ITEM, position: d.items.length }],
    }))
  }

  const updateItem = (idx: number, updated: ItemDraft) => {
    setDraft((d) => {
      const items = [...d.items]
      items[idx] = updated
      return { ...d, items }
    })
  }

  const removeItem = (idx: number) => {
    setDraft((d) => ({
      ...d,
      items: d.items.filter((_, i) => i !== idx),
    }))
  }

  const submit = async () => {
    if (!draft.title.trim()) {
      setError("Bundle title is required.")
      return
    }
    for (let i = 0; i < draft.items.length; i++) {
      const item = draft.items[i]
      if (!item.product_handle.trim()) {
        setError(`Item ${i + 1}: product handle is required.`)
        return
      }
      if (!item.label.trim()) {
        setError(`Item ${i + 1}: label is required.`)
        return
      }
      const filledChoices = item.choices.filter((c) => c.label.trim() || c.product_handle.trim())
      if (filledChoices.some((c) => !c.label.trim() || !c.product_handle.trim())) {
        setError(`Item ${i + 1}: every garment choice needs a label and a product handle.`)
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      const url = editBundle
        ? `/admin/bundles/${editBundle.id}`
        : "/admin/bundles"
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draftToPayload(draft)),
      })
      const json = await res.json()
      if (!res.ok)
        throw new Error(json?.message ?? json?.error ?? `HTTP ${res.status}`)
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
          <Drawer.Title>
            {editBundle ? "Edit bundle" : "New bundle"}
          </Drawer.Title>
          <Drawer.Description>
            Bundles appear on the storefront /bundles page with a step-by-step
            configuration wizard.
          </Drawer.Description>
        </Drawer.Header>

        <Drawer.Body className="overflow-auto">
          <div className="flex flex-col gap-y-4 p-1">
            <div className="flex flex-col gap-y-1">
              <Label className="text-xs">Title *</Label>
              <Input
                value={draft.title}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, title: e.currentTarget.value }))
                }
                placeholder="e.g. Site Ready Starter Pack"
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label className="text-xs">Handle</Label>
              <Input
                value={draft.handle}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, handle: e.currentTarget.value }))
                }
                placeholder="auto-derived from title if blank"
              />
              <Text size="xsmall" className="text-ui-fg-muted">
                URL slug used in /bundles/[handle]. Avoid changing after launch.
              </Text>
            </div>

            <div className="flex flex-col gap-y-1">
              <Label className="text-xs">Subtitle (angle copy)</Label>
              <Textarea
                value={draft.subtitle}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, subtitle: e.currentTarget.value }))
                }
                placeholder='e.g. "Everything your new tradie needs, sorted before their first day."'
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label className="text-xs">Thumbnail URL</Label>
              <Input
                value={draft.thumbnail_url}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    thumbnail_url: e.currentTarget.value,
                  }))
                }
                placeholder="https://cdn.example.com/bundle-hero.jpg"
              />
            </div>

            <div className="flex flex-col gap-y-1">
              <Label className="text-xs">Crew multiplier label</Label>
              <Input
                value={draft.quantity_multiplier_label}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    quantity_multiplier_label: e.currentTarget.value,
                  }))
                }
                placeholder='e.g. "How many crew members?" — leave blank for fixed packs'
              />
              <Text size="xsmall" className="text-ui-fg-muted">
                When set, the wizard shows a &ldquo;How many X?&rdquo; step and
                multiplies all item quantities by the answer.
              </Text>
            </div>

            <div className="flex flex-col gap-y-1">
              <Label className="text-xs">Pack discount (%)</Label>
              <Input
                type="number"
                min={0}
                max={30}
                value={draft.discount_pct}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    discount_pct: Math.min(30, Math.max(0, parseInt(e.currentTarget.value) || 0)),
                  }))
                }
              />
              <Text size="xsmall" className="text-ui-fg-muted">
                Taken off every line of the pack (garment + decoration) while the cart holds every item. Removing an
                item from the cart removes the discount. Max 30%.
              </Text>
            </div>

            <div className="flex items-center gap-x-2">
              <Switch
                id="bundle-active"
                checked={draft.status === "active"}
                onCheckedChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    status: v ? "active" : "draft",
                  }))
                }
              />
              <Label htmlFor="bundle-active" className="text-sm">
                Active
              </Label>
              <Text size="xsmall" className="text-ui-fg-muted ml-2">
                Inactive bundles are hidden from the storefront.
              </Text>
            </div>

            <div className="flex flex-col gap-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Bundle items</Label>
                <Button size="small" variant="secondary" onClick={addItem}>
                  <Plus className="mr-1" /> Add item
                </Button>
              </div>
              {draft.items.length === 0 ? (
                <Text size="xsmall" className="text-ui-fg-muted">
                  No items yet. Click &ldquo;Add item&rdquo; to start building
                  the pack.
                </Text>
              ) : (
                <div className="flex flex-col gap-y-2">
                  {draft.items.map((item, idx) => (
                    <ItemRow
                      key={idx}
                      item={item}
                      index={idx}
                      onChange={(updated) => updateItem(idx, updated)}
                      onRemove={() => removeItem(idx)}
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
            {editBundle ? "Save changes" : "Create bundle"}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const BundleRow = ({
  bundle,
  onEdit,
  onDelete,
}: {
  bundle: Bundle
  onEdit: () => void
  onDelete: () => void
}) => (
  <div className="flex items-center gap-x-4 px-4 py-3 border-b border-ui-border-base last:border-b-0 hover:bg-ui-bg-subtle/30 transition">
    <div className="flex flex-col flex-1 min-w-0">
      <Text size="small" className="font-medium truncate">
        {bundle.title}
      </Text>
      <Text size="xsmall" className="text-ui-fg-muted">
        /{bundle.handle} · {bundle.items?.length ?? 0} item
        {(bundle.items?.length ?? 0) !== 1 ? "s" : ""}
        {bundle.quantity_multiplier_label
          ? ` · crew: "${bundle.quantity_multiplier_label}"`
          : ""}
        {bundle.discount_pct > 0 ? ` · ${bundle.discount_pct}% pack discount` : ""}
      </Text>
    </div>
    <div className="shrink-0">
      <Badge
        size="2xsmall"
        color={bundle.status === "active" ? "green" : "grey"}
      >
        {bundle.status}
      </Badge>
    </div>
    <div className="flex items-center gap-x-1 shrink-0">
      <Button size="small" variant="transparent" onClick={onEdit}>
        <PencilSquare />
      </Button>
      <Button
        size="small"
        variant="transparent"
        onClick={onDelete}
        className="text-ui-fg-muted hover:text-ui-tag-red-icon"
      >
        <Trash />
      </Button>
    </div>
  </div>
)

const BundlesPage = () => {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editBundle, setEditBundle] = useState<Bundle | null>(null)
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/admin/bundles", { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setBundles(data.bundles ?? [])
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!search.trim()) return bundles
    const needle = search.trim().toLowerCase()
    return bundles.filter(
      (b) =>
        b.title.toLowerCase().includes(needle) ||
        b.handle.toLowerCase().includes(needle)
    )
  }, [bundles, search])

  const handleDelete = async (bundle: Bundle) => {
    if (
      !window.confirm(
        `Delete "${bundle.title}"? This cannot be undone.`
      )
    )
      return
    try {
      const res = await fetch(`/admin/bundles/${bundle.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setBundles((prev) => prev.filter((b) => b.id !== bundle.id))
    } catch (err: any) {
      window.alert(`Delete failed: ${err?.message ?? err}`)
    }
  }

  return (
    <div className="flex flex-col gap-y-4">
      <Container className="flex items-start justify-between">
        <div>
          <Heading level="h1" className="flex items-center">
            Bundles
            <HelpTooltip
              text={{
                title: "Bundles",
                body: "Pre-configured uniform packs (e.g. Site Ready Starter Pack, Full Crew Bundle) that appear on the storefront /bundles page. Each bundle guides customers through a step-by-step wizard: pick colours and sizes per item, upload artwork, leave decoration notes, then add the whole pack to cart.",
                bullets: [
                  "Title + handle: The handle becomes the URL (/bundles/[handle]) — avoid changing after launch.",
                  "Subtitle: The angle/pitch shown in quotes on the bundle page (e.g. \"Everything your new tradie needs, sorted before their first day.\").",
                  "Crew multiplier: Set the label (e.g. \"How many crew members?\") to make the wizard ask for a number and multiply all item quantities by it. Leave blank for fixed packs.",
                  "Items: Each item is a Medusa product (referenced by handle), the per-unit quantity, and its decoration positions (side + print size, or side + stitch count). The label is what the customer sees.",
                  "Pricing: Decoration is charged automatically at checkout from each item's positions — the same print/embroidery rate card as the Studio. Embroidery shares one digitizing fee across the whole pack.",
                  "Garment choices: Optional per item (e.g. Mens / Womens) — the customer picks one; all choices get the same positions.",
                  "Pack discount: % off every line while the cart holds the whole pack (max 30%).",
                  "Status: Inactive bundles are hidden from the storefront but kept here for editing.",
                  "Cart lines: Each garment is a separate priced cart line tagged with bundle_id. The order's print-details widget shows each side's method and size; the customer's artwork is attached as the original file.",
                ],
              }}
            />
          </Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Pre-configured uniform packs shown on the storefront /bundles page.
            Each bundle guides customers through a step-by-step configuration
            wizard.
          </Text>
        </div>
        <div className="flex items-center gap-x-2">
          <Button
            size="small"
            variant="secondary"
            onClick={load}
            disabled={loading}
          >
            <ArrowPath className="mr-1" /> Refresh
          </Button>
          <Button
            size="small"
            onClick={() => {
              setEditBundle(null)
              setDrawerOpen(true)
            }}
          >
            <Plus className="mr-1" /> New bundle
          </Button>
        </div>
      </Container>

      <Container className="p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="Search by title or handle…"
          size="small"
        />
      </Container>

      {error ? (
        <Container>
          <Text className="text-ui-tag-red-icon">
            Failed to load bundles: {error}
          </Text>
        </Container>
      ) : null}

      {!loading && bundles.length === 0 && !error ? (
        <Container className="flex flex-col items-center gap-y-3 py-12">
          <Text className="text-ui-fg-muted">No bundles yet.</Text>
          <Button
            size="small"
            onClick={() => {
              setEditBundle(null)
              setDrawerOpen(true)
            }}
          >
            <Plus className="mr-1" /> Create your first bundle
          </Button>
        </Container>
      ) : null}

      {filtered.length > 0 ? (
        <Container className="p-0 overflow-hidden">
          {filtered.map((bundle) => (
            <BundleRow
              key={bundle.id}
              bundle={bundle}
              onEdit={() => {
                setEditBundle(bundle)
                setDrawerOpen(true)
              }}
              onDelete={() => handleDelete(bundle)}
            />
          ))}
        </Container>
      ) : null}

      <BundleFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        editBundle={editBundle}
        onSaved={load}
      />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Bundles",
  icon: tinted(ShoppingCart, NAV_COLOR.storefront),
  rank: 41,
})

export default BundlesPage
