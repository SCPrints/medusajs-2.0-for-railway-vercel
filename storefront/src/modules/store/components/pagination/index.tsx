"use client"

import { clx } from "@medusajs/ui"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export function Pagination({
  page,
  totalPages,
  'data-testid': dataTestid
}: {
  page: number
  totalPages: number
  'data-testid'?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Helper function to generate an array of numbers within a range
  const arrayRange = (start: number, stop: number) =>
    Array.from({ length: stop - start + 1 }, (_, index) => start + index)

  // Function to handle page changes
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set("page", newPage.toString())
    router.push(`${pathname}?${params.toString()}`)
  }

  // Function to render a page button
  const renderPageButton = (
    p: number,
    label: string | number,
    isCurrent: boolean
  ) => (
    <button
      key={p}
      aria-label={`Go to page ${label}`}
      aria-current={isCurrent ? "page" : undefined}
      className={clx(
        "txt-xlarge-plus inline-flex items-center justify-center min-w-10 h-10 px-3 rounded-full leading-none select-none transition-transform transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-background)]",
        {
          "bg-[var(--brand-secondary)] text-white shadow-md scale-110 cursor-default":
            isCurrent,
          "text-[var(--brand-primary)]/70 hover:text-white hover:bg-[var(--brand-secondary)] hover:scale-125 active:scale-110":
            !isCurrent,
        }
      )}
      disabled={isCurrent}
      onClick={() => handlePageChange(p)}
    >
      {label}
    </button>
  )

  // Function to render ellipsis
  const renderEllipsis = (key: string) => (
    <span
      key={key}
      className="txt-xlarge-plus inline-flex items-center justify-center min-w-10 h-10 text-[var(--brand-primary)]/50 cursor-default select-none"
    >
      ...
    </span>
  )

  // Function to render a navigation arrow button (first / prev / next / last)
  const renderNavButton = (
    target: number,
    label: string,
    icon: React.ReactNode,
    disabled: boolean
  ) => (
    <button
      key={label}
      aria-label={label}
      className={clx(
        "inline-flex items-center justify-center min-w-10 h-10 px-2 rounded-full leading-none select-none transition-transform transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-background)]",
        {
          "text-[var(--brand-primary)]/30 cursor-not-allowed": disabled,
          "text-[var(--brand-primary)]/70 hover:text-white hover:bg-[var(--brand-secondary)] hover:scale-125 active:scale-110":
            !disabled,
        }
      )}
      disabled={disabled}
      onClick={() => handlePageChange(target)}
    >
      {icon}
    </button>
  )

  // Inline chevron icons for consistent stroke sizing
  const ChevronIcon = ({ double = false, direction }: { double?: boolean; direction: "left" | "right" }) => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={direction === "right" ? "rotate-180" : undefined}
    >
      {double ? (
        <>
          <polyline points="17 17 12 12 17 7" />
          <polyline points="11 17 6 12 11 7" />
        </>
      ) : (
        <polyline points="15 18 9 12 15 6" />
      )}
    </svg>
  )

  // Function to render page buttons based on the current page and total pages
  const renderPageButtons = () => {
    const buttons = []

    if (totalPages <= 7) {
      // Show all pages
      buttons.push(
        ...arrayRange(1, totalPages).map((p) =>
          renderPageButton(p, p, p === page)
        )
      )
    } else {
      // Handle different cases for displaying pages and ellipses
      if (page <= 4) {
        // Show 1, 2, 3, 4, 5, ..., lastpage
        buttons.push(
          ...arrayRange(1, 5).map((p) => renderPageButton(p, p, p === page))
        )
        buttons.push(renderEllipsis("ellipsis1"))
        buttons.push(
          renderPageButton(totalPages, totalPages, totalPages === page)
        )
      } else if (page >= totalPages - 3) {
        // Show 1, ..., lastpage - 4, lastpage - 3, lastpage - 2, lastpage - 1, lastpage
        buttons.push(renderPageButton(1, 1, 1 === page))
        buttons.push(renderEllipsis("ellipsis2"))
        buttons.push(
          ...arrayRange(totalPages - 4, totalPages).map((p) =>
            renderPageButton(p, p, p === page)
          )
        )
      } else {
        // Show 1, ..., page - 1, page, page + 1, ..., lastpage
        buttons.push(renderPageButton(1, 1, 1 === page))
        buttons.push(renderEllipsis("ellipsis3"))
        buttons.push(
          ...arrayRange(page - 1, page + 1).map((p) =>
            renderPageButton(p, p, p === page)
          )
        )
        buttons.push(renderEllipsis("ellipsis4"))
        buttons.push(
          renderPageButton(totalPages, totalPages, totalPages === page)
        )
      }
    }

    return buttons
  }

  const isFirstPage = page <= 1
  const isLastPage = page >= totalPages

  // Render the component
  return (
    <div className="flex justify-center w-full mt-12">
      <div
        className="flex gap-2 items-center"
        data-testid={dataTestid}
      >
        {renderNavButton(
          1,
          "Go to first page",
          <ChevronIcon double direction="left" />,
          isFirstPage
        )}
        {renderNavButton(
          Math.max(1, page - 1),
          "Go to previous page",
          <ChevronIcon direction="left" />,
          isFirstPage
        )}
        {renderPageButtons()}
        {renderNavButton(
          Math.min(totalPages, page + 1),
          "Go to next page",
          <ChevronIcon direction="right" />,
          isLastPage
        )}
        {renderNavButton(
          totalPages,
          "Go to last page",
          <ChevronIcon double direction="right" />,
          isLastPage
        )}
      </div>
    </div>
  )
}
