import { Lora } from "next/font/google"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

import ByoInquiryForm from "./byo-inquiry-form"

const lora = Lora({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
})

function SparkleIcon({ className, gradientId }: { className?: string; gradientId: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M16 2L18.4 10.2L27 8L20.2 16L27 24L18.4 21.8L16 30L13.6 21.8L5 24L11.8 16L5 8L13.6 10.2L16 2Z"
        fill={`url(#${gradientId})`}
        stroke="var(--brand-primary)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="5"
          y1="2"
          x2="27"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f5c6e0" />
          <stop offset="1" stopColor="#e8d4f2" />
        </linearGradient>
      </defs>
    </svg>
  )
}

type ByoCtaSectionProps = {
  /** When false, only the hero copy + CTAs (use on /byo where the form lives below). */
  withForm?: boolean
}

export default function ByoCtaSection({ withForm = true }: ByoCtaSectionProps) {
  const sparkleId = withForm ? "byo-cta-sparkle" : "byo-page-cta-sparkle"

  return (
    <section className="content-container py-10 small:py-14">
      <div className="relative overflow-hidden rounded-3xl border-2 border-[var(--brand-primary)] bg-[#faf8f5] p-6 small:p-10">
        <div className="pointer-events-none absolute right-5 top-5 small:right-8 small:top-8">
          <SparkleIcon className="h-8 w-8 small:h-9 small:w-9" gradientId={sparkleId} />
        </div>

        <div
          className={
            withForm
              ? "grid gap-10 large:grid-cols-2 large:items-start large:gap-14"
              : "max-w-3xl"
          }
        >
          <div className="pr-0 large:pr-4">
            <h2
              className={`${lora.className} text-2xl font-semibold text-[var(--brand-primary)] small:text-3xl`}
            >
              We&apos;re a BYO business
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--brand-primary)]/90 small:text-base">
              BYO merch, that is! If you&apos;ve looked at our range and think there&apos;s something
              else you&apos;d like, bring it into our store, or get in touch so we can make your
              custom clothing plans happen.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              {withForm ? (
                <>
                  <LocalizedClientLink
                    href="/byo"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--brand-primary)] bg-transparent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary)]/5"
                  >
                    BYO merch
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <path d="M2 10L10 2M4 2h6v6" />
                    </svg>
                  </LocalizedClientLink>
                  <a
                    href="#byo-inquiry"
                    className="text-sm font-semibold text-[var(--brand-secondary)] underline-offset-4 hover:underline"
                  >
                    Skip to form
                  </a>
                </>
              ) : (
                <a
                  href="#byo-inquiry"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--brand-primary)] bg-transparent px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary)]/5"
                >
                  Ask a BYO question
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M2 10L10 2M4 2h6v6" />
                  </svg>
                </a>
              )}
            </div>
          </div>

          {withForm ? (
            <div className="rounded-2xl border border-[var(--brand-primary)]/20 bg-white/80 p-5 small:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ui-fg-muted">
                BYO questions
              </p>
              <h3 className="mt-1 text-lg font-semibold text-ui-fg-base">Ask us about print &amp; garments</h3>
              <ByoInquiryForm className="mt-5" id="byo-inquiry" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
