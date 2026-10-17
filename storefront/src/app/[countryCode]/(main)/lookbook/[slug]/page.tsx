import { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"

import { getLookbookJob } from "@lib/data/lookbook"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SectionHeader from "@modules/common/components/section-header"
import { industries } from "@modules/industries/data/industries"
import LookbookJobCard from "@modules/lookbook/components/lookbook-job-card"

// No generateStaticParams, same as products/bundles: a slow backend must
// never be able to fail the build. Pages render on first hit, then cache
// (data is "use cache: remote" + tagged "lookbook", purged on admin edits).

type Params = {
  params: Promise<{ countryCode: string; slug: string }>
}

const industryBySlug = new Map(industries.map((i) => [i.slug, i]))

const describe = (job: {
  title: string
  description: string | null
  tags: string[]
}) => {
  if (job.description?.trim()) return job.description.trim()
  const industry = job.tags.map((t) => industryBySlug.get(t)).find(Boolean)
  return industry
    ? `Custom ${industry.name.toLowerCase()} apparel SC PRINTS printed for ${job.title}. See the finished job and start your own.`
    : `Custom printed apparel SC PRINTS made for ${job.title}. See the finished job and start your own.`
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { countryCode, slug } = await params
  const data = await getLookbookJob(slug)
  if (!data) return { title: "Lookbook" }
  const { job } = data

  const canonicalPath = `/${countryCode}/lookbook/${job.slug}`
  const title = `${job.title} — custom apparel`
  const description = describe(job)
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    // Only real client jobs (industry-tagged in admin) are indexed. Untagged
    // tiles are mostly design showcases / fan art — reachable, never indexed.
    robots: job.tags.some((t) => industryBySlug.has(t))
      ? undefined
      : { index: false, follow: true },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: `${title} | ${SEO.siteName}`,
      description,
      images: [{ url: job.cover_image_url }],
    },
    twitter: {
      title: `${title} | ${SEO.siteName}`,
      description,
      images: [job.cover_image_url],
    },
  }
}

export default async function LookbookJobPage({ params }: Params) {
  const { slug } = await params
  const data = await getLookbookJob(slug)
  if (!data) notFound()
  const { job, related } = data

  const primaryProduct = job.products[0]
  const jobIndustries = job.tags
    .map((t) => industryBySlug.get(t))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
  const otherTags = job.tags.filter((t) => !industryBySlug.has(t))

  return (
    <div className="content-container py-10 small:py-16">
      <nav aria-label="Breadcrumb" className="text-sm text-ui-fg-muted">
        <LocalizedClientLink href="/lookbook" className="hover:text-ui-fg-base">
          Lookbook
        </LocalizedClientLink>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="text-ui-fg-subtle">{job.title}</span>
      </nav>

      <header className="mt-6 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-ui-fg-base small:text-4xl">
          {job.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ui-fg-subtle small:text-lg">
          {describe(job)}
        </p>

        {jobIndustries.length || otherTags.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {jobIndustries.map((i) => (
              <LocalizedClientLink
                key={i.slug}
                href={`/industries/${i.slug}`}
                className="inline-flex min-h-9 items-center rounded-full border border-ui-border-base bg-white px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary)]/80 hover:border-[var(--brand-secondary)]/40"
              >
                {i.name}
              </LocalizedClientLink>
            ))}
            {otherTags.map((t) => (
              <span
                key={t}
                className="inline-flex min-h-9 items-center rounded-full border border-ui-border-base bg-ui-bg-subtle px-3 text-xs font-medium text-ui-fg-subtle"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <LocalizedClientLink
            href={
              primaryProduct
                ? `/products/${primaryProduct.handle}`
                : "/contact?ref=lookbook"
            }
            className="inline-flex min-h-11 items-center rounded-full bg-brand px-6 text-base font-medium text-white transition-colors hover:bg-accent"
          >
            Start a job like this →
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/contact?ref=lookbook"
            className="inline-flex min-h-11 items-center rounded-full border border-ui-border-base px-6 text-base font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
          >
            Ask us about it
          </LocalizedClientLink>
        </div>
      </header>

      <ul className="mt-10 grid grid-cols-1 gap-4 phone:grid-cols-2 small:grid-cols-3">
        {job.images.map((img, i) => (
          <li
            key={img.id}
            className="relative aspect-[4/5] overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-subtle"
          >
            <Image
              src={img.image_url}
              alt={`${job.title} — photo ${i + 1}`}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 480px) 50vw, 100vw"
              className="object-cover"
              priority={i === 0}
            />
            {img.attribution ? (
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                Photo by {img.attribution}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {job.products.length > 0 ? (
        <section className="mt-16">
          <SectionHeader eyebrow="Garments used" title="Print on the same blanks" />
          <ul className="grid grid-cols-2 gap-4 small:grid-cols-4">
            {job.products.map((p) => (
              <li key={p.handle}>
                <LocalizedClientLink
                  href={`/products/${p.handle}`}
                  className="group block overflow-hidden rounded-xl border border-ui-border-base bg-white shadow-sm transition hover:border-[var(--brand-secondary)]/40 hover:shadow-md"
                >
                  <div className="relative aspect-square bg-ui-bg-subtle">
                    {p.thumbnail ? (
                      <Image
                        src={p.thumbnail}
                        alt={p.title}
                        fill
                        sizes="(min-width: 1024px) 25vw, 50vw"
                        className="object-contain p-3"
                      />
                    ) : null}
                  </div>
                  <p className="p-3 text-sm font-semibold text-ui-fg-base">
                    {p.title}
                  </p>
                </LocalizedClientLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section className="mt-16">
          <SectionHeader eyebrow="More jobs" title="Other work we've made" />
          <ul className="grid grid-cols-2 gap-4 small:grid-cols-4">
            {related.map((r) => (
              <li key={r.slug}>
                <LookbookJobCard job={r} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
