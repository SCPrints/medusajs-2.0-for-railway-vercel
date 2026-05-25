import { Button, Checkbox, Input, Popover, Text } from "@medusajs/ui"
import { useMemo, useState } from "react"

/**
 * Generic multi-select dropdown driven by a Medusa UI Popover. Used by
 * the products-manager tab for every multi-pick field (brands, types,
 * tags, categories, collections, sales channels). The codebase doesn't
 * have a multi-select picker yet — every existing picker is single-
 * select via <Select>.
 */

export type MultiSelectOption = {
  value: string
  label: string
  hint?: string | null
}

type Props = {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Trigger button copy when nothing is selected. */
  placeholder?: string
  /** Empty-list copy inside the popover. */
  emptyMessage?: string
  /** Disable the picker (still renders, but un-clickable). */
  disabled?: boolean
  /** Hide the inline search box when option list is small. */
  searchable?: boolean
  /** Width override; defaults to 280px to match common filter rails. */
  contentClassName?: string
}

export const MultiSelectPicker = ({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  emptyMessage = "No matches.",
  disabled,
  searchable = true,
  contentClassName = "w-[280px]",
}: Props) => {
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q)
    )
  }, [options, search])

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const buttonLabel = useMemo(() => {
    if (selected.length === 0) return placeholder
    if (selected.length === 1) {
      const hit = options.find((o) => o.value === selected[0])
      return hit?.label ?? "1 selected"
    }
    return `${selected.length} selected`
  }, [selected, options, placeholder])

  return (
    <Popover>
      <Popover.Trigger asChild>
        <Button
          variant="secondary"
          size="small"
          disabled={disabled}
          className="min-w-[140px] justify-between"
          type="button"
        >
          <span className="truncate text-left">{buttonLabel}</span>
          <span className="ml-2 shrink-0 opacity-60">▾</span>
        </Button>
      </Popover.Trigger>
      <Popover.Content className={`p-2 ${contentClassName}`} align="start">
        {searchable ? (
          <Input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            className="mb-2"
          />
        ) : null}
        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <Text size="small" className="px-2 py-3 text-ui-fg-muted">
              {emptyMessage}
            </Text>
          ) : (
            filtered.map((o) => {
              const checked = selected.includes(o.value)
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-ui-bg-subtle"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(o.value)}
                  />
                  <span className="flex-1 truncate text-sm text-ui-fg-base">
                    {o.label}
                  </span>
                  {o.hint ? (
                    <span className="shrink-0 text-xs text-ui-fg-muted">
                      {o.hint}
                    </span>
                  ) : null}
                </label>
              )
            })
          )}
        </div>
        {selected.length > 0 ? (
          <div className="mt-2 flex items-center justify-between border-t border-ui-border-base pt-2">
            <Text size="xsmall" className="text-ui-fg-muted">
              {selected.length} selected
            </Text>
            <button
              type="button"
              className="text-xs text-ui-fg-interactive hover:underline"
              onClick={() => onChange([])}
            >
              Clear
            </button>
          </div>
        ) : null}
      </Popover.Content>
    </Popover>
  )
}
