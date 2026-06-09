import Image from "next/image"

import type { LookbookItem } from "@lib/data/lookbook"

import SectionHeader from "@modules/common/components/section-header"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// "Our recent work" social-proof rail (Phase 1 P3). Reuses the existing
// Lookbook data (curated finished client jobs) — the cheapest social-proof
// win since none of our competitors surface real work either. Deliberately a
// STATIC grid (not a marquee) so we don't stack a third always-running scroll
// animation alongside the brand bar + Instagram strip. Renders nothing when no
// lookbook tiles are published, so the section never shows empty.

const MAX_TILES = 8

const ViewAllLink = () => (
  <LocalizedClientLink
    href="/lookbook"
    className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--brand-secondary)] transition hover:brightness-110"
  >
    View the lookbook
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform group-hover:translate-x-0.5"
      aria-hidden
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  </LocalizedClientLink>
)

export default function HomeLookbookRail({
  items,
}: {
  items: LookbookItem[]
}) {
  const tiles = items.slice(0, MAX_TILES)

  if (tiles.length === 0) {
    return null
  }

  return (
    <section className="border-t border-ui-border-base bg-ui-bg-subtle py-12 small:py-16">
      <div className="content-container">
        <SectionHeader
          eyebrow="Real jobs, real teams"
          title="Our recent work"
          action={<ViewAllLink />}
        />

        <ul className="mt-2 grid list-none grid-cols-2 gap-3 p-0 phone:gap-4 tablet:grid-cols-3 small:grid-cols-4">
          {tiles.map((item) => (
            <li key={item.id}>
              <LocalizedClientLink
                href="/lookbook"
                className="group block overflow-hidden rounded-lg border border-ui-border-base bg-white"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-ui-bg-subtle">
                  {/* next/image resamples server-side to the tile size (R2 host
                      is allowlisted in next.config.js), which removes the
                      downscaling moiré a raw full-res <img> showed and cuts
                      payload. Fixed aspect-[4/5] box → fill + object-cover. */}
                  <Image
                    src={item.image_url}
                    alt={item.title}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                {(item.title || item.attribution) && (
                  <div className="p-3">
                    {item.title && (
                      <p className="truncate text-xs font-semibold text-ui-fg-base phone:text-sm">
                        {item.title}
                      </p>
                    )}
                    {item.attribution && (
                      <p className="mt-0.5 truncate text-[11px] text-ui-fg-subtle phone:text-xs">
                        {item.attribution}
                      </p>
                    )}
                  </div>
                )}
              </LocalizedClientLink>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
