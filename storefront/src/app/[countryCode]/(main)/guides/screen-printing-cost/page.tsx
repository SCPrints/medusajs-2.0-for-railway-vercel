import { Metadata } from "next"

import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MarketingHero from "@modules/common/components/marketing-hero"
import SectionHeader from "@modules/common/components/section-header"
import {
  SCREEN_MAX_COLOURS,
  SCREEN_MAX_STANDARD_PRINT_CM,
  SCREEN_MIN_QUANTITY,
} from "@modules/customizer/lib/scp-screen-print-pricing"
import { TURNAROUNDS } from "@modules/decoration/lib/rush"

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

const SETUP_STEPS = [
  {
    heading: "The artwork is separated",
    body: "Your design is split into one layer for each ink colour. A three-colour logo becomes three separate pieces of artwork, each printed in solid black onto clear film.",
  },
  {
    heading: "A screen is made for every colour",
    body: "A screen is a fine mesh stretched over a frame and coated with a light-sensitive emulsion. The film is laid on top and the screen is exposed to light. The emulsion hardens everywhere except behind the artwork, which is then washed out, leaving a stencil the ink can pass through.",
  },
  {
    heading: "The screens are lined up on the press",
    body: "Each screen is mounted on the press and adjusted until every colour lands exactly where it should on the garment. This is called registration, and on a multi-colour design it is the slowest part of the job.",
  },
  {
    heading: "Inks are prepared and the print is tested",
    body: "Ink colours are mixed or matched, test prints are run, and the alignment and ink coverage are checked before the first real garment goes under the screen.",
  },
  {
    heading: "Afterwards, everything is cleaned down",
    body: "When the run is finished the ink is cleared from the screens and the stencils are removed so the frames can be used again.",
  },
]

const PRICE_DRIVERS = [
  {
    heading: "Quantity",
    body: "The setup is spread over more garments and the printing itself is quick, so the cost per piece falls as the run grows.",
  },
  {
    heading: "Number of colours",
    body: "Every colour is another screen to make and another pass on the press.",
  },
  {
    heading: "Garment colour",
    body: "Ink looks dull printed straight onto dark fabric, so a layer of white is printed first. That underbase is one more screen, and a dark garment is priced as one extra colour.",
  },
  {
    heading: "Print positions",
    body: "A front and a back are two separate setups. Each position needs its own set of screens.",
  },
  {
    heading: "Garment type",
    body: "Hoodies, fleece and polyester are harder to print on than a flat cotton tee and cost a little more.",
  },
  {
    heading: "Print size",
    body: `The size of the print does not change the price up to ${SCREEN_MAX_STANDARD_PRINT_CM.width} × ${SCREEN_MAX_STANDARD_PRINT_CM.height} cm. Anything larger is quoted.`,
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
const linkClass =
  "font-medium !text-[var(--brand-secondary)] underline underline-offset-4"
const card = "rounded-xl border border-ui-border-base bg-white p-6"

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

      <MarketingHero
        eyebrow="Guide"
        eyebrowVariant="muted"
        title="Why screen printing has setup costs and a minimum order"
        subtitle="Screen printing is the most economical way to print a large run and a poor way to print a handful. The reason is setup: work that has to be done before the first garment is printed, and that is the same however many you order."
      />

      <section className="mt-12">
        <SectionHeader eyebrow="The process" title="What happens before the first print" />
        <p className={prose}>
          Screen printing pushes ink through a mesh stencil onto the garment,
          one colour at a time. Nothing about that stencil is generic: it is
          made for your artwork, for this job. Getting from a logo file to a
          press that is ready to print takes real work, and there is more to
          do once the run is finished.
        </p>
        <ol className="mt-6 grid gap-4 small:grid-cols-2">
          {SETUP_STEPS.map((step, i) => (
            <li key={step.heading} className={card}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
                Step {i + 1}
              </p>
              <h3 className="mt-2 text-base font-semibold text-ui-fg-base">
                {step.heading}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ui-fg-subtle">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="The setup fee" title="Why setup is charged separately" />
        <p className={prose}>
          All of that work happens once per job, and none of it gets smaller
          when the order does. Making and aligning the screens for {MIN} shirts
          takes exactly as long as for a thousand. Once the press is running,
          though, each additional garment takes only moments.
        </p>
        <p className={prose}>
          That is why setup is shown as its own line instead of being folded
          into the price of each garment. Shown separately, you can see which
          part of the job is fixed and which part grows with your quantity,
          and why a larger run costs so much less per piece.
        </p>
        <p className={prose}>
          Setup is counted per screen. You need one screen for every colour, in
          every print position, plus one more for the white underbase on a dark
          garment. A two-colour logo on the front of a white tee is two
          screens. The same logo on a black tee is three. Add it to the back as
          well and the count doubles. A design can use up to{" "}
          {SCREEN_MAX_COLOURS} colours per position, underbase included.
        </p>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="The minimum" title={`Why there is a ${MIN}-piece minimum`} />
        <p className={prose}>
          Below a certain size the setup outweighs everything else, and the
          cost per garment stops making sense for anyone. That is the reason
          screen printing starts at {MIN} pieces. The minimum applies per job,
          meaning the same garment with the same artwork. Mixed sizes count
          together; two different designs are two jobs.
        </p>
        <p className={prose}>
          For smaller orders,{" "}
          <LocalizedClientLink href="/services/digital-transfers" className={linkClass}>
            DTF printing
          </LocalizedClientLink>{" "}
          and embroidery have no screens to make and are available from a
          single garment.
        </p>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="What you control" title="What makes a job cost more or less" />
        <div className="mt-6 grid gap-4 small:grid-cols-2 medium:grid-cols-3">
          {PRICE_DRIVERS.map((d) => (
            <div key={d.heading} className={card}>
              <h3 className="text-base font-semibold text-ui-fg-base">{d.heading}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ui-fg-subtle">{d.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="Choosing a method" title="Screen printing or DTF?" />
        <p className={prose}>
          DTF is a printed transfer that is heat-pressed onto the garment.
          There are no screens to make, so there is no setup of this kind and
          no minimum. The trade-off is that the cost of each print stays much
          the same whether you order five or five hundred, and it rises with
          the size of the print.
        </p>
        <p className={prose}>
          Screen printing is the opposite: more to pay before you start, less
          for every garment after that, and the same for a small logo as for a
          full-chest print. Which one works out better depends on your
          quantity, your colours and your print size together.
        </p>
        <ul className="mt-5 max-w-3xl list-disc space-y-2 pl-5 text-base text-ui-fg-subtle">
          <li>
            <strong className="text-ui-fg-base">Screen printing suits</strong>{" "}
            larger runs, designs with one to three solid colours, and big
            prints.
          </li>
          <li>
            <strong className="text-ui-fg-base">DTF suits</strong> small runs,
            small chest logos, photos and gradients, designs with many colours,
            and individual names or numbers.
          </li>
          <li>
            <strong className="text-ui-fg-base">The finish is different too.</strong>{" "}
            Our screen prints use plastisol ink, which sits lighter and softer
            on the fabric than a DTF transfer.
          </li>
        </ul>
        <p className={prose}>
          If you are not sure, set the job up both ways in the customiser. It
          prices each method for your exact quantity, so you can compare them
          directly.
        </p>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="Spend less" title="How to keep the cost down" />
        <div className="mt-6 grid gap-4 small:grid-cols-2 medium:grid-cols-3">
          {SAVINGS.map((s) => (
            <div key={s.heading} className={card}>
              <h3 className="text-base font-semibold text-ui-fg-base">{s.heading}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ui-fg-subtle">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="Timing" title="Why it takes a little longer" />
        <p className={prose}>
          The same setup that adds cost also adds time. Standard turnaround
          for screen printing is {TURNAROUNDS.screen.standard} after artwork
          approval, and a priority service brings that to{" "}
          {TURNAROUNDS.screen.priority}. There is no next-day option for
          screen printing. If your date is tighter than that, DTF is the
          faster method.
        </p>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="Quick answers" title="Screen printing setup FAQ" />
        <dl className="mt-5 max-w-3xl space-y-5">
          {FAQS.map((f) => (
            <div key={f.q}>
              <dt className="text-base font-semibold text-ui-fg-base">{f.q}</dt>
              <dd className="mt-1 text-base text-ui-fg-subtle">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-6 small:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-ui-fg-base">
          See the price for your job
        </h2>
        <p className="mt-3 max-w-3xl text-base text-ui-fg-subtle">
          Pick a garment, add your artwork and choose screen printing in the
          customiser. It shows the setup and the full price for your quantity
          and colours before you order.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <LocalizedClientLink
            href="/store"
            className="rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            Choose a garment
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/contact"
            className="rounded-lg border border-ui-border-base bg-white px-6 py-3 text-sm font-semibold text-ui-fg-base transition hover:bg-ui-bg-subtle"
          >
            Ask us about your job
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/services/screen-printing"
            className="rounded-lg border border-ui-border-base bg-white px-6 py-3 text-sm font-semibold text-ui-fg-base transition hover:bg-ui-bg-subtle"
          >
            About our screen printing
          </LocalizedClientLink>
        </div>
      </section>
    </div>
  )
}
