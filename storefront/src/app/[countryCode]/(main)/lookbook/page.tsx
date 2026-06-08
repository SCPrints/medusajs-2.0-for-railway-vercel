import { Metadata } from "next"

import { getLookbookPage } from "@lib/data/lookbook"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const LOOKBOOK_PAGE_SIZE = 24

type Params = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ page?: string }>
}

export const metadata: Metadata = {
  title: "Lookbook",
  description: "Real SC PRINTS jobs in the wild — see what we make.",
}

/** Compact pager model: [1, "…", 4, 5, 6, "…", 20]. */
const buildPageList = (current: number, total: number): (number | "…")[] => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const out: (number | "…")[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) out.push("…")
  for (let p = start; p <= end; p++) out.push(p)
  if (end < total - 1) out.push("…")
  out.push(total)
  return out
}

const ArrowRightIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
)

export default async function LookbookPage({ searchParams }: Params) {
  const sp = await searchParams
  const requestedPage = Math.max(parseInt(String(sp?.page ?? "1"), 10) || 1, 1)

  const { items, count, limit, tags } = await getLookbookPage(
    requestedPage,
    LOOKBOOK_PAGE_SIZE
  )

  const totalPages = Math.max(Math.ceil(count / limit), 1)
  const currentPage = Math.min(requestedPage, totalPages)
  const pageHref = (n: number) => (n <= 1 ? "/lookbook" : `/lookbook?page=${n}`)

  return (
    <div className="content-container py-14 small:py-20">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]/70">
          See what we make
        </p>
        <h1 className="page-title-marketing mt-3 tracking-tight">Lookbook</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ui-fg-subtle small:text-lg">
          Real jobs from real teams. Browse for inspiration, or steal an idea
          for your next kit.
        </p>
      </header>

      {tags.length > 0 ? (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full border border-ui-border-base bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary)]/80"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-dashed border-ui-border-base bg-white p-10 text-center">
          <p className="text-sm text-ui-fg-subtle small:text-base">
            We&apos;re still building this gallery &mdash; check back soon, or
            reach out for our portfolio.
          </p>
          <div className="mt-6 flex justify-center">
            <LocalizedClientLink
              href="/contact"
              className="group inline-flex items-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Request the portfolio
              <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
            </LocalizedClientLink>
          </div>
        </div>
      ) : (
        <ul
          className="mt-10 columns-2 gap-4 small:columns-3 large:columns-4"
          style={{ columnFill: "balance" }}
        >
          {items.map((item) => (
            <li
              key={item.id}
              className="group mb-4 break-inside-avoid overflow-hidden rounded-xl border border-ui-border-base bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--brand-secondary)]/40 hover:shadow-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image_url}
                alt={item.title}
                loading="lazy"
                className="block w-full"
              />
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
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav
          className="mt-12 flex items-center justify-center gap-1.5"
          aria-label="Lookbook pagination"
        >
          {currentPage > 1 ? (
            <LocalizedClientLink
              href={pageHref(currentPage - 1)}
              rel="prev"
              className="inline-flex h-9 items-center rounded-lg border border-ui-border-base bg-white px-3 text-sm font-semibold text-ui-fg-base transition hover:border-[var(--brand-secondary)]/40"
            >
              Prev
            </LocalizedClientLink>
          ) : (
            <span className="inline-flex h-9 cursor-not-allowed items-center rounded-lg border border-ui-border-base bg-ui-bg-subtle px-3 text-sm font-semibold text-ui-fg-muted">
              Prev
            </span>
          )}

          {buildPageList(currentPage, totalPages).map((p, i) =>
            p === "…" ? (
              <span
                key={`gap-${i}`}
                className="inline-flex h-9 w-9 items-center justify-center text-sm text-ui-fg-muted"
              >
                …
              </span>
            ) : p === currentPage ? (
              <span
                key={p}
                aria-current="page"
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-[var(--brand-secondary)] px-3 text-sm font-semibold text-white"
              >
                {p}
              </span>
            ) : (
              <LocalizedClientLink
                key={p}
                href={pageHref(p)}
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-ui-border-base bg-white px-3 text-sm font-semibold text-ui-fg-base transition hover:border-[var(--brand-secondary)]/40"
              >
                {p}
              </LocalizedClientLink>
            )
          )}

          {currentPage < totalPages ? (
            <LocalizedClientLink
              href={pageHref(currentPage + 1)}
              rel="next"
              className="inline-flex h-9 items-center rounded-lg border border-ui-border-base bg-white px-3 text-sm font-semibold text-ui-fg-base transition hover:border-[var(--brand-secondary)]/40"
            >
              Next
            </LocalizedClientLink>
          ) : (
            <span className="inline-flex h-9 cursor-not-allowed items-center rounded-lg border border-ui-border-base bg-ui-bg-subtle px-3 text-sm font-semibold text-ui-fg-muted">
              Next
            </span>
          )}
        </nav>
      ) : null}
    </div>
  )
}
