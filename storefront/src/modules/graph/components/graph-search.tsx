"use client"

import { useEffect, useState } from "react"

type Props = {
  value: string
  onChange: (next: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  debounceMs?: number
}

/**
 * Debounced search input. Updates are deferred so each keystroke doesn't
 * re-materialize the graph's filtered node list.
 */
export function GraphSearch({
  value,
  onChange,
  onSubmit,
  placeholder = "Search brands, categories, products…",
  debounceMs = 180,
}: Props) {
  const [local, setLocal] = useState<string>(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (local !== value) onChange(local)
    }, debounceMs)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, debounceMs])

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onChange(local)
        onSubmit?.(local)
      }}
      className="w-full"
    >
      <label className="sr-only" htmlFor="graph-search">
        Search graph
      </label>
      <input
        id="graph-search"
        type="search"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-ui-border-base bg-ui-bg-base/90 px-3 py-2 text-small-regular text-ui-fg-base placeholder:text-ui-fg-muted backdrop-blur focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary,#0f766e)]"
        autoComplete="off"
      />
    </form>
  )
}
