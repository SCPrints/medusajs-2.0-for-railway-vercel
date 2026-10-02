import Image from "next/image"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { guideHref, type GuideEntry } from "@modules/guides/guides"

/** Whole-card link to a guide. Used by the /guides index and the home rail. */
export default function GuideCard({
  guide,
  sizes = "(min-width: 1024px) 33vw, (min-width: 480px) 50vw, 100vw",
}: {
  guide: GuideEntry
  sizes?: string
}) {
  return (
    <LocalizedClientLink
      href={guideHref(guide)}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-ui-border-base bg-white !text-ui-fg-base transition hover:-translate-y-0.5 hover:border-[var(--brand-secondary)] hover:shadow-md"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--brand-primary)]">
        {guide.cover ? (
          <Image
            src={guide.cover}
            alt={guide.coverAlt}
            fill
            sizes={sizes}
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          // CMYK swatch tile for the colour guide, which has no photo.
          <div aria-hidden className="grid h-full grid-cols-4">
            <span className="bg-[#00aeef]" />
            <span className="bg-[#ec008c]" />
            <span className="bg-[#fff200]" />
            <span className="bg-[#231f20]" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-md bg-white px-2 py-1 text-xs font-semibold !text-[var(--brand-primary)] shadow-sm">
          {guide.tag}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-semibold leading-snug text-ui-fg-base">{guide.title}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-ui-fg-subtle">{guide.blurb}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-secondary)]">
          Read the guide
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </span>
      </div>
    </LocalizedClientLink>
  )
}
