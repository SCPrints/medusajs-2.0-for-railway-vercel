"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { getProductIndexName } from "@lib/search-client"

type PickedGarment = { handle: string; title: string; thumbnail: string | null }

type Props = {
  open: boolean
  onClose(): void
  onPick(p: PickedGarment): void
  title?: string
}

const SEARCH_ENDPOINT = (process.env.NEXT_PUBLIC_SEARCH_ENDPOINT ?? "").replace(/\/$/, "")
const SEARCH_API_KEY = process.env.NEXT_PUBLIC_SEARCH_API_KEY ?? ""
const LIMIT = 24

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Pick any garment from the catalogue. An empty search box is a Meilisearch
 * placeholder search, which the index ranks by popularity, so the default
 * grid is our best sellers with no extra call.
 *
 * Also used inside the Studio overlay (z-[200]): portals to body at z-[300],
 * tags itself `data-studio-sublayer`, traps focus and stops Escape in the
 * capture phase so it closes the picker, not the Studio.
 */
const GarmentPicker = ({ open, onClose, onPick, title = "Choose a garment" }: Props) => {
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<PickedGarment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Escape (capture phase, beats the Studio's own listener), focus trap,
  // initial focus, scroll lock, focus restore.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopImmediatePropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== "Tab" || !dialogRef.current) return
      const f = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null)
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      document.body.style.overflow = prevOverflow
      window.clearTimeout(t)
      previous?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!SEARCH_ENDPOINT || !SEARCH_API_KEY) {
      setError("Search is unavailable right now.")
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const timer = window.setTimeout(async () => {
      try {
        const url = new URL(`/indexes/${await getProductIndexName()}/search`, SEARCH_ENDPOINT)
        url.searchParams.set("q", query.trim())
        url.searchParams.set("limit", String(LIMIT))
        url.searchParams.set("attributesToRetrieve", "handle,title,thumbnail")
        url.searchParams.set("filter", "internal_service != true")
        const res = await fetch(url.toString(), {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${SEARCH_API_KEY}` },
        })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as {
          hits?: Array<{ handle?: unknown; title?: unknown; thumbnail?: unknown }>
        }
        setHits(
          (data.hits ?? [])
            .filter((h) => typeof h.handle === "string" && typeof h.title === "string")
            .map((h) => ({
              handle: h.handle as string,
              title: h.title as string,
              thumbnail: typeof h.thumbnail === "string" ? h.thumbnail : null,
            }))
        )
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return
        setError("Search is unavailable right now.")
        setHits([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, query ? 250 : 0)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [open, query])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 tablet:items-center tablet:p-6"
      data-studio-sublayer
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="garment-picker-title"
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl tablet:max-w-3xl tablet:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-ui-border-base px-4 py-3">
          <h2 id="garment-picker-title" className="text-base font-semibold text-ui-fg-base">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ui-fg-subtle hover:bg-ui-bg-subtle hover:text-ui-fg-base"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="px-4 pt-3">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tees, hoodies, polos, caps…"
            aria-label="Search garments"
            className="min-h-11 w-full rounded-lg border border-ui-border-base px-3 text-base focus:outline-none focus:ring-2 focus:ring-ink"
          />
          <p className="mt-2 text-xs text-ui-fg-subtle" aria-live="polite">
            {error
              ? error
              : loading
              ? "Searching…"
              : query.trim()
              ? `${hits.length} result${hits.length === 1 ? "" : "s"}`
              : "Popular garments"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
          {!loading && !error && hits.length === 0 ? (
            <p className="py-10 text-center text-sm text-ui-fg-subtle">
              Nothing found. Try another word.
            </p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 phone:grid-cols-3 tablet:grid-cols-4">
              {hits.map((hit) => (
                <li key={hit.handle}>
                  <button
                    type="button"
                    onClick={() => onPick(hit)}
                    className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-ui-border-base bg-white text-left transition hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    <span className="flex aspect-square w-full items-center justify-center bg-ui-bg-subtle">
                      {hit.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={hit.thumbnail}
                          alt=""
                          loading="lazy"
                          className="max-h-full max-w-full object-contain transition group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span className="text-xs text-ui-fg-subtle">No photo</span>
                      )}
                    </span>
                    <span className="line-clamp-2 px-2 py-2 text-xs font-medium text-ui-fg-base">
                      {hit.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default GarmentPicker
