"use client"

import { ArrowRightMini } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type { MenuAudience } from "@lib/data/shop-categories-menu"

import { groupSubsByCluster } from "./cluster-grouping"

/**
 * Single audience's dropdown panel — text columns of links grouped by
 * garment cluster (T-Shirts, Sweatshirts, Polos & Shirts, etc.).
 *
 * Rendered absolute-positioned by the parent DesktopMegaMenu when its
 * audience is the active one. The panel itself doesn't manage open/close
 * state — that's the parent's responsibility. The panel only fires
 * onLinkClick when a sub-link is clicked so the parent can close.
 */

type Props = {
  audience: MenuAudience
  onLinkClick?: () => void
}

const AudienceDropdown = ({ audience, onLinkClick }: Props) => {
  const clusters = groupSubsByCluster(audience.subs)

  return (
    <div
      className="content-container flex flex-col gap-6 py-8 text-sm text-[#F8FAFC]"
      role="region"
      aria-label={`${audience.name} categories`}
    >
      {/* Cluster columns — auto-flowing CSS grid; each cluster is its own
          column with a header and the sub links beneath. */}
      <div
        className={[
          "grid gap-x-10 gap-y-6",
          // Up to 5 clusters fit side-by-side on a wide screen.
          // The auto-fit keeps narrower screens from squishing.
          "grid-cols-[repeat(auto-fit,minmax(180px,1fr))]",
        ].join(" ")}
      >
        {clusters.map((cluster) => (
          <div key={cluster.name} className="flex flex-col gap-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-secondary)]">
              {cluster.name}
            </h3>
            <ul className="flex flex-col gap-y-2">
              {cluster.subs.map((sub) => (
                <li key={sub.handle}>
                  <LocalizedClientLink
                    href={`/categories/${sub.handle}`}
                    onClick={onLinkClick}
                    className="group inline-flex items-center gap-x-1.5 text-sm text-[#F8FAFC]/85 transition-colors hover:text-[var(--brand-accent)] focus:text-[var(--brand-accent)] focus:outline-none"
                  >
                    <span>{sub.name}</span>
                    <span className="text-[10px] text-[#F8FAFC]/40 group-hover:text-[#F8FAFC]/60 transition-colors">
                      {sub.product_count}
                    </span>
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* "Shop all" footer — drops the user on the audience landing page
          (existing /categories/<audience> route). */}
      <div className="flex items-center justify-between border-t border-white/10 pt-4">
        <LocalizedClientLink
          href={`/categories/${audience.handle}`}
          onClick={onLinkClick}
          className="group inline-flex items-center gap-x-1 text-sm font-medium text-[var(--brand-secondary)] hover:text-[var(--brand-accent)] transition-colors"
        >
          <span>Shop all {audience.name}</span>
          <ArrowRightMini className="transition-transform duration-150 group-hover:translate-x-0.5" />
        </LocalizedClientLink>
        <span className="text-xs text-[#F8FAFC]/40">
          {audience.total_products} product placement
          {audience.total_products === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  )
}

export default AudienceDropdown
