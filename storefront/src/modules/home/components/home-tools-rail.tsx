import type { SVGProps } from "react"

import SectionHeader from "@modules/common/components/section-header"
import { iconBase } from "@modules/common/icons/icon-base"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Surfaces built-but-buried customer tools that previously had no home-page
// entry point (Phase 1 S2): the DTF gang-sheet builder, BYO (bring-your-own
// garments) and curated Bundles. Each card is a whole-card link to an existing
// route. (The "Design Studio" → /customizer card was removed — that standalone
// customizer is retired; designing now happens on the per-product PDP.)

const DtfBuilderIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...props}>
    <rect x="4" y="4" width="24" height="24" rx="2" />
    <path d="M4 12h24M4 20h24M12 4v24M20 4v24" />
  </svg>
)

const ByoIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...props}>
    <path d="M11 5l-5 3v6h4v12h12V14h4V8l-5-3-3 2.5a4 4 0 01-4 0z" />
    <path d="M16 14v8M12 18h8" />
  </svg>
)

const BundlesIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...props}>
    <path d="M16 3l11 6v14l-11 6-11-6V9z" />
    <path d="M5 9l11 6 11-6M16 15v14" />
  </svg>
)

type Tool = {
  id: string
  title: string
  description: string
  href: string
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element
}

const TOOLS: Tool[] = [
  {
    id: "dtf_builder",
    title: "DTF Gang Sheet Builder",
    description: "Pack multiple prints onto one sheet and only pay for the space.",
    href: "/dtf-builder",
    Icon: DtfBuilderIcon,
  },
  {
    id: "byo",
    title: "Bring Your Own Garments",
    description: "Already have stock? Send it in and we'll decorate it for you.",
    href: "/byo",
    Icon: ByoIcon,
  },
  {
    id: "bundles",
    title: "Curated Bundles",
    description: "Ready-made starter packs for teams, clubs and new businesses.",
    href: "/bundles",
    Icon: BundlesIcon,
  },
]

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

export default function HomeToolsRail() {
  return (
    <section className="content-container py-14">
      <SectionHeader
        eyebrow="Design &amp; order your way"
        title="Tools to get you started"
      />

      <ul className="mt-8 grid list-none grid-cols-1 gap-3 p-0 phone:grid-cols-2 phone:gap-4 small:grid-cols-3">
        {TOOLS.map((tool) => {
          const { Icon } = tool
          return (
            <li key={tool.id}>
              <LocalizedClientLink
                href={tool.href}
                className="group flex h-full min-h-12 flex-col rounded-lg border border-ui-border-base bg-white p-6 transition hover:-translate-y-0.5 hover:border-[var(--brand-secondary)]/40 hover:shadow-sm"
              >
                <Icon className="text-ui-fg-base transition-colors group-hover:text-[var(--brand-secondary)]" />
                <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-ui-fg-base">
                  {tool.title}
                </p>
                <p className="mt-2 flex-1 text-xs text-ui-fg-subtle">
                  {tool.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-secondary)]">
                  Open
                  <ArrowIcon />
                </span>
              </LocalizedClientLink>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
