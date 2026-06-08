import SectionHeader from "@modules/common/components/section-header"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { industries } from "@modules/industries/data/industries"

// "Shop by industry" entry point (Phase 1 P7). Routes segmented B2B buyers to
// the existing /industries/[slug] landing pages. Reuses the hardcoded
// `industries` config as the single source of truth — names/slugs stay in sync
// with the menu + landing pages automatically. Short blurbs are presentation
// copy kept here so the cards stay scannable (the data `description` fields are
// full paragraphs).

const BLURBS: Record<string, string> = {
  trades: "Hi-vis, workwear & embroidered uniforms",
  events: "Crew tees, staff merch & attendee apparel",
  hospitality: "Aprons, polos & headwear for venues",
  corporate: "Branded uniforms & corporate merch",
  sports: "Jerseys, hoodies & supporter gear",
  schools: "School merch, teacher polos & leavers' gear",
}

const ArrowIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="transition-transform group-hover:translate-x-0.5"
    aria-hidden
  >
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
)

export default function HomeIndustryGrid() {
  return (
    <section className="content-container py-14">
      <SectionHeader
        eyebrow="Built for your team"
        title="Shop by industry"
      />

      <ul className="mt-8 grid list-none grid-cols-1 gap-3 p-0 phone:grid-cols-2 phone:gap-4 small:grid-cols-3">
        {industries.map((industry) => (
          <li key={industry.slug}>
            <LocalizedClientLink
              href={`/industries/${industry.slug}`}
              className="group flex h-full min-h-12 items-center justify-between gap-4 rounded-lg border border-ui-border-base bg-white p-6 transition hover:-translate-y-0.5 hover:border-[var(--brand-secondary)]/40 hover:shadow-sm"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ui-fg-base">
                  {industry.name}
                </p>
                <p className="mt-1 text-xs text-ui-fg-subtle">
                  {BLURBS[industry.slug] ?? ""}
                </p>
              </div>
              <span className="shrink-0 text-ui-fg-muted transition-colors group-hover:text-[var(--brand-secondary)]">
                <ArrowIcon />
              </span>
            </LocalizedClientLink>
          </li>
        ))}
      </ul>
    </section>
  )
}
