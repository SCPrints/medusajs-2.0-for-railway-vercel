import { Badge, Button, Input, Text } from "@medusajs/ui"
import {
  ArrowUpMini,
  ArrowDownMini,
  Trash,
  MagnifyingGlass,
} from "@medusajs/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type ProductSummary = {
  id: string
  handle: string
  title: string
  thumbnail: string | null
  status: string
}

type Props = {
  /** Ordered product handles the tile links to (first = primary CTA target). */
  value: string[]
  onChange: (next: string[]) => void
}

/**
 * Search the catalog and build an ORDERED list of product handles a lookbook
 * tile links to. Selected products render as a reorderable list
 * (up/down/remove); the FIRST handle is the primary "Start a job like this"
 * deep-link target on the storefront. Handle-based (not id) so the link
 * survives supplier re-imports — same convention as bundles + home-sections.
 *
 * Selected handles are resolved (titles + thumbnails) via the generic
 * `/admin/home-sections/resolve` product-by-handle endpoint. Handles that no
 * longer resolve are flagged "Unresolved" so staff can spot stale curation;
 * the storefront silently skips them.
 */
export const LookbookProductPicker = ({ value, onChange }: Props) => {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProductSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [resolved, setResolved] = useState<Record<string, ProductSummary>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resolve the currently-selected handles → product summaries.
  const resolveSelected = useCallback(async (handles: string[]) => {
    if (!handles.length) {
      setResolved({})
      return
    }
    try {
      const res = await fetch(
        `/admin/home-sections/resolve?handles=${encodeURIComponent(
          handles.join(",")
        )}`,
        { credentials: "include" }
      )
      if (!res.ok) return
      const data = await res.json()
      const map: Record<string, ProductSummary> = {}
      for (const p of (data.products ?? []) as ProductSummary[]) {
        map[p.handle] = p
      }
      setResolved(map)
    } catch {
      // leave previous resolution in place on transient failure
    }
  }, [])

  useEffect(() => {
    resolveSelected(value)
  }, [value, resolveSelected])

  // Debounced catalog search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `/admin/products?q=${encodeURIComponent(
            q
          )}&limit=20&fields=id,handle,title,thumbnail,status`,
          { credentials: "include" }
        )
        if (res.ok) {
          const data = await res.json()
          setResults(
            ((data.products ?? []) as any[]).map((p) => ({
              id: p.id,
              handle: p.handle,
              title: p.title,
              thumbnail: p.thumbnail ?? null,
              status: p.status,
            }))
          )
        } else {
          setResults([])
        }
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const selectedSet = useMemo(() => new Set(value), [value])

  const add = (handle: string) => {
    if (!handle || selectedSet.has(handle)) return
    onChange([...value, handle])
  }
  const remove = (handle: string) => {
    onChange(value.filter((h) => h !== handle))
  }
  const move = (index: number, dir: -1 | 1) => {
    const next = [...value]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search box */}
      <div className="relative">
        <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ui-fg-muted">
          <MagnifyingGlass />
        </div>
        <Input
          placeholder="Search products to link…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Search results */}
      {query.trim() ? (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-ui-border-base">
          {searching ? (
            <Text size="small" className="px-3 py-3 text-ui-fg-muted">
              Searching…
            </Text>
          ) : results.length === 0 ? (
            <Text size="small" className="px-3 py-3 text-ui-fg-muted">
              No products match “{query.trim()}”.
            </Text>
          ) : (
            results.map((p) => {
              const already = selectedSet.has(p.handle)
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={already}
                  onClick={() => add(p.handle)}
                  className="flex w-full items-center gap-3 border-b border-ui-border-base px-3 py-2 text-left last:border-b-0 hover:bg-ui-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Thumb url={p.thumbnail} />
                  <span className="flex-1 truncate text-sm text-ui-fg-base">
                    {p.title}
                  </span>
                  {p.status !== "published" ? (
                    <Badge size="2xsmall" color="orange">
                      {p.status}
                    </Badge>
                  ) : null}
                  {already ? (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Added
                    </Text>
                  ) : (
                    <Text size="xsmall" className="text-ui-fg-interactive">
                      Add
                    </Text>
                  )}
                </button>
              )
            })
          )}
        </div>
      ) : null}

      {/* Selected, ordered list */}
      <div className="flex flex-col gap-1.5">
        <Text size="xsmall" className="text-ui-fg-muted">
          {value.length} product{value.length === 1 ? "" : "s"} linked
          {value.length ? " · first = primary “Start a job like this” target" : ""}
        </Text>
        {value.length === 0 ? (
          <Text size="small" className="text-ui-fg-muted">
            None linked — search above to point this tile at the actual garment.
          </Text>
        ) : (
          <ul className="flex list-none flex-col gap-1.5 p-0">
            {value.map((handle, index) => {
              const p = resolved[handle]
              const unresolved = !p
              return (
                <li
                  key={handle}
                  className="flex items-center gap-2 rounded-lg border border-ui-border-base bg-ui-bg-base px-2 py-1.5"
                >
                  <Thumb url={p?.thumbnail ?? null} />
                  <span className="flex-1 truncate text-sm text-ui-fg-base">
                    {p?.title ?? handle}
                  </span>
                  {unresolved ? (
                    <Badge size="2xsmall" color="red">
                      Unresolved
                    </Badge>
                  ) : p.status !== "published" ? (
                    <Badge size="2xsmall" color="orange">
                      {p.status}
                    </Badge>
                  ) : null}
                  <div className="flex items-center">
                    <Button
                      variant="transparent"
                      size="small"
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUpMini />
                    </Button>
                    <Button
                      variant="transparent"
                      size="small"
                      type="button"
                      disabled={index === value.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDownMini />
                    </Button>
                    <Button
                      variant="transparent"
                      size="small"
                      type="button"
                      onClick={() => remove(handle)}
                      aria-label="Remove"
                      className="text-ui-fg-muted hover:text-ui-tag-red-icon"
                    >
                      <Trash />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

const Thumb = ({ url }: { url: string | null }) => (
  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-ui-border-base bg-ui-bg-subtle">
    {url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="h-full w-full object-cover" />
    ) : null}
  </div>
)
