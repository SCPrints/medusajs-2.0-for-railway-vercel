"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { LookbookItem } from "@lib/data/lookbook"

type Props = {
  items: LookbookItem[]
}

/**
 * Masonry grid of lookbook tiles with a click-to-enlarge lightbox.
 *
 * Rendered as a client component so the tiles can be buttons that open a
 * centered overlay (full-size image + caption). Esc / backdrop click closes;
 * Left / Right arrows (and on-screen chevrons) move between tiles. Navigation
 * stays within the current page's loaded items — paging across the whole set
 * happens via the page pager, not the lightbox.
 */
export default function LookbookGallery({ items }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const isOpen = openIndex !== null
  const current = isOpen ? items[openIndex] : null
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  const close = useCallback(() => setOpenIndex(null), [])
  const next = useCallback(
    () =>
      setOpenIndex((i) => (i === null ? i : (i + 1) % items.length)),
    [items.length]
  )
  const prev = useCallback(
    () =>
      setOpenIndex((i) =>
        i === null ? i : (i - 1 + items.length) % items.length
      ),
    [items.length]
  )

  // Keyboard: Esc to close, arrows to navigate.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      else if (e.key === "ArrowRight") next()
      else if (e.key === "ArrowLeft") prev()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, close, next, prev])

  // Lock body scroll while the lightbox is open + focus the close button.
  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeBtnRef.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen])

  const hasMany = items.length > 1

  return (
    <>
      <ul
        className="mt-10 columns-2 gap-4 small:columns-3 large:columns-4"
        style={{ columnFill: "balance" }}
      >
        {items.map((item, i) => (
          <li key={item.id} className="mb-4 break-inside-avoid">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`Enlarge ${item.title}`}
              className="group block w-full cursor-zoom-in overflow-hidden rounded-xl border border-ui-border-base bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--brand-secondary)]/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/60"
            >
              <div className="overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image_url}
                  alt={item.title}
                  loading="lazy"
                  className="block w-full transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                />
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold text-ui-fg-base">
                  {item.title}
                </p>
                {item.description ? (
                  <p className="mt-1 text-xs text-ui-fg-subtle">
                    {item.description}
                  </p>
                ) : null}
                {item.attribution ? (
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
                    Photo by {item.attribution}
                  </p>
                ) : null}
                {item.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {item.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex rounded-full border border-ui-border-base bg-ui-bg-subtle px-2 py-0.5 text-[10px] font-medium text-ui-fg-subtle"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {isOpen && current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.title}
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm small:p-8"
        >
          {/* Close */}
          <button
            ref={closeBtnRef}
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 small:right-5 small:top-5"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {/* Prev */}
          {hasMany ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                prev()
              }}
              aria-label="Previous"
              className="absolute left-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 small:left-5"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          ) : null}

          {/* Next */}
          {hasMany ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                next()
              }}
              aria-label="Next"
              className="absolute right-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 small:right-5"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : null}

          <figure
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] max-w-5xl flex-col items-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.image_url}
              alt={current.title}
              className="max-h-[78vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
            />
            <figcaption className="mt-4 max-w-2xl text-center">
              <p className="text-base font-semibold text-white">
                {current.title}
              </p>
              {current.description ? (
                <p className="mt-1 text-sm text-white/70">
                  {current.description}
                </p>
              ) : null}
              {current.attribution ? (
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">
                  Photo by {current.attribution}
                </p>
              ) : null}
              {current.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap justify-center gap-1">
                  {current.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/70"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              {hasMany ? (
                <p className="mt-3 text-xs font-medium text-white/40">
                  {openIndex! + 1} / {items.length}
                </p>
              ) : null}
            </figcaption>
          </figure>
        </div>
      ) : null}
    </>
  )
}
