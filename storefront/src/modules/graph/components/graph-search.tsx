"use client"

import { useEffect, useState } from "react"

type Props = {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
}

/** Debounced search input so each keystroke doesn't re-derive the focus set. */
export function GraphSearch({
  value,
  onChange,
  placeholder = "Search brands, categories, products…",
  debounceMs = 180,
  className,
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
      }}
      className={className}
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
        className="min-h-11 w-full rounded-xl border border-[#45A29E]/30 bg-[#0B0C10]/75 px-3 text-small-regular !text-[#C5C6C7] placeholder:text-[#C5C6C7]/50 shadow-[0_0_24px_rgba(69,162,158,0.12)] backdrop-blur focus:outline-none focus:ring-2 focus:ring-[#66FCF1]"
        autoComplete="off"
      />
    </form>
  )
}
