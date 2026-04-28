"use client"

import HowOrderSvgIcon from "@modules/home/components/how-order-svg-icon"
import {
  getServicesOfferedIcon,
  SERVICES_OFFERED_ANIMATION_BY_ID,
  SERVICES_OFFERED_ICON_IDS,
} from "@modules/home/lib/services-offered-icons"

export default function HomeCoreServicesLordicons() {
  return (
    <div className="mt-8 grid gap-4 small:grid-cols-2 large:grid-cols-4">
      {SERVICES_OFFERED_ICON_IDS.map((id) => {
        const icon = getServicesOfferedIcon(id)
        const variant = SERVICES_OFFERED_ANIMATION_BY_ID[id]
        return (
          <article
            key={id}
            className="rounded-xl border border-ui-border-base bg-white p-5 text-center transition-colors hover:border-[var(--brand-secondary)]/55"
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)]">
              <HowOrderSvgIcon
                svgContent={icon.svg_content}
                variant={variant}
                maxSizePx={44}
                className="flex-shrink-0 text-ui-fg-base"
              />
            </div>
            <p className="text-sm font-semibold text-ui-fg-base">{icon.title}</p>
          </article>
        )
      })}
    </div>
  )
}
