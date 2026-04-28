"use client"

import {
  SERVICES_LORDICON_URLS,
} from "@modules/home/components/home-lordicon-urls"
import LordiconDecorativeIcon from "@modules/home/components/lordicon-decorative-icon"
import {
  DesignIcon,
  DigitalTransferIcon,
  EmbroideryIcon,
  FoldAndBagIcon,
  NeckTagIcon,
  ScreenPrintIcon,
  UvPrintingIcon,
  WarehousingIcon,
} from "@modules/home/components/service-icons"

const ROWS = [
  { title: "Screen Print", Icon: ScreenPrintIcon },
  { title: "Digital Transfer", Icon: DigitalTransferIcon },
  { title: "Embroidery", Icon: EmbroideryIcon },
  { title: "Neck Tags", Icon: NeckTagIcon },
  { title: "Fold & Bag", Icon: FoldAndBagIcon },
  { title: "Warehousing & Fulfillment", Icon: WarehousingIcon },
  { title: "UV Printing", Icon: UvPrintingIcon },
  { title: "Design", Icon: DesignIcon },
] as const

export default function HomeCoreServicesLordicons() {
  return (
    <div className="mt-8 grid gap-4 small:grid-cols-2 large:grid-cols-4">
      {ROWS.map((service) => (
        <article
          key={service.title}
          className="rounded-xl border border-ui-border-base bg-white p-5 text-center transition-colors hover:border-[var(--brand-secondary)]/55"
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)]">
            <LordiconDecorativeIcon
              lordiconJsonUrl={SERVICES_LORDICON_URLS[service.title]}
              size={44}
              className="flex items-center justify-center"
              FallbackIcon={service.Icon}
              fallbackClassName="h-6 w-6"
            />
          </div>
          <p className="text-sm font-semibold text-ui-fg-base">{service.title}</p>
        </article>
      ))}
    </div>
  )
}
