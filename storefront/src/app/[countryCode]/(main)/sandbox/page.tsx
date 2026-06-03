import { Metadata } from "next"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "Animation Lab",
  description: "All SC Prints animation experiments and design references in one place.",
  robots: { index: false, follow: false },
}

type Status = "active" | "candidate" | "archived" | "lab"

type SandboxItem = {
  href: string
  label: string
  description: string
  status?: Status
  tech?: string
}

type Category = {
  title: string
  description: string
  items: SandboxItem[]
}

const STATUS_LABELS: Record<Status, string> = {
  active: "Active",
  candidate: "Candidate",
  archived: "Archived",
  lab: "Lab",
}

const STATUS_STYLES: Record<Status, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  candidate: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  archived: "bg-gray-50 text-gray-500 ring-1 ring-gray-200",
  lab: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
}

const CATEGORIES: Category[] = [
  {
    title: "Wordmark animations",
    description: "Particle physics applied to the SC Prints wordmark.",
    items: [
      {
        href: "/particle-logo",
        label: "Particle logo — Newmix fluid sim",
        description:
          "Cursor pushes a velocity field with pressure projection; particles ride the field bilinearly. SC Prints wordmark. The current active tuning.",
        status: "active",
        tech: "Custom fluid sim",
      },
      {
        href: "/particle-threejs",
        label: "Particle logo — Three.js GPU",
        description:
          "140k-particle Three.js Points-mesh alternative. GPU-accelerated so it stays smooth at high counts. SC Prints wordmark.",
        status: "candidate",
        tech: "Three.js",
      },
      {
        href: "/old-hero",
        label: "Particle logo — Newmix v3",
        description:
          "Previous v3 Newmix tuning that ran as the home hero. Kept for reference.",
        status: "archived",
        tech: "Custom fluid sim",
      },
    ],
  },
  {
    title: "Home hero candidates",
    description:
      "Full-screen scenes tested (or currently running) as the SC Prints homepage hero.",
    items: [
      {
        href: "/",
        label: "Digital rain — current live hero",
        description:
          "Neon digital-rain canvas currently running on the home page. Link goes to the real home.",
        status: "active",
        tech: "Canvas 2D",
      },
      {
        href: "/space-hero",
        label: "Space hero",
        description:
          "Full-viewport 3D space scene — the previous home hero before digital rain was adopted. Preserved for reference.",
        status: "archived",
        tech: "Three.js",
      },
      {
        href: "/block-hero",
        label: "Block grid hero",
        description:
          "Perspective grid of bobbing pastel blocks with the flat black SC Prints wordmark over the centre. A/B candidate against digital rain.",
        status: "candidate",
        tech: "Three.js",
      },
      {
        href: "/city-hero",
        label: "Block city hero",
        description:
          "Extruded rounded blocks with visible walls seen from above, bobbing toward the viewer with the wordmark laid over the top.",
        status: "candidate",
        tech: "Three.js",
      },
    ],
  },
  {
    title: "Scenes & environments",
    description: "Isolated 3D and canvas scene experiments.",
    items: [
      {
        href: "/jungle-scene",
        label: "Jungle scene",
        description:
          "Three.js pixel-art dinosaur sprites with a forest environment. Built to test scene composition and sprite handling in isolation.",
        status: "archived",
        tech: "Three.js",
      },
      {
        href: "/particle-flow",
        label: "Particle flow",
        description:
          "Tsparticles flow-field experiment with the SC Prints wordmark. An earlier approach before the custom Newmix fluid sim.",
        status: "archived",
        tech: "tsparticles",
      },
    ],
  },
  {
    title: "UI & component labs",
    description: "Widget, button, and micro-interaction experiments.",
    items: [
      {
        href: "/test/animation-widgets",
        label: "Animation widgets lab",
        description:
          "Paginated lab with 10 sections per page: embeds, Rive presets, Spline slots, WebGL, button interactions. Add ?page=2 for more.",
        status: "lab",
        tech: "Rive · Spline · WebGL",
      },
    ],
  },
]

export default function SandboxPage() {
  return (
    <div className="content-container py-14 small:py-20">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]/70">
          Internal
        </p>
        <h1 className="page-title-marketing mt-3 tracking-tight">
          Animation Lab
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ui-fg-subtle small:text-lg">
          Every animation experiment and design reference in one place. Not
          linked from primary navigation. No tracking, no indexing.
        </p>
      </header>

      <div className="mx-auto mt-12 max-w-3xl space-y-10">
        {CATEGORIES.map((category) => (
          <section key={category.title}>
            <div className="mb-4 border-l-4 border-[var(--brand-secondary)]/40 pl-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ui-fg-base">
                {category.title}
              </h2>
              <p className="mt-0.5 text-sm text-ui-fg-subtle">
                {category.description}
              </p>
            </div>

            <ul className="grid list-none gap-2 p-0">
              {category.items.map((item) => (
                <li key={item.href}>
                  <LocalizedClientLink
                    href={item.href}
                    className="group flex items-start gap-3 rounded-xl border border-transparent p-3 transition hover:border-ui-border-base hover:bg-ui-bg-subtle"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ui-fg-base transition-colors group-hover:text-[var(--brand-primary)]">
                          {item.label}
                        </span>
                        {item.status && (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${STATUS_STYLES[item.status]}`}
                          >
                            {STATUS_LABELS[item.status]}
                          </span>
                        )}
                        {item.tech && (
                          <span className="inline-block rounded bg-ui-bg-subtle px-1.5 py-0.5 text-[10px] font-medium leading-none text-ui-fg-muted ring-1 ring-ui-border-base">
                            {item.tech}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-ui-fg-subtle">
                        {item.description}
                      </p>
                    </div>
                    <span className="mt-0.5 shrink-0 text-ui-fg-muted transition group-hover:translate-x-0.5 group-hover:text-ui-fg-subtle">
                      →
                    </span>
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
