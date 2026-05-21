"use client"

import { Container, Text } from "@medusajs/ui"
import { MagnifyingGlassMini, XMarkMini } from "@medusajs/icons"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"
import { MEDUSA_BACKEND_URL } from "@lib/config"

/**
 * Custom search dropdown. Replaces the previous `react-instantsearch-hooks-web@6`
 * implementation, which is deprecated and breaks under React 19 — symptoms were:
 *  - blur overlay appearing without the search bar (InstantSearch context crash),
 *  - modal unable to be dismissed (`router.back()` no-op when arriving directly),
 *  - typing throwing intermittently across mount cycles.
 *
 * What this does instead:
 *  - Talks to Medusa's `/store/products?q=...` directly (Postgres ILIKE search).
 *    That's the same engine that powers `?q=` on the PLP, so consistency for free.
 *  - For the full-results page we keep the existing server action which hits
 *    Meilisearch — better ranking + typo tolerance, but doesn't block this UX.
 *  - No singleton client, no `<InstantSearch>` context, no dependency on a
 *    package that ships its own legacy `instantsearch.js`.
 */

type Hit = {
  id: string
  handle: string
  title: string
  thumbnail: string | null
}

const DEBOUNCE_MS = 200
const HIT_LIMIT = 6

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? ""

export default function SearchModal() {
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

  // `router.back()` no-ops for users who arrive directly at /<cc>/search,
  // which is the original bug that left them stranded. Route home as fallback.
  const close = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }
    router.push(countryCode ? `/${countryCode}` : "/")
  }

  // Lock body scroll while the modal is mounted.
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [])

  // Escape to close.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autofocus on open.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced live suggestions.
  useEffect(() => {
    if (!trimmedQuery) {
      setHits([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const url = new URL("/store/products", MEDUSA_BACKEND_URL)
        url.searchParams.set("q", trimmedQuery)
        url.searchParams.set("limit", String(HIT_LIMIT))
        url.searchParams.set("fields", "id,handle,title,thumbnail")

        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: PUBLISHABLE_KEY
            ? { "x-publishable-api-key": PUBLISHABLE_KEY }
            : undefined,
        })

        if (!response.ok) {
          throw new Error(`search responded ${response.status}`)
        }

        const data = (await response.json()) as {
          products?: Array<{
            id?: string
            handle?: string | null
            title?: string | null
            thumbnail?: string | null
          }>
        }

        const next: Hit[] = (data.products ?? [])
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
  }, [trimmedQuery])

  // Submit → full results page (Meili-backed).
  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!trimmedQuery) {
      return
    }
    const target = countryCode
      ? `/${countryCode}/results/${encodeURIComponent(trimmedQuery)}`
      : `/results/${encodeURIComponent(trimmedQuery)}`
    router.push(target)
  }

  const onOverlayClick = (event: React.MouseEvent) => {
    if (event.target === overlayRef.current) {
      close()
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
                onClick={close}
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
