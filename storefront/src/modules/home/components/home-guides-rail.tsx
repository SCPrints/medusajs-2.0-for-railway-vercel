import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SectionHeader from "@modules/common/components/section-header"
import GuideCard from "@modules/guides/components/guide-card"
import { GUIDES } from "@modules/guides/guides"

// Home-page entry point for the guides. Shows the first three from the shared
// list; "All guides" leads to the full index.
export default function HomeGuidesRail() {
  return (
    <section className="content-container py-14">
      <SectionHeader
        eyebrow="Know before you order"
        title="Guides"
        action={
          <LocalizedClientLink
            href="/guides"
            className="inline-flex min-h-11 items-center text-sm font-semibold !text-[var(--brand-secondary)] underline underline-offset-4"
          >
            All guides
          </LocalizedClientLink>
        }
      />
      <ul className="grid list-none grid-cols-1 gap-4 p-0 phone:grid-cols-2 small:grid-cols-3">
        {GUIDES.slice(0, 3).map((guide) => (
          <li key={guide.slug}>
            <GuideCard guide={guide} />
          </li>
        ))}
      </ul>
    </section>
  )
}
