import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Home hero (Phase 1 "shell"). Typographic, image-free so it ships reliably and
// fast — the background is a subtle brand-tinted gradient, not a hosted asset.
// To upgrade the visual later (owner decision): drop a background <Image>, a
// looping <video>, or one of the built canvas heroes
// (digital-rain-hero / print-formation-hero / screenprint-cmyk-hero /
// embroidery-stitch-hero under this same folder) BEHIND the content grid here.
// Keep the content (H1 + dual CTA + badges) untouched so SEO/conversion holds.

const BADGES = [
  "No minimums — from 1 garment",
  "Aussie-made · NSW studio",
  "Free design proof + DPI check",
  "10+ years printing",
]

const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-[var(--brand-secondary)]"
    aria-hidden
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

const ArrowIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
)

export default function HomeHero() {
  return (
    <section className="relative overflow-hidden border-b border-ui-border-base bg-gradient-to-b from-ui-bg-subtle to-ui-bg-base">
      {/* Soft brand glow — purely decorative, sits behind the content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 hidden h-96 w-96 rounded-full bg-[var(--brand-secondary)]/10 blur-3xl tablet:block"
      />

      <div className="content-container relative py-16 small:py-24">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-primary)]/80">
            Custom apparel &amp; branded merch · NSW
          </p>

          <h1 className="page-title-marketing mt-4">
            Custom printed gear for your team, club or brand.
          </h1>

          <p className="mt-5 max-w-2xl text-base text-ui-fg-subtle small:text-lg">
            From one garment to a thousand — design it online, printed in-house
            at our Sydney studio and shipped Australia-wide. Screen print, DTF
            transfer, embroidery and UV, all under one roof.
          </p>

          <div className="mt-8 flex flex-col gap-3 phone:flex-row phone:flex-wrap">
            <LocalizedClientLink
              href="/customizer"
              className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Start designing
              <ArrowIcon className="transition-transform group-hover:translate-x-0.5" />
            </LocalizedClientLink>

            <LocalizedClientLink
              href="/byo"
              className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-ui-border-base bg-white px-6 py-3 text-sm font-semibold text-ui-fg-base transition hover:border-[var(--brand-secondary)] hover:text-[var(--brand-secondary)]"
            >
              Get a quote
              <ArrowIcon className="transition-transform group-hover:translate-x-0.5" />
            </LocalizedClientLink>
          </div>

          <ul className="mt-8 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
            {BADGES.map((badge) => (
              <li
                key={badge}
                className="flex items-center gap-1.5 text-xs font-medium text-ui-fg-subtle phone:text-sm"
              >
                <CheckIcon />
                {badge}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
