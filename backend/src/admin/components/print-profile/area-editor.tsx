import { Button, Checkbox, Input, Label, Select, Text } from "@medusajs/ui"
import { Trash } from "@medusajs/icons"

/**
 * Shared print-profile area-editing primitives, used by both the
 * /app/print-profiles CRUD page and the per-product "Print profile" widget
 * (full-custom mode). Vocabulary mirrors backend/src/lib/print-profile.ts.
 */

export type Area = {
  key: string
  label: string
  methods: string[]
  sizes: string[]
  max_prints?: number
}

export const SIDE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "left_sleeve", label: "Left Sleeve" },
  { id: "right_sleeve", label: "Right Sleeve" },
  { id: "printed_tag", label: "Neck Tag" },
]
export const SIDE_LABEL: Record<string, string> = Object.fromEntries(
  SIDE_OPTIONS.map((s) => [s.id, s.label])
)
export const METHOD_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "print", label: "Print (DTF)" },
  { id: "embroidery", label: "Embroidery" },
]
export const SIZE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "up_to_a6", label: "A6" },
  { id: "up_to_a4", label: "A4" },
  { id: "up_to_a3", label: "A3" },
  { id: "oversize", label: "Oversize" },
]

export const BLANK_AREA: Area = {
  key: "front",
  label: "Front",
  methods: ["print", "embroidery"],
  sizes: ["up_to_a6", "up_to_a4", "up_to_a3", "oversize"],
}

export const toggle = (arr: string[], id: string): string[] =>
  arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]

export const areaSummary = (areas: Area[] | null | undefined): string => {
  if (!areas?.length) return "no print locations"
  const embOnly = areas.every(
    (a) => a.methods.length === 1 && a.methods[0] === "embroidery"
  )
  const sides = areas.map((a) => a.label || SIDE_LABEL[a.key] || a.key).join(", ")
  return `${sides}${embOnly ? " · embroidery only" : ""}`
}

export const AreaRow = ({
  area,
  onChange,
  onRemove,
}: {
  area: Area
  onChange: (a: Area) => void
  onRemove: () => void
}) => (
  <div className="rounded-lg border border-ui-border-base p-3 flex flex-col gap-y-3">
    <div className="flex items-center gap-x-2">
      <div className="flex-1">
        <Label className="text-xs">Location</Label>
        <Select
          value={SIDE_OPTIONS.some((s) => s.id === area.key) ? area.key : "front"}
          onValueChange={(v) =>
            onChange({ ...area, key: v, label: SIDE_LABEL[v] ?? area.label })
          }
        >
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {SIDE_OPTIONS.map((s) => (
              <Select.Item key={s.id} value={s.id}>
                {s.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      <Button
        size="small"
        variant="transparent"
        onClick={onRemove}
        className="text-ui-fg-muted hover:text-ui-tag-red-icon mt-5"
      >
        <Trash />
      </Button>
    </div>

    <div className="flex flex-col gap-y-1">
      <Label className="text-xs">Techniques</Label>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {METHOD_OPTIONS.map((m) => (
          <label key={m.id} className="flex items-center gap-x-2 text-sm">
            <Checkbox
              checked={area.methods.includes(m.id)}
              onCheckedChange={() =>
                onChange({ ...area, methods: toggle(area.methods, m.id) })
              }
            />
            {m.label}
          </label>
        ))}
      </div>
    </div>

    <div className="flex flex-col gap-y-1">
      <Label className="text-xs">Sizes</Label>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {SIZE_OPTIONS.map((s) => (
          <label key={s.id} className="flex items-center gap-x-2 text-sm">
            <Checkbox
              checked={area.sizes.includes(s.id)}
              onCheckedChange={() =>
                onChange({ ...area, sizes: toggle(area.sizes, s.id) })
              }
            />
            {s.label}
          </label>
        ))}
      </div>
    </div>

    <div className="flex items-center gap-x-2">
      <Label className="text-xs">Max prints</Label>
      <Input
        type="number"
        min={1}
        max={20}
        className="w-20"
        size="small"
        value={area.max_prints ?? ""}
        placeholder="4"
        onChange={(e) => {
          const n = parseInt(e.currentTarget.value, 10)
          onChange({
            ...area,
            max_prints: Number.isFinite(n) && n > 0 ? n : undefined,
          })
        }}
      />
      <Text size="xsmall" className="text-ui-fg-muted">
        Blank = default (4).
      </Text>
    </div>
  </div>
)
