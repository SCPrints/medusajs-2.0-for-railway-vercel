import { Metadata } from "next"
import Image from "next/image"
import type { CSSProperties } from "react"

import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SectionHeader from "@modules/common/components/section-header"
import {
  SCREEN_MAX_COLOURS,
  SCREEN_MIN_QUANTITY,
} from "@modules/customizer/lib/scp-screen-print-pricing"
import { TURNAROUNDS } from "@modules/decoration/lib/rush"
import Reveal from "@modules/guides/components/reveal"
import MethodPicker from "@modules/guides/decoration-methods/components/method-picker"
import MethodSwatch from "@modules/guides/decoration-methods/components/method-swatch"
import type { Method } from "@modules/guides/decoration-methods/recommend"

// NO PRICING ON THIS PAGE (Sean, 2026-10-01). It explains how the three
// methods differ and which suits a job — never what they cost. Minimums and
// turnaround days are read from the same constants the customiser uses.

const PATH = "/guides/dtf-vs-screen-printing-vs-embroidery"
const TITLE = "DTF vs Screen Printing vs Embroidery: Which to Choose"
const DESCRIPTION =
  "DTF, screen printing or embroidery? How they differ in look, feel, minimums and turnaround, where each falls down, and a quick tool to pick one."

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

type MethodInfo = {
  key: Method
  name: string
  what: string
  chooseWhen: string
  href: string
  minimum: string
  setup: string
  detail: string
  feel: string
  bestOn: string
  turnaround: string
  scaling: string
  limits: string[]
}

const METHODS: MethodInfo[] = [
  {
    key: "dtf",
    name: "DTF print",
    what: "Your design is printed in full colour onto a film, then heat-pressed onto the garment.",
    chooseWhen: "You need a few pieces, or the artwork is a photo, a gradient or many colours.",
    href: "/services/digital-transfers",
    minimum: "From 1 piece",
    setup: "Nothing to make first. No screens and no stitch file.",
    detail: "Unlimited colours, photos, gradients and fine detail",
    feel: "A thin, smooth layer on top of the fabric",
    bestOn: "Tees, hoodies and totes. Small prints on caps.",
    turnaround: TURNAROUNDS.dtf.standard,
    scaling: "Stays much the same per piece",
    limits: [
      "A large solid design feels heavier on the garment than a screen print.",
      "The cost per piece barely falls on a big run.",
      "It cannot go on puffer jackets, and polyester sportswear needs a different transfer.",
    ],
  },
  {
    key: "screen",
    name: "Screen printing",
    what: "Ink is pushed through a mesh stencil straight onto the garment, one colour at a time.",
    chooseWhen: "You want a bigger run of a bold design in a few solid colours.",
    href: "/services/screen-printing",
    minimum: `${SCREEN_MIN_QUANTITY} pieces`,
    setup: "A screen is made for every colour before printing starts.",
    detail: `Up to ${SCREEN_MAX_COLOURS} solid colours. No photos or gradients.`,
    feel: "Soft, light ink that sits in the fabric",
    bestOn: "Tees, hoodies and totes. Large prints.",
    turnaround: TURNAROUNDS.screen.standard,
    scaling: "Drops a lot as the run grows",
    limits: [
      `There is a ${SCREEN_MIN_QUANTITY}-piece minimum, and a setup for every colour.`,
      "It prints solid colours only, so photos and gradients are out.",
      "It has the longest turnaround of the three.",
    ],
  },
  {
    key: "embroidery",
    name: "Embroidery",
    what: "Your logo is converted into a stitch file and sewn into the garment with thread.",
    chooseWhen: "You want a logo on polos, caps, jackets or workwear that looks premium and lasts.",
    href: "/services/embroidery",
    minimum: "From 1 piece",
    setup: "Your logo is digitised into a stitch file once, then kept on file.",
    detail: "Solid thread colours. No gradients, and very small text loses clarity.",
    feel: "Raised, textured stitching",
    bestOn: "Polos, caps, beanies, jackets and workwear.",
    turnaround: TURNAROUNDS.embroidery.standard,
    scaling: "Falls with quantity. Set mainly by stitch count.",
    limits: [
      "Thread cannot reproduce photos, gradients or very fine detail.",
      "A large stitched design gets heavy and stiff, especially on a lightweight tee.",
      "The bigger and denser the design, the more stitches it takes.",
    ],
  },
]

const ROWS: { label: string; get: (m: MethodInfo) => string }[] = [
  { label: "Minimum order", get: (m) => m.minimum },
  { label: "Before production", get: (m) => m.setup },
  { label: "Colours and detail", get: (m) => m.detail },
  { label: "How it feels", get: (m) => m.feel },
  { label: "Works best on", get: (m) => m.bestOn },
  { label: "Standard turnaround", get: (m) => m.turnaround },
  { label: "Cost per piece as quantity grows", get: (m) => m.scaling },
]

const PHOTOS: { src: string; alt: string; method: string }[] = [
  {
    src: "/images/services/embroidery/snip-society-scissors.png",
    alt: "Detailed gold and silver embroidery on black fabric: crossed scissors, crown, gems, and Snip Society banner lettering.",
    method: "Embroidery",
  },
  {
    src: "/images/services/screen-printing/restored-right.png",
    alt: "Dark grey garment with a yellow screen-printed Restored Right flood restoration and cleaning logo and phone number.",
    method: "Screen printing",
  },
  {
    src: "/images/services/embroidery/gundam-mecha-polo.png",
    alt: "Intricate multi-colour mecha embroidery on royal blue pique fabric.",
    method: "Embroidery",
  },
  {
    src: "/images/services/screen-printing/eco-flush-plumbing.png",
    alt: "Black t-shirts with a neon green and white multi-colour screen-printed plumbing services design.",
    method: "Screen printing",
  },
]

const FAQS = [
  {
    q: "Is DTF the same as a digital transfer?",
    a: "Yes. DTF stands for direct to film. We call the same service digital transfers elsewhere on the site.",
  },
  {
    q: "Which method is cheapest?",
    a: "It depends on the job. For a small run it is usually DTF, because nothing has to be set up first. For a big run in a few solid colours it is usually screen printing. Embroidery is driven by how many stitches the design needs. The customiser prices each method for your exact job.",
  },
  {
    q: "Which lasts longest?",
    a: "Embroidery is the hardest wearing, which is why it is the standard on workwear and uniforms. Screen printing is known for long-term wash performance. For any print, wash the garment inside out on a cool cycle to get the most from it.",
  },
  {
    q: "Can I use more than one method on the same garment?",
    a: "Yes. A common combination is an embroidered logo on the chest with a printed design on the back.",
  },
  {
    q: "What if my artwork is not print-ready?",
    a: "Upload what you have. The customiser checks the resolution as you place it, and you get a proof to approve before anything is produced.",
  },
]

// One-shot entrance for the hero swatches. CSS only, so it is in the server HTML.
const CSS = `
@keyframes dm-pop { from { opacity: 0; transform: translateY(14px) scale(.92) } to { opacity: 1; transform: none } }
.dm-pop { animation: dm-pop .6s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0s) }
@media (prefers-reduced-motion: reduce) { .dm-pop { animation: none } }
`

const prose = "mt-4 max-w-3xl text-base leading-relaxed text-ui-fg-subtle"
const eyebrow = "text-xs font-semibold uppercase tracking-[0.12em]"
const card =
  "h-full rounded-xl border border-ui-border-base bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-sm"
const linkClass = "font-semibold !text-[var(--brand-secondary)] underline underline-offset-4"

export default function DecorationMethodsGuidePage() {
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
      <style>{CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }} />

      {/* HERO — text is never hidden (LCP); only the swatches animate. */}
      <header className="grid items-center gap-8 rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-8 small:grid-cols-[1.1fr_1fr] small:p-10">
        <div>
          <p className={`${eyebrow} text-ui-fg-muted`}>Guide</p>
          <h1 className="page-title-marketing mt-3">
            DTF, screen printing or embroidery: which should you choose?
          </h1>
          <p className="mt-4 max-w-2xl text-ui-fg-subtle">
            Three ways to put a design on a garment, and each one suits a different job. The right
            choice comes down to how many you need, what the artwork looks like and what it is
            going on.
          </p>
          <a
            href="#picker"
            className="group mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold !text-white shadow-sm transition hover:brightness-110"
          >
            Find your method
            <span aria-hidden className="transition-transform group-hover:translate-y-0.5">
              ↓
            </span>
          </a>
        </div>
        <figure className="m-0">
          <div className="grid grid-cols-3 gap-3 small:gap-5">
            {METHODS.map((m, i) => (
              <div
                key={m.key}
                className="dm-pop text-center"
                style={{ "--d": `${0.15 + i * 0.18}s` } as CSSProperties}
              >
                <MethodSwatch
                  method={m.key}
                  id={`hero-${m.key}`}
                  className="h-auto w-full drop-shadow-sm"
                  title={`Close-up of a design decorated with ${m.key === "dtf" ? "a DTF print" : m.name.toLowerCase()}`}
                />
                <p className="mt-2 text-sm font-semibold text-ui-fg-base">{m.name}</p>
              </div>
            ))}
          </div>
          <figcaption className="mt-3 text-center text-xs text-ui-fg-muted">
            The same design three ways: a smooth full-colour film, flat ink in the weave, and
            raised stitching.
          </figcaption>
        </figure>
      </header>

      {/* SHORT ANSWER */}
      <section className="mt-16">
        <SectionHeader eyebrow="The short answer" title="Three methods, three jobs" />
        <div className="mt-8 grid gap-4 small:grid-cols-3">
          {METHODS.map((m, i) => (
            <Reveal key={m.key} delay={i * 0.08}>
              <div className={card}>
                <div className="flex items-center gap-4">
                  <MethodSwatch method={m.key} id={`short-${m.key}`} className="h-16 w-16 shrink-0" />
                  <h3 className="text-xl font-semibold text-ui-fg-base">{m.name}</h3>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-ui-fg-subtle">{m.what}</p>
                <p className={`${eyebrow} mt-5 text-ui-fg-muted`}>Choose it when</p>
                <p className="mt-1 text-sm font-medium text-ui-fg-base">{m.chooseWhen}</p>
                <LocalizedClientLink href={m.href} className={`${linkClass} mt-4 inline-flex min-h-11 items-center text-sm`}>
                  More about {m.key === "dtf" ? "DTF printing" : m.name.toLowerCase()}
                </LocalizedClientLink>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* PICKER */}
      <section id="picker" className="mt-16 scroll-mt-28">
        <SectionHeader eyebrow="Try it" title="Find your method" />
        <p className={prose}>
          Answer three questions about your job. The three methods re-rank as you change the
          answers, with the reasons shown for each.
        </p>
        <Reveal className="mt-6">
          <MethodPicker />
        </Reveal>
      </section>

      {/* SIDE BY SIDE */}
      <section className="mt-16">
        <SectionHeader eyebrow="The detail" title="Side by side" />
        <Reveal className="mt-8">
          <div className="overflow-x-auto rounded-2xl border border-ui-border-base bg-white">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ui-border-base">
                  <th className="w-[19%] p-4" />
                  {METHODS.map((m) => (
                    <th key={m.key} className="w-[27%] p-4 align-bottom">
                      <div className="flex items-center gap-3">
                        <MethodSwatch method={m.key} id={`table-${m.key}`} className="h-10 w-10 shrink-0" />
                        <span className="text-base font-semibold text-ui-fg-base">{m.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-ui-border-base last:border-0 even:bg-ui-bg-subtle">
                    <th scope="row" className={`${eyebrow} p-4 align-top font-semibold text-ui-fg-muted`}>
                      {row.label}
                    </th>
                    {METHODS.map((m) => (
                      <td key={m.key} className="p-4 align-top text-sm text-ui-fg-base">
                        {row.get(m)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <p className={prose}>
          Screen printing is the only one with a setup for every colour.{" "}
          <LocalizedClientLink href="/guides/screen-printing-cost" className={linkClass}>
            Here is why it has setup costs and a minimum
          </LocalizedClientLink>
          .
        </p>
      </section>

      {/* LIMITS */}
      <section className="mt-16">
        <SectionHeader eyebrow="The honest part" title="Where each one falls down" />
        <div className="mt-8 grid gap-4 small:grid-cols-3">
          {METHODS.map((m, i) => (
            <Reveal key={m.key} delay={i * 0.08}>
              <div className={card}>
                <h3 className="text-lg font-semibold text-ui-fg-base">{m.name}</h3>
                <ul className="mt-4 space-y-3 text-sm text-ui-fg-subtle">
                  {m.limits.map((limit) => (
                    <li key={limit} className="flex gap-3">
                      <span
                        aria-hidden
                        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(255,46,99,0.12)] text-xs font-bold !text-[#d81e4f]"
                      >
                        !
                      </span>
                      {limit}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* PHOTOS */}
      <section className="mt-16">
        <SectionHeader eyebrow="On the garment" title="What they look like finished" />
        <div className="mt-8 grid gap-4 phone:grid-cols-2 small:grid-cols-4">
          {PHOTOS.map((photo, i) => (
            <Reveal key={photo.src} delay={(i % 4) * 0.06}>
              <figure className="m-0">
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-subtle">
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 480px) 50vw, 100vw"
                    className="object-cover transition duration-500 hover:scale-[1.03]"
                  />
                  <span className="absolute left-3 top-3 rounded-md bg-[var(--brand-primary)] px-2 py-1 text-xs font-semibold !text-white">
                    {photo.method}
                  </span>
                </div>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* MIX */}
      <Reveal className="mt-16">
        <section className="grid items-center gap-8 rounded-2xl bg-[var(--brand-primary)] p-8 small:grid-cols-[auto_1fr] small:p-10">
          <div className="flex justify-center -space-x-5">
            {METHODS.map((m) => (
              <MethodSwatch key={m.key} method={m.key} id={`mix-${m.key}`} className="h-20 w-20 small:h-24 small:w-24" />
            ))}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-white small:text-3xl">You do not have to pick just one</h2>
            <p className="mt-3 max-w-2xl text-white/80">
              Methods can be combined on the same garment. An embroidered logo on the chest with a
              printed design on the back is a common pairing: the stitching gives the front a
              premium finish, and the print carries the big artwork without the weight.
            </p>
          </div>
        </section>
      </Reveal>

      {/* FAQ */}
      <section className="mt-16">
        <SectionHeader eyebrow="Quick answers" title="Choosing a method FAQ" />
        <div className="mt-6 max-w-3xl space-y-3">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-ui-border-base bg-ui-bg-subtle p-4 transition hover:border-[var(--brand-secondary)]"
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
          <h2 className="text-2xl font-semibold text-white small:text-3xl">Try it on your own artwork</h2>
          <p className="mx-auto mt-3 max-w-2xl text-white/80">
            Pick a garment and add your design in the customiser. You can switch between methods
            and see the price for each before you order.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <LocalizedClientLink
              href="/store"
              className="group inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold !text-white shadow-sm transition hover:brightness-110"
            >
              Choose a garment
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/contact"
              className="inline-flex min-h-11 items-center rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold !text-white transition hover:bg-white/10"
            >
              Ask us which suits your job
            </LocalizedClientLink>
          </div>
        </section>
      </Reveal>
    </div>
  )
}
