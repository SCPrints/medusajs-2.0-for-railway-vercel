import { Metadata } from "next"
import Image from "next/image"
import type { ReactNode, SVGProps } from "react"

import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SectionHeader from "@modules/common/components/section-header"
import { iconBase } from "@modules/common/icons/icon-base"
import {
  SCREEN_MAX_COLOURS,
  SCREEN_MAX_STANDARD_PRINT_CM,
  SCREEN_MIN_QUANTITY,
} from "@modules/customizer/lib/scp-screen-print-pricing"
import { TURNAROUNDS } from "@modules/decoration/lib/rush"
import Reveal from "@modules/guides/components/reveal"
import ScreenCounter from "@modules/guides/screen-printing-cost/components/screen-counter"
import SeparationIllustration from "@modules/guides/screen-printing-cost/components/separation-illustration"
import SetupShareChart from "@modules/guides/screen-printing-cost/components/setup-share-chart"

// NO PRICING ON THIS PAGE (Sean, 2026-10-01). It explains WHY screen printing
// has setup costs and a minimum — not what they are. No dollar amounts, no
// rates, no percentages, no quantity bands. Customers get the price for their
// own job from the customiser. Quantities and turnaround days are fine.

const MIN = SCREEN_MIN_QUANTITY

const PATH = "/guides/screen-printing-cost"
const TITLE = "Screen Printing Setup Costs & Minimums Explained"
const DESCRIPTION =
  "Why screen printing has a setup cost for every colour and a minimum order, what makes a job cost more or less, and when DTF printing is the better choice."

export async function generateStaticParams() {
  return [{ countryCode: "au" }]
}

type Props = { params: Promise<{ countryCode: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryCode } = await params
  const canonicalPath = `/${countryCode}${PATH}`
  const socialTitle = `${TITLE} | ${SEO.siteName}`

  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: canonicalPath },
    openGraph: {
      url: buildAbsoluteUrl(canonicalPath),
      title: socialTitle,
      description: DESCRIPTION,
      images: [SEO.ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: DESCRIPTION,
      images: [SEO.ogImage],
    },
  }
}

type Icon = (props: SVGProps<SVGSVGElement>) => ReactNode

const LayersIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <path d="M16 5l11 6-11 6-11-6z" />
    <path d="M5 16l11 6 11-6" />
    <path d="M5 21l11 6 11-6" />
  </svg>
)
const ScreenIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <rect x="5" y="6" width="22" height="20" rx="1.5" />
    <rect x="9" y="10" width="14" height="12" />
    <path d="M12 16h8" />
  </svg>
)
const TargetIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <circle cx="16" cy="16" r="9" />
    <circle cx="16" cy="16" r="3" />
    <path d="M16 3v6M16 23v6M3 16h6M23 16h6" />
  </svg>
)
const DropIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <path d="M16 4c4 6 8 10 8 15a8 8 0 01-16 0c0-5 4-9 8-15z" />
  </svg>
)
const SparkleIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <path d="M16 5v7M16 20v7M5 16h7M20 16h7" />
    <path d="M9 9l3 3M20 20l3 3M23 9l-3 3M12 20l-3 3" />
  </svg>
)
const ShirtIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <path d="M11 5l-5 3v6h4v12h12V14h4V8l-5-3-3 2.5a4 4 0 01-4 0z" />
  </svg>
)
const PaletteIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <circle cx="11" cy="12" r="5" />
    <circle cx="21" cy="12" r="5" />
    <circle cx="16" cy="21" r="5" />
  </svg>
)
const StackIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <rect x="6" y="19" width="20" height="6" rx="1" />
    <rect x="6" y="12" width="20" height="6" rx="1" />
    <rect x="6" y="5" width="20" height="6" rx="1" />
  </svg>
)
const FlipIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <rect x="5" y="8" width="13" height="16" rx="1.5" />
    <path d="M22 8h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" />
  </svg>
)
const HoodIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <path d="M11 6l-6 4v7h4v9h14v-9h4v-7l-6-4" />
    <path d="M11 6c0 5 2 8 5 8s5-3 5-8" />
  </svg>
)
const RulerIcon: Icon = (p) => (
  <svg {...iconBase} {...p}>
    <rect x="4" y="11" width="24" height="10" rx="1.5" />
    <path d="M9 11v4M14 11v5M19 11v4M24 11v5" />
  </svg>
)
const CheckIcon: Icon = (p) => (
  <svg {...iconBase} width={18} height={18} strokeWidth={2.5} {...p}>
    <path d="M7 17l6 6 12-14" />
  </svg>
)
const ArrowRightIcon: Icon = (p) => (
  <svg {...iconBase} width={16} height={16} strokeWidth={2.5} {...p}>
    <path d="M6 16h20M18 8l8 8-8 8" />
  </svg>
)

const SETUP_STEPS: { heading: string; body: string; Icon: Icon }[] = [
  {
    heading: "The artwork is separated",
    body: "Your design is split into one layer for each ink colour. A three-colour logo becomes three separate pieces of artwork, each printed in solid black onto clear film.",
    Icon: LayersIcon,
  },
  {
    heading: "A screen is made for every colour",
    body: "A fine mesh is coated with light-sensitive emulsion and exposed through the film. The emulsion hardens everywhere except behind the artwork, which washes out to leave a stencil.",
    Icon: ScreenIcon,
  },
  {
    heading: "The screens are lined up",
    body: "Each screen is mounted on the press and adjusted until every colour lands exactly where it should. On a multi-colour design this is the slowest part of the job.",
    Icon: TargetIcon,
  },
  {
    heading: "Inks are mixed and tested",
    body: "Colours are mixed or matched and test prints are run to check alignment and coverage before the first real garment goes under the screen.",
    Icon: DropIcon,
  },
  {
    heading: "Everything is cleaned down",
    body: "After the run the ink is cleared and the stencils are removed so the frames can be used again.",
    Icon: SparkleIcon,
  },
]

type Effect = "up" | "down" | "none"
const PRICE_DRIVERS: { heading: string; body: string; Icon: Icon; effect: Effect; tag: string }[] = [
  {
    heading: "Quantity",
    body: "The setup is spread over more garments and the printing itself is quick, so the cost per piece falls as the run grows.",
    Icon: StackIcon,
    effect: "down",
    tag: "More pieces, less per piece",
  },
  {
    heading: "Number of colours",
    body: "Every colour is another screen to make and another pass on the press.",
    Icon: PaletteIcon,
    effect: "up",
    tag: "More colours, more cost",
  },
  {
    heading: "Garment colour",
    body: "Ink looks dull straight onto dark fabric, so a layer of white is printed first. That underbase is one more screen.",
    Icon: ShirtIcon,
    effect: "up",
    tag: "Dark adds a screen",
  },
  {
    heading: "Print positions",
    body: "A front and a back are two separate setups. Each position needs its own set of screens.",
    Icon: FlipIcon,
    effect: "up",
    tag: "Each position is a setup",
  },
  {
    heading: "Garment type",
    body: "Hoodies, fleece and polyester are harder to print on than a flat cotton tee and cost a little more.",
    Icon: HoodIcon,
    effect: "up",
    tag: "Heavier costs a little more",
  },
  {
    heading: "Print size",
    body: `The size of the print does not change the price up to ${SCREEN_MAX_STANDARD_PRINT_CM.width} × ${SCREEN_MAX_STANDARD_PRINT_CM.height} cm. Anything larger is quoted.`,
    Icon: RulerIcon,
    effect: "none",
    tag: "No effect at standard sizes",
  },
]

const EFFECT_STYLE: Record<Effect, { arrow: string; className: string }> = {
  // Tints are literal rgba: Tailwind's `/opacity` modifier is a no-op on hex CSS variables.
  up: { arrow: "↑", className: "bg-[rgba(255,46,99,0.1)] !text-[#d81e4f]" },
  down: { arrow: "↓", className: "bg-[rgba(61,207,194,0.18)] !text-[#147a71]" },
  none: { arrow: "→", className: "bg-ui-bg-subtle !text-ui-fg-subtle" },
}

const COMPARE = [
  {
    name: "Screen printing",
    accent: "var(--brand-primary)",
    rows: [
      ["Setup", "A screen for every colour"],
      ["Minimum", `${MIN} pieces`],
      ["As quantity grows", "Cost per piece drops a lot"],
      ["Print size", "No effect at standard sizes"],
      ["Finish", "Soft, light plastisol ink"],
    ],
    bestFor: ["Larger runs", "One to three solid colours", "Big prints"],
  },
  {
    name: "DTF printing",
    accent: "var(--brand-secondary)",
    rows: [
      ["Setup", "No screens to make"],
      ["Minimum", "From one garment"],
      ["As quantity grows", "Cost per piece stays much the same"],
      ["Print size", "Bigger prints cost more"],
      ["Finish", "A printed transfer, heat-pressed on"],
    ],
    bestFor: ["Small runs", "Photos, gradients, many colours", "Names and numbers"],
  },
]

const SAVINGS = [
  {
    heading: "Use fewer colours",
    body: "Each colour you remove is one less screen. Many logos lose nothing by going from three colours to two.",
  },
  {
    heading: "Print on a light garment",
    body: "No white underbase is needed, so there is one less screen to set up.",
  },
  {
    heading: "Keep it to one position",
    body: "A second position repeats the setup. Decide whether the back print is worth it before you add it.",
  },
  {
    heading: "Order once, not twice",
    body: "Two small runs mean two setups. One larger run means one, and a lower cost per piece as well.",
  },
  {
    heading: "Re-order within 6 months",
    body: "Repeating the same design within 6 months carries a reduced setup fee, because the artwork has already been prepared for print.",
  },
]

const PHOTOS = [
  {
    src: "/images/services/screen-printing/onpoint-kitchens.png",
    alt: "Assorted shirt colours showing yellow and white screen-printed Onpoint Kitchens branding and contact details.",
  },
  {
    src: "/images/services/screen-printing/eco-flush-plumbing.png",
    alt: "Black t-shirts with a neon green and white multi-colour screen-printed plumbing services design.",
  },
  {
    src: "/images/services/screen-printing/restored-right.png",
    alt: "Dark grey garment with a yellow screen-printed Restored Right flood restoration and cleaning logo and phone number.",
  },
]

const FAQS = [
  {
    q: "Why does screen printing have a setup fee?",
    a: "Before anything is printed, a separate screen has to be made for each colour in your design, mounted on the press and lined up. That work is the same whether you order a small run or a very large one, so it is charged once per job instead of being built into the price of every garment.",
  },
  {
    q: "How is the setup fee worked out?",
    a: "It is charged per screen. You need one screen for each colour in each print position, plus one for the white underbase if the garment is dark. The customiser shows the setup for your design before you order.",
  },
  {
    q: "What is the minimum order for screen printing?",
    a: `${MIN} pieces per job, where a job is the same garment with the same artwork. Sizes can be mixed within that. For fewer than ${MIN}, DTF printing and embroidery are available from a single garment.`,
  },
  {
    q: "Do I pay setup again when I re-order?",
    a: "Repeating the same design within 6 months carries a reduced setup fee. After that the job is set up again from scratch.",
  },
  {
    q: "Why does printing on a black shirt cost more?",
    a: "Ink colours look dull printed straight onto dark fabric, so a layer of white is printed first. That underbase is an extra screen, and the job is priced as one more colour.",
  },
  {
    q: "Where can I see the price for my job?",
    a: "In the customiser on any product page. Choose your garment, add your artwork, pick screen printing and enter your quantity, and it shows the full price before you order.",
  },
]

const prose = "mt-4 max-w-3xl text-base leading-relaxed text-ui-fg-subtle"
const eyebrow = "text-xs font-semibold uppercase tracking-[0.12em]"
const card =
  "h-full rounded-xl border border-ui-border-base bg-white p-6 transition hover:-translate-y-0.5 hover:border-[var(--brand-secondary)]/40 hover:shadow-sm"
const iconBadge =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[rgba(61,207,194,0.18)] text-[var(--brand-primary)]"

export default function ScreenPrintingCostGuidePage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: TITLE,
    description: DESCRIPTION,
    mainEntityOfPage: buildAbsoluteUrl(`/au${PATH}`),
    publisher: { "@type": "Organization", name: SEO.siteName },
  }
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }

  return (
    <div className="content-container py-14 small:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }}
      />

      {/* Hero — text is server-rendered and never hidden (LCP); only the illustration animates. */}
      <header className="grid items-center gap-8 rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 small:grid-cols-[1.15fr_1fr] small:p-10">
        <div>
          <p className={`${eyebrow} text-ui-fg-muted`}>Guide</p>
          <h1 className="page-title-marketing mt-3">
            Why screen printing has setup costs and a minimum order
          </h1>
          <p className="mt-4 max-w-2xl text-ui-fg-subtle">
            Screen printing is the most economical way to print a large run and
            a poor way to print a handful. The reason is setup: work that has
            to be done before the first garment is printed, and that is the
            same however many you order.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2 text-sm font-medium">
            {[
              "One screen per colour",
              `${MIN}-piece minimum`,
              `Up to ${SCREEN_MAX_COLOURS} colours`,
            ].map((fact) => (
              <li
                key={fact}
                className="rounded-lg border border-ui-border-base bg-white px-3 py-1.5 text-ui-fg-base"
              >
                {fact}
              </li>
            ))}
          </ul>
        </div>
        <SeparationIllustration />
      </header>

      {/* Steps timeline */}
      <section className="mt-16">
        <SectionHeader eyebrow="The process" title="What happens before the first print" />
        <p className={prose}>
          Screen printing pushes ink through a mesh stencil onto the garment,
          one colour at a time. That stencil is made for your artwork, for
          this job, and getting a press ready to print takes real work.
        </p>
        <div className="mt-8 grid items-start gap-8 small:grid-cols-[1.35fr_1fr]">
          <ol className="relative space-y-7 before:absolute before:bottom-6 before:left-6 before:top-6 before:w-px before:bg-ui-border-base">
            {SETUP_STEPS.map(({ heading, body, Icon }, i) => (
              <li key={heading}>
                <Reveal delay={i * 0.06} className="relative flex gap-5">
                  <span className="relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-ui-border-base bg-white text-[var(--brand-primary)] shadow-sm">
                    <Icon width={26} height={26} />
                  </span>
                  <div>
                    <p className={`${eyebrow} text-[var(--brand-secondary)]`}>Step {i + 1}</p>
                    <h3 className="mt-1 text-lg font-semibold text-ui-fg-base">{heading}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ui-fg-subtle">{body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
          <Reveal className="small:sticky small:top-28">
            <figure className="m-0">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-subtle">
                <Image
                  src="/images/services/screen-printing/hitec-drainage-hivis.png"
                  alt="Bulk stack of hi-vis orange workwear with navy screen-printed Hitec Drainage branding."
                  fill
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="object-cover"
                />
              </div>
              <figcaption className="mt-2 text-xs text-ui-fg-muted">
                A single-colour print across a full run of hi-vis workwear.
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </section>

      {/* Why separate + chart */}
      <section className="mt-16 grid items-start gap-8 small:grid-cols-[1.2fr_1fr]">
        <div>
          <SectionHeader eyebrow="The setup fee" title="Why setup is charged separately" />
          <p className={prose}>
            All of that work happens once per job, and none of it gets smaller
            when the order does. Making and aligning the screens for {MIN}{" "}
            shirts takes exactly as long as for a thousand. Once the press is
            running, though, each additional garment takes only moments.
          </p>
          <p className={prose}>
            That is why setup is shown as its own line instead of being folded
            into the price of each garment. You can see which part of the job
            is fixed and which part grows with your quantity, and why a larger
            run costs so much less per piece.
          </p>
        </div>
        <Reveal>
          <SetupShareChart />
        </Reveal>
      </section>

      {/* Interactive counter */}
      <section className="mt-16">
        <SectionHeader eyebrow="Try it" title="How many screens does your design need?" />
        <p className={prose}>
          Setup is counted per screen: one for every colour, in every print
          position, plus one more for the white underbase on a dark garment.
          Change the options to see how the count moves.
        </p>
        <Reveal className="mt-6">
          <ScreenCounter />
        </Reveal>
      </section>

      {/* Minimum band */}
      <Reveal className="mt-16">
        <section className="grid items-center gap-6 rounded-2xl bg-[var(--brand-primary)] p-8 text-white small:grid-cols-[auto_1fr] small:gap-10 small:p-10">
          <div className="text-center">
            <p className="text-7xl font-semibold leading-none text-[var(--brand-accent)] small:text-8xl">
              {MIN}
            </p>
            <p className={`${eyebrow} mt-2 text-white/70`}>piece minimum</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-white small:text-3xl">
              Why there is a minimum
            </h2>
            <p className="mt-3 max-w-2xl text-white/80">
              Below a certain size the setup outweighs everything else, and the
              cost per garment stops making sense for anyone. The minimum
              applies per job, meaning the same garment with the same artwork.
              Mixed sizes count together; two different designs are two jobs.
            </p>
            <p className="mt-3 max-w-2xl text-white/80">
              For smaller orders,{" "}
              <LocalizedClientLink
                href="/services/digital-transfers"
                className="font-semibold !text-[var(--brand-accent)] underline underline-offset-4"
              >
                DTF printing
              </LocalizedClientLink>{" "}
              and embroidery have no screens to make and are available from a
              single garment.
            </p>
          </div>
        </section>
      </Reveal>

      {/* Price drivers */}
      <section className="mt-16">
        <SectionHeader eyebrow="What you control" title="What makes a job cost more or less" />
        <div className="mt-8 grid gap-4 tablet:grid-cols-2 medium:grid-cols-3">
          {PRICE_DRIVERS.map(({ heading, body, Icon, effect, tag }, i) => (
            <Reveal key={heading} delay={(i % 3) * 0.08}>
              <div className={card}>
                <div className="flex items-start justify-between gap-3">
                  <span className={iconBadge}>
                    <Icon width={26} height={26} />
                  </span>
                  <span
                    className={`rounded-md px-2 py-1 text-right text-xs font-semibold ${EFFECT_STYLE[effect].className}`}
                  >
                    <span aria-hidden>{EFFECT_STYLE[effect].arrow} </span>
                    {tag}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-ui-fg-base">{heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ui-fg-subtle">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Screen vs DTF */}
      <section className="mt-16">
        <SectionHeader eyebrow="Choosing a method" title="Screen printing or DTF?" />
        <p className={prose}>
          DTF is a printed transfer that is heat-pressed onto the garment, so
          there are no screens to make. Screen printing costs more to start
          and less for every garment after that. Which works out better
          depends on your quantity, your colours and your print size together.
        </p>
        <div className="mt-8 grid gap-4 small:grid-cols-2">
          {COMPARE.map((method, i) => (
            <Reveal key={method.name} delay={i * 0.1}>
              <div
                className="h-full overflow-hidden rounded-2xl border border-ui-border-base bg-white"
                style={{ borderTop: `4px solid ${method.accent}` }}
              >
                <div className="p-6 small:p-7">
                  <h3 className="text-xl font-semibold text-ui-fg-base">{method.name}</h3>
                  <dl className="mt-4 divide-y divide-ui-border-base">
                    {method.rows.map(([label, value]) => (
                      <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                        <dt className="shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-muted">
                          {label}
                        </dt>
                        <dd className="text-right text-sm text-ui-fg-base">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className={`${eyebrow} mt-5 text-[var(--brand-primary)]/80`}>Best for</p>
                  <ul className="mt-2 space-y-1.5">
                    {method.bestFor.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-ui-fg-base">
                        <CheckIcon className="shrink-0 text-[var(--brand-accent)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <p className={prose}>
          Not sure? Set the job up both ways in the customiser. It prices each
          method for your exact quantity, so you can compare them directly.
        </p>
      </section>

      {/* Real jobs */}
      <section className="mt-16">
        <SectionHeader eyebrow="On the garment" title="What a screen printed run looks like" />
        <div className="mt-8 grid gap-4 tablet:grid-cols-3">
          {PHOTOS.map((photo, i) => (
            <Reveal key={photo.src} delay={i * 0.08}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-subtle">
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="object-cover transition duration-500 hover:scale-[1.03]"
                />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Savings */}
      <section className="mt-16">
        <SectionHeader eyebrow="Spend less" title="How to keep the cost down" />
        <div className="mt-8 grid gap-4 tablet:grid-cols-2 medium:grid-cols-3">
          {SAVINGS.map((tip, i) => (
            <Reveal key={tip.heading} delay={(i % 3) * 0.08}>
              <div className={`${card} flex gap-4`}>
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-secondary)] text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-ui-fg-base">{tip.heading}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ui-fg-subtle">{tip.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Timing */}
      <section className="mt-16">
        <SectionHeader eyebrow="Timing" title="Why it takes a little longer" />
        <p className={prose}>
          The same setup that adds cost also adds time, counted from artwork
          approval. If your date is tighter than this, DTF is the faster
          method.
        </p>
        <div className="mt-6 grid gap-4 tablet:grid-cols-3">
          {[
            { label: "Standard", value: TURNAROUNDS.screen.standard, muted: false },
            { label: "Priority", value: TURNAROUNDS.screen.priority ?? "", muted: false },
            { label: "Next day", value: "Not available for screen printing", muted: true },
          ].map((t, i) => (
            <Reveal key={t.label} delay={i * 0.08}>
              <div className={`${card} ${t.muted ? "bg-ui-bg-subtle" : ""}`}>
                <p className={`${eyebrow} text-[var(--brand-primary)]/80`}>{t.label}</p>
                <p
                  className={
                    t.muted
                      ? "mt-2 text-base text-ui-fg-muted"
                      : "mt-2 text-2xl font-semibold text-ui-fg-base"
                  }
                >
                  {t.value}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ — same <details> pattern as /faq */}
      <section className="mt-16">
        <SectionHeader eyebrow="Quick answers" title="Screen printing setup FAQ" />
        <div className="mt-6 max-w-3xl space-y-3">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4 transition hover:border-[var(--brand-secondary)]/35"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ui-fg-base">
                <span>{f.q}</span>
                <span
                  aria-hidden
                  className="shrink-0 text-lg leading-none text-[var(--brand-secondary)] transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-ui-fg-subtle">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <Reveal className="mt-16">
        <section className="rounded-2xl bg-[var(--brand-primary)] p-8 text-center small:p-12">
          <h2 className="text-2xl font-semibold text-white small:text-3xl">
            See the price for your job
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-white/80">
            Pick a garment, add your artwork and choose screen printing in the
            customiser. It shows the setup and the full price for your
            quantity and colours before you order.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <LocalizedClientLink
              href="/store"
              className="group inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold !text-white shadow-sm transition hover:brightness-110"
            >
              Choose a garment
              <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/contact"
              className="inline-flex min-h-11 items-center rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold !text-white transition hover:bg-white/10"
            >
              Ask us about your job
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/services/screen-printing"
              className="inline-flex min-h-11 items-center rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold !text-white transition hover:bg-white/10"
            >
              About our screen printing
            </LocalizedClientLink>
          </div>
        </section>
      </Reveal>
    </div>
  )
}
