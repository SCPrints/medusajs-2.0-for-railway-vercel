"use client"

import { clx } from "@medusajs/ui"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

const BRAND_PRIMARY = "#1a1a2e"
const BRAND_SECONDARY = "#ff2e63"
const BRAND_BACKGROUND = "#eeeeee"

// Shared layout + motion classes for every button in the pagination bar.
const BASE_BUTTON_CLASSES =
  "group relative inline-flex items-center justify-center min-w-10 h-10 px-3 rounded-full leading-none select-none transition-[transform,background-color,color,box-shadow] duration-200 ease-out focus:outline-none"

export function Pagination({
  page,
  totalPages,
  "data-testid": dataTestid,
}: {
  page: number
  totalPages: number
  "data-testid"?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const arrayRange = (start: number, stop: number) =>
    Array.from({ length: stop - start + 1 }, (_, index) => start + index)

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set("page", newPage.toString())
    router.push(`${pathname}?${params.toString()}`)
  }

  // Mouse hover state must drive scale + color: we use CSS sibling selectors via
  // inline onMouseEnter/Leave to keep all styling self-contained and avoid
  // Tailwind JIT quirks with CSS variable opacity.
  const PageButton = ({
    p,
    label,
    isCurrent,
  }: {
    p: number
    label: string | number
    isCurrent: boolean
  }) => (
    <button
      aria-label={`Go to page ${label}`}
      aria-current={isCurrent ? "page" : undefined}
      disabled={isCurrent}
      onClick={() => handlePageChange(p)}
      className={clx(
        BASE_BUTTON_CLASSES,
        "text-base font-semibold",
        isCurrent
          ? "scale-110 shadow-md cursor-default"
          : "hover:scale-125 active:scale-110 cursor-pointer"
      )}
      style={
        isCurrent
          ? {
              backgroundColor: BRAND_SECONDARY,
              color: "#ffffff",
            }
          : {
              backgroundColor: "transparent",
              color: BRAND_PRIMARY,
            }
      }
      onMouseEnter={(e) => {
        if (isCurrent) return
        e.currentTarget.style.backgroundColor = BRAND_SECONDARY
        e.currentTarget.style.color = "#ffffff"
      }}
      onMouseLeave={(e) => {
        if (isCurrent) return
        e.currentTarget.style.backgroundColor = "transparent"
        e.currentTarget.style.color = BRAND_PRIMARY
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 3px ${BRAND_BACKGROUND}, 0 0 0 5px ${BRAND_SECONDARY}`
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = isCurrent
          ? "0 4px 12px rgba(255, 46, 99, 0.35)"
          : "none"
      }}
    >
      {label}
    </button>
  )

  const Ellipsis = ({ id }: { id: string }) => (
    <span
      key={id}
      className="inline-flex items-center justify-center min-w-10 h-10 text-base font-semibold select-none cursor-default"
      style={{ color: "rgba(26, 26, 46, 0.45)" }}
    >
      …
    </span>
  )

  const NavButton = ({
    target,
    label,
    disabled,
    children,
  }: {
    target: number
    label: string
    disabled: boolean
    children: React.ReactNode
  }) => (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => handlePageChange(target)}
      className={clx(
        BASE_BUTTON_CLASSES,
        "px-2",
        disabled
          ? "cursor-not-allowed"
          : "hover:scale-125 active:scale-110 cursor-pointer"
      )}
      style={{
        backgroundColor: "transparent",
        color: disabled ? "rgba(26, 26, 46, 0.25)" : BRAND_PRIMARY,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.backgroundColor = BRAND_SECONDARY
        e.currentTarget.style.color = "#ffffff"
      }}
      onMouseLeave={(e) => {
        if (disabled) return
        e.currentTarget.style.backgroundColor = "transparent"
        e.currentTarget.style.color = BRAND_PRIMARY
      }}
      onFocus={(e) => {
        if (disabled) return
        e.currentTarget.style.boxShadow = `0 0 0 3px ${BRAND_BACKGROUND}, 0 0 0 5px ${BRAND_SECONDARY}`
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      {children}
    </button>
  )

  const Chevron = ({
    double = false,
    direction,
  }: {
    double?: boolean
    direction: "left" | "right"
  }) => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: direction === "right" ? "rotate(180deg)" : undefined }}
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

  const renderPageButtons = () => {
    const buttons: React.ReactNode[] = []

    const pushPage = (p: number) =>
      buttons.push(
        <PageButton key={`p-${p}`} p={p} label={p} isCurrent={p === page} />
      )

    if (totalPages <= 7) {
      arrayRange(1, totalPages).forEach(pushPage)
    } else if (page <= 4) {
      arrayRange(1, 5).forEach(pushPage)
      buttons.push(<Ellipsis key="ellipsis1" id="ellipsis1" />)
      pushPage(totalPages)
    } else if (page >= totalPages - 3) {
      pushPage(1)
      buttons.push(<Ellipsis key="ellipsis2" id="ellipsis2" />)
      arrayRange(totalPages - 4, totalPages).forEach(pushPage)
    } else {
      pushPage(1)
      buttons.push(<Ellipsis key="ellipsis3" id="ellipsis3" />)
      arrayRange(page - 1, page + 1).forEach(pushPage)
      buttons.push(<Ellipsis key="ellipsis4" id="ellipsis4" />)
      pushPage(totalPages)
    }

    return buttons
  }

  const isFirstPage = page <= 1
  const isLastPage = page >= totalPages

  return (
    <div className="flex justify-center w-full mt-12">
      <div className="flex gap-2 items-center" data-testid={dataTestid}>
        <NavButton
          target={1}
          label="Go to first page"
          disabled={isFirstPage}
        >
          <Chevron double direction="left" />
        </NavButton>
        <NavButton
          target={Math.max(1, page - 1)}
          label="Go to previous page"
          disabled={isFirstPage}
        >
          <Chevron direction="left" />
        </NavButton>
        {renderPageButtons()}
        <NavButton
          target={Math.min(totalPages, page + 1)}
          label="Go to next page"
          disabled={isLastPage}
        >
          <Chevron direction="right" />
        </NavButton>
        <NavButton
          target={totalPages}
          label="Go to last page"
          disabled={isLastPage}
        >
          <Chevron double direction="right" />
        </NavButton>
      </div>
    </div>
  )
}
