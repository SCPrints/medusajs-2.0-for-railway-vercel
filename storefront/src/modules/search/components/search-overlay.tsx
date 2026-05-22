"use client"

import { Container, Text } from "@medusajs/ui"
import { MagnifyingGlassMini, XMarkMini } from "@medusajs/icons"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"

/**
 * Standalone search dropdown overlay. Self-contained — body-scroll lock,
 * Escape-to-close, focus management, debounced fetch are all internal.
 *
 * Render-controlled by parent: `open` true mounts the overlay, false renders
 * nothing. This is deliberately the model rather than a routed /search page
 * because closing a routed modal triggers Next.js to re-render + re-hydrate
 * the underlying page; on a heavy category page that takes 3-4s during
 * which links don't respond to clicks. With state-toggled rendering the
 * underlying page never re-renders.
 *
 * Queries Meilisearch directly (same index the /results/[query] page reads).
 * The previous implementation hit Medusa's `/store/products?q=…` (Postgres
 * ILIKE) which has no relevance ranking — "staple" returned every product
 * with "staple" anywhere in the description before any product with "Staple"
 * in the title. Switching to Meili fixes ranking and typo tolerance, and
 * keeps the overlay responsive when the backend is busy.
 */

type SearchOverlayProps = {
  open: boolean
  onClose: () => void
}

type Hit = {
  id: string
  handle: string
  title: string
  thumbnail: string | null
}

const DEBOUNCE_MS = 200
const HIT_LIMIT = 6

const SEARCH_ENDPOINT = (process.env.NEXT_PUBLIC_SEARCH_ENDPOINT ?? "").replace(/\/$/, "")
const SEARCH_API_KEY = process.env.NEXT_PUBLIC_SEARCH_API_KEY ?? ""
const SEARCH_INDEX = process.env.NEXT_PUBLIC_INDEX_NAME || "products"

export default function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const router = useRouter()
  const params = useParams()
  const countryCode = useMemo(() => {
    const raw = params?.countryCode
    return Array.isArray(raw) ? raw[0] : raw ?? ""
  }, [params])

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedQuery = query.trim()

  // Lock body scroll while mounted; restore on unmount AND on close.
  // Restoring on `open` change rather than only unmount means the page below
  // becomes scrollable instantly when the user dismisses, without waiting for
  // the React unmount cycle.
  useEffect(() => {
    if (!open) {
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Escape to close. Bound only while open so we don't intercept keys on
  // pages that never opened search.
  useEffect(() => {
    if (!open) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // Autofocus when the overlay opens; reset query so re-opening starts fresh.
  useEffect(() => {
    if (open) {
      setQuery("")
      setHits([])
      setError(null)
      // RAF so the input is in the DOM before focusing.
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  // Debounced live suggestions.
  useEffect(() => {
    if (!open || !trimmedQuery) {
      setHits([])
      setLoading(false)
      setError(null)
      return
    }

    if (!SEARCH_ENDPOINT || !SEARCH_API_KEY) {
      setError("Search is temporarily unavailable.")
      setHits([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const url = new URL(
          `/indexes/${SEARCH_INDEX}/search`,
          SEARCH_ENDPOINT
        )
        url.searchParams.set("q", trimmedQuery)
        url.searchParams.set("limit", String(HIT_LIMIT))
        url.searchParams.set(
          "attributesToRetrieve",
          "id,title,handle,thumbnail"
        )

        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${SEARCH_API_KEY}` },
        })

        if (!response.ok) {
          throw new Error(`search responded ${response.status}`)
        }

        const data = (await response.json()) as {
          hits?: Array<{
            id?: string
            handle?: string | null
            title?: string | null
            thumbnail?: string | null
          }>
        }

        const next: Hit[] = (data.hits ?? [])
          .filter((p): p is { id: string; handle: string; title: string; thumbnail: string | null } =>
            typeof p.id === "string" && typeof p.handle === "string" && typeof p.title === "string"
          )
          .map((p) => ({
            id: p.id,
            handle: p.handle,
            title: p.title,
            thumbnail: typeof p.thumbnail === "string" ? p.thumbnail : null,
          }))

        setHits(next)
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return
        }
        setError("Search is temporarily unavailable.")
        setHits([])
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [open, trimmedQuery])

  if (!open) {
    return null
  }

  // Submit → full results page (Meili-backed).
  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!trimmedQuery) {
      return
    }
    const target = countryCode
      ? `/${countryCode}/results/${encodeURIComponent(trimmedQuery)}`
      : `/results/${encodeURIComponent(trimmedQuery)}`
    onClose()
    router.push(target)
  }

  const onOverlayClick = (event: React.MouseEvent) => {
    if (event.target === overlayRef.current) {
      onClose()
    }
  }

  return (
    <div className="relative z-[75]">
      <div className="fixed inset-0 bg-opacity-75 backdrop-blur-md opacity-100 h-screen w-screen" />
      <div
        className="fixed inset-0 px-5 sm:p-0"
        ref={overlayRef}
        onClick={onOverlayClick}
      >
        <div className="flex flex-col justify-start w-full h-fit transform p-5 items-center text-left align-middle transition-all max-h-[75vh] bg-transparent shadow-none">
          <div
            className="flex absolute flex-col h-fit w-full sm:w-fit"
            data-testid="search-modal-container"
          >
            <form
              onSubmit={onSubmit}
              className="w-full flex items-center gap-x-2 p-4 bg-[rgba(3,7,18,0.5)] text-ui-fg-on-color backdrop-blur-2xl rounded-rounded"
            >
              <MagnifyingGlassMini />
              <input
                ref={inputRef}
                data-testid="search-input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Search products..."
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="txt-compact-large h-6 placeholder:text-ui-fg-on-color placeholder:transition-colors focus:outline-none flex-1 bg-transparent"
              />
              {trimmedQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    inputRef.current?.focus()
                  }}
                  aria-label="Clear search"
                  className="items-center justify-center text-ui-fg-on-color focus:outline-none gap-x-1 px-1 txt-compact-large flex"
                >
                  <XMarkMini />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close search"
                className="items-center justify-center text-ui-fg-on-color focus:outline-none gap-x-2 px-2 txt-compact-large flex"
              >
                Cancel
              </button>
            </form>

            <div
              className={`transition-[max-height,opacity] duration-300 ease-in-out sm:overflow-hidden w-full sm:w-[50vw] mt-6 mb-1 p-px ${
                trimmedQuery ? "max-h-full opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {loading && hits.length === 0 ? (
                <Text className="text-ui-fg-on-color px-2">Searching…</Text>
              ) : error ? (
                <Text className="text-ui-fg-on-color px-2">{error}</Text>
              ) : hits.length === 0 && trimmedQuery ? (
                <Text className="text-ui-fg-on-color px-2">
                  No matches for "{trimmedQuery}". Press Enter for full results.
                </Text>
              ) : (
                <ul
                  className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4"
                  data-testid="search-results"
                >
                  {hits.map((hit) => (
                    <li key={hit.id} className="list-none">
                      <LocalizedClientLink
                        href={`/products/${hit.handle}`}
                        prefetch={false}
                        data-testid="search-result"
                        onClick={onClose}
                      >
                        <Container className="flex sm:flex-col gap-2 w-full p-4 shadow-elevation-card-rest hover:shadow-elevation-card-hover items-center sm:justify-center">
                          <Thumbnail
                            thumbnail={hit.thumbnail}
                            size="square"
                            sizes="(max-width: 639px) 48px, (max-width: 1024px) 40vw, 280px"
                            className="group h-12 w-12 sm:h-full sm:w-full"
                          />
                          <div className="flex flex-col justify-between group">
                            <Text
                              className="text-ui-fg-subtle"
                              data-testid="search-result-title"
                            >
                              {hit.title}
                            </Text>
                          </div>
                        </Container>
                      </LocalizedClientLink>
                    </li>
                  ))}
                </ul>
              )}

              {trimmedQuery && (hits.length > 0 || error) && (
                <LocalizedClientLink
                  href={`/results/${encodeURIComponent(trimmedQuery)}`}
                  prefetch={false}
                  onClick={onClose}
                  className="block w-full text-center py-2 text-ui-fg-on-color hover:underline"
                >
                  View all results →
                </LocalizedClientLink>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
