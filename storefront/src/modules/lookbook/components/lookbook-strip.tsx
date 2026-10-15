import { listLookbookJobs } from "@lib/data/lookbook"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SectionHeader from "@modules/common/components/section-header"

import LookbookJobCard from "./lookbook-job-card"

type Props = {
  /** Jobs where any photo is linked to this garment (PDP). */
  productHandle?: string
  /** Jobs carrying this tag (industry pages use their slug). */
  tag?: string
  eyebrow?: string
  title: string
  limit?: number
}

/**
 * "Real jobs" rail of past work. Renders nothing when no job matches, so an
 * unlinked product / untagged industry page looks exactly as before. Wrap in
 * <Suspense fallback={null}> — it fetches.
 */
export default async function LookbookStrip({
  productHandle,
  tag,
  eyebrow = "Real jobs",
  title,
  limit = 4,
}: Props) {
  const jobs = await listLookbookJobs({ productHandle, tag, limit })
  if (!jobs.length) return null

  return (
    <section aria-label={title}>
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        action={
          <LocalizedClientLink
            href="/lookbook"
            className="text-sm font-semibold text-[var(--brand-secondary)] hover:underline"
          >
            See the full lookbook →
          </LocalizedClientLink>
        }
      />
      <ul className="grid grid-cols-2 gap-4 small:grid-cols-4">
        {jobs.map((job) => (
          <li key={job.slug}>
            <LookbookJobCard job={job} />
          </li>
        ))}
      </ul>
    </section>
  )
}
