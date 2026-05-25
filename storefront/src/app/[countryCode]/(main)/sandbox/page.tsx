import { Metadata } from "next"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "Sandbox",
  description: "Internal sandbox routes — animation experiments and design references.",
  robots: { index: false, follow: false },
}

type SandboxItem = {
  href: string
  label: string
  description: string
}

const SANDBOX_ITEMS: SandboxItem[] = [
  {
    href: "/particle-logo",
    label: "Particle logo",
    description:
      "Active work — SC Prints wordmark assembled from particle physics.",
  },
  {
    href: "/old-hero",
    label: "Old home page animation",
    description: "Previous home hero kept for reference.",
  },
  {
    href: "/particle-flow",
    label: "Particle flow",
    description: "Tsparticles flow-field experiment.",
  },
  {
    href: "/particle-threejs",
    label: "Particle three.js",
    description: "Three.js particle system sandbox.",
  },
  {
    href: "/jungle-scene",
    label: "Jungle scene",
    description: "Three.js animation isolation test.",
  },
  {
    href: "/test/animation-widgets",
    label: "Animation widgets lab",
    description: "Widget animation experiments.",
  },
]

export default function SandboxPage() {
  return (
    <div className="content-container py-14 small:py-20">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]/70">
          Internal
        </p>
        <h1 className="page-title-marketing mt-3 tracking-tight">Sandbox</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ui-fg-subtle small:text-lg">
          Animation experiments and design references. Not linked from primary
          navigation. No tracking, no indexing.
        </p>
      </header>

      <section className="mx-auto mt-10 max-w-3xl rounded-2xl border border-ui-border-base bg-white p-6 small:p-8">
        <ul className="grid list-none gap-4 p-0">
          {SANDBOX_ITEMS.map((item) => (
            <li key={item.href}>
              <LocalizedClientLink
                href={item.href}
                className="group block rounded-xl border border-transparent p-3 transition hover:border-ui-border-base hover:bg-ui-bg-subtle"
              >
                <div className="flex items-center gap-2 text-base font-semibold text-ui-fg-base">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand-secondary)]/60 transition group-hover:bg-[var(--brand-secondary)]" />
                  {item.label}
                </div>
                <p className="mt-1 pl-4 text-sm text-ui-fg-subtle">
                  {item.description}
                </p>
              </LocalizedClientLink>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
