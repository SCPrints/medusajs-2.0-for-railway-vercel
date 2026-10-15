import Image from "next/image"

import type { LookbookJob } from "@lib/data/lookbook"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/** One past job → its `/lookbook/<slug>` page. Shared by every lookbook strip. */
export default function LookbookJobCard({ job }: { job: LookbookJob }) {
  return (
    <LocalizedClientLink
      href={`/lookbook/${job.slug}`}
      className="group block overflow-hidden rounded-xl border border-ui-border-base bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--brand-secondary)]/40 hover:shadow-md"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-ui-bg-subtle">
        <Image
          src={job.cover_image_url}
          alt={job.title}
          fill
          sizes="(min-width: 1024px) 25vw, 50vw"
          className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
        />
        {job.image_count > 1 ? (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
            {job.image_count} photos
          </span>
        ) : null}
      </div>
      <p className="p-3 text-sm font-semibold text-ui-fg-base">{job.title}</p>
    </LocalizedClientLink>
  )
}
