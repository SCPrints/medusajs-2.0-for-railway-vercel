"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

type Variant = {
  slug: string
  label: string
  blurb: string
}

const VARIANTS: Variant[] = [
  {
    slug: "current",
    label: "Current",
    blurb: "Gallery sits inside the wizard at Step 1; swaps to Steps 2–4 on click.",
  },
  {
    slug: "no-gallery",
    label: "No gallery",
    blurb: "Canvas is the only product visualisation. Print-Bar style.",
  },
  {
    slug: "below",
    label: "Gallery below",
    blurb: "Gallery becomes a full-width section below the customizer.",
  },
  {
    slug: "tabs",
    label: "Gallery in tabs",
    blurb: "Gallery is the first tab alongside Specifications & Shipping.",
  },
]

type Props = {
  countryCode: string
}

/**
 * Sticky pill switcher rendered at the top of every /pdp-preview/* page so
 * the user can flip between layout variants without losing the product
 * handle they were viewing.
 */
export default function PreviewSwitcher({ countryCode }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const handleParam = searchParams?.get("handle")
  const querySuffix = handleParam ? `?handle=${encodeURIComponent(handleParam)}` : ""

  const activeBlurb = VARIANTS.find((v) =>
    pathname?.includes(`/pdp-preview/${v.slug}`)
  )?.blurb

  return (
    <div className="sticky top-0 z-40 -mx-4 mb-6 border-b border-ui-border-base bg-ui-bg-base/95 px-4 py-3 backdrop-blur small:-mx-6 small:px-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ui-fg-subtle">
            PDP layout preview
          </p>
          <span className="text-[11px] text-ui-fg-muted">·</span>
          <p className="text-[11px] text-ui-fg-muted">
            Throwaway pages for design review — not linked from nav.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {VARIANTS.map((v) => {
            const href = `/${countryCode}/pdp-preview/${v.slug}${querySuffix}`
            const active = pathname?.includes(`/pdp-preview/${v.slug}`)
            return (
              <Link
                key={v.slug}
                href={href}
                prefetch={false}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-ui-fg-base bg-ui-fg-base text-ui-bg-base"
                    : "border-ui-border-base bg-ui-bg-base text-ui-fg-base hover:border-ui-fg-base"
                }`}
              >
                {v.label}
              </Link>
            )
          })}
        </div>
        {activeBlurb ? (
          <p className="text-xs text-ui-fg-subtle">{activeBlurb}</p>
        ) : null}
      </div>
    </div>
  )
}
