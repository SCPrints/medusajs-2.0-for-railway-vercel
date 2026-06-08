import type { SVGProps } from "react"

import SectionHeader from "@modules/common/components/section-header"
import { iconBase } from "@modules/common/icons/icon-base"

// Risk-reversal / "our promise" block (Phase 1 P5). Every claim here maps to a
// real, already-built capability — the digital-proof/artwork-approval flow, the
// free DPI check, the in-house NSW studio, and transparent bulk-tier pricing on
// product cards. Deliberately NO money-back / reprint guarantee: that's an
// owner decision, not something to assert here without sign-off.

const ProofIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...props}>
    <path d="M19 3H8a2 2 0 00-2 2v22a2 2 0 002 2h16a2 2 0 002-2V10z" />
    <path d="M19 3v7h7" />
    <path d="M11 19l3 3 6-6" />
  </svg>
)

const DpiIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...props}>
    <rect x="4" y="4" width="24" height="18" rx="2" />
    <path d="M4 17l6-5 5 4 4-3 9 6" />
    <path d="M18 26l3 3 6-7" />
  </svg>
)

const PeopleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...props}>
    <circle cx="16" cy="11" r="5" />
    <path d="M6 28a10 10 0 0120 0" />
  </svg>
)

const PriceIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...props}>
    <path d="M16 4H7a3 3 0 00-3 3v9l12 12 12-12z" />
    <circle cx="10.5" cy="10.5" r="1.75" fill="currentColor" stroke="none" />
  </svg>
)

type Promise = {
  id: string
  title: string
  description: string
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element
}

const PROMISES: Promise[] = [
  {
    id: "proof",
    title: "Proof before we print",
    description:
      "Every order gets a digital mockup. Nothing goes to print until you approve it.",
    Icon: ProofIcon,
  },
  {
    id: "dpi",
    title: "Free DPI check",
    description:
      "We check your artwork resolution up front, so your print lands crisp — not blurry.",
    Icon: DpiIcon,
  },
  {
    id: "local",
    title: "Real people, NSW studio",
    description:
      "Talk to the team that actually prints your gear — printed in-house in Sydney, not offshore.",
    Icon: PeopleIcon,
  },
  {
    id: "pricing",
    title: "Pricing up front",
    description:
      "Bulk discounts are shown on every product — see your price before you order, no quote wall.",
    Icon: PriceIcon,
  },
]

export default function HomeGuaranteeBlock() {
  return (
    <section className="border-t border-ui-border-base bg-ui-bg-subtle py-12 small:py-16">
      <div className="content-container">
        <SectionHeader
          eyebrow="Our promise"
          title="Print with confidence."
          align="center"
        />

        <ul className="mt-8 grid list-none grid-cols-1 gap-3 p-0 phone:grid-cols-2 phone:gap-4 small:grid-cols-4">
          {PROMISES.map((promise) => {
            const { Icon } = promise
            return (
              <li
                key={promise.id}
                className="flex flex-col rounded-lg border border-ui-border-base bg-white p-6"
              >
                <Icon className="text-[var(--brand-secondary)]" />
                <p className="mt-4 text-sm font-semibold text-ui-fg-base">
                  {promise.title}
                </p>
                <p className="mt-2 text-xs text-ui-fg-subtle">
                  {promise.description}
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
