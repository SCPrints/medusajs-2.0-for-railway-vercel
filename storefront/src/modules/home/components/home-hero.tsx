import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Home hero (Phase 1). Full-bleed product photo (a rack of blank garments)
// behind the content, with a left-to-right white scrim so the dark headline +
// CTA stay readable on the left while the garments show through on the
// right. The image is the LCP element (priority load).
// Single CTA: "Shop the range" → /store (browse-and-buy). The old "Start
// designing" → /customizer CTA was removed — the standalone /customizer is the
// retired legacy tool; designing now happens on the per-product PDP (Studio).
// No quote CTA — SC Prints sells direct off the catalogue.

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
    <section className="relative overflow-hidden border-b border-ui-border-base bg-ui-bg-subtle">
      {/* Full-bleed product photo — the LCP element, sits behind the content. */}
      <Image
        src="/images/home/hero-rack.jpg"
        alt="A rack of blank hoodies and sweatshirts ready for custom printing"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      {/* White scrim — strong on the left for text contrast, fading to clear on
          the right so the garments stay visible. A subtle bottom fade keeps the
          badges legible on mobile where the rack fills more of the frame. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,white_0%,white_28%,rgba(255,255,255,0.55)_45%,transparent_62%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/80 via-white/20 to-transparent tablet:hidden"
      />

      <div className="content-container relative py-16 small:py-28">
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
              href="/store"
              className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Shop the range
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
