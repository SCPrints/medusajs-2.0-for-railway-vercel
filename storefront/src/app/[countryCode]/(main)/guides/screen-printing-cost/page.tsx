import { Metadata } from "next"

import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MarketingHero from "@modules/common/components/marketing-hero"
import SectionHeader from "@modules/common/components/section-header"
import { SCP_PRINT_SIZE_OPTIONS } from "@modules/customizer/lib/scp-dtf-print-pricing"
import {
  SCP_SCREEN_QUANTITY_TIERS,
  SCREEN_HEAVY_GARMENT_SURCHARGE_MAJOR,
  SCREEN_MAX_COLOURS,
  SCREEN_MAX_QUANTITY,
  SCREEN_MAX_STANDARD_PRINT_CM,
  SCREEN_MIN_QUANTITY,
  SCREEN_REPEAT_SETUP_PER_SCREEN_MAJOR,
  SCREEN_SETUP_PER_SCREEN_MAJOR,
} from "@modules/customizer/lib/scp-screen-print-pricing"
import { SCREEN_RUSH_RATE } from "@modules/decoration/lib/methods/screen"
import { TURNAROUNDS } from "@modules/decoration/lib/rush"
import {
  dtfJobCost,
  screenBreakEvenQuantity,
  screenJobCost,
} from "@modules/guides/screen-printing-cost/examples"

// Every figure on this page is read from the live rate cards (or computed from
// them in examples.ts) — don't hard-code a price into the prose. Conclusions
// that depend on the numbers ("screen wins from N") are computed too.

const SETUP = SCREEN_SETUP_PER_SCREEN_MAJOR
const REPEAT = SCREEN_REPEAT_SETUP_PER_SCREEN_MAJOR
const MIN = SCREEN_MIN_QUANTITY
const RUSH_PERCENT = Math.round(SCREEN_RUSH_RATE * 100)

const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n)

const PATH = "/guides/screen-printing-cost"
const TITLE = "Screen Printing Cost: Setup Fees, Minimums & Prices"
const DESCRIPTION = `Screen printing prices explained: ${aud(SETUP)} per screen setup, ${MIN}-piece minimum, per-print rates by quantity and colour count, and when DTF is cheaper.`

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

const EXAMPLE_QUANTITIES = [25, 50, 100, 250]

const EXAMPLE_JOBS = [
  { label: "1 colour on a white tee", colours: 1, darkGarment: false },
  { label: "2 colours on a black tee", colours: 2, darkGarment: true },
]

const BREAK_EVEN_DESIGNS = [
  { label: "1 colour, light garment", colours: 1, darkGarment: false },
  { label: "2 colours, light garment", colours: 2, darkGarment: false },
  { label: "3 colours, dark garment", colours: 3, darkGarment: true },
]

// Oversize DTF is left out: it's quoted manually on some fabrics.
const DTF_SIZES = SCP_PRINT_SIZE_OPTIONS.filter((s) => s.id !== "oversize")

const th =
  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-ui-fg-muted"
const td = "px-3 py-2 text-sm text-ui-fg-base"
const tableWrap =
  "mt-5 overflow-x-auto rounded-xl border border-ui-border-base bg-white"
const prose = "mt-4 max-w-3xl text-base leading-relaxed text-ui-fg-subtle"
const linkClass =
  "font-medium !text-[var(--brand-secondary)] underline underline-offset-4"

export default function ScreenPrintingCostGuidePage() {
  const twoOnDark = screenJobCost({ quantity: MIN, colours: 2, darkGarment: true })
  const firstBand = SCP_SCREEN_QUANTITY_TIERS[0]
  const secondBand = SCP_SCREEN_QUANTITY_TIERS[1]
  const lastOfFirstBand = screenJobCost({ quantity: firstBand.maxQuantity, colours: 1 })
  const firstOfSecondBand = screenJobCost({ quantity: secondBand.minQuantity, colours: 1 })
  const bandJumpSaves = firstOfSecondBand.prints < lastOfFirstBand.prints
  const oneColourVsA4 = screenBreakEvenQuantity({ colours: 1 }, "up_to_a4")

  const faqs = [
    {
      q: "What is the minimum order for screen printing?",
      a: `${MIN} pieces per job, where a job is the same garment with the same artwork. Sizes can be mixed within that. For fewer than ${MIN}, DTF printing and embroidery are available from a single garment.`,
    },
    {
      q: "How much is the screen printing setup fee?",
      a: `${aud(SETUP)} per screen, including GST. You need one screen for each colour in each print position, plus one for the white underbase if the garment is dark.`,
    },
    {
      q: "Do I pay setup again when I re-order?",
      a: `Repeating the same design within 6 months costs ${aud(REPEAT)} per screen instead of ${aud(SETUP)}.`,
    },
    {
      q: "Why does printing on a black shirt cost more?",
      a: "Ink colours look dull printed straight onto dark fabric, so a layer of white is printed first. That underbase is an extra screen, and the job is priced as one more colour.",
    },
    {
      q: "Does the price include the shirt?",
      a: "No. The prices on this page are for the printing only. The garment is priced separately on its product page, and gets cheaper with quantity too.",
    },
  ]

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
    mainEntity: faqs.map((f) => ({
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
        title="What screen printing costs: setup fees, minimums and when it beats DTF"
        subtitle={`A screen printing price has three parts: the garment, a per-print rate that falls as the run grows, and a one-off setup fee of ${aud(SETUP)} per screen. The minimum is ${MIN} pieces. All prices include GST.`}
      />

      <section className="mt-12">
        <SectionHeader eyebrow="The fixed cost" title="The setup fee" />
        <p className={prose}>
          Screen printing pushes ink through a mesh stencil, one stencil per
          colour. Each stencil (a &quot;screen&quot;) has to be made for your
          artwork and lined up on the press before the first shirt is printed.
          That work is the same whether you order {MIN} shirts or{" "}
          {SCREEN_MAX_QUANTITY}, which is why it is charged once per job
          instead of being hidden in the per-shirt price.
        </p>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-base text-ui-fg-subtle">
          <li>
            <strong className="text-ui-fg-base">{aud(SETUP)} per screen.</strong>{" "}
            One screen per colour, per print position. A two-colour logo on the
            front is two screens; add the same logo on the back and it is four.
          </li>
          <li>
            <strong className="text-ui-fg-base">
              Dark garments need one more.
            </strong>{" "}
            A white underbase is printed first so the colours stay bright, and
            it counts as a colour. Two colours on a black tee is{" "}
            {twoOnDark.screens} screens, or {aud(twoOnDark.setup)} in setup.
          </li>
          <li>
            <strong className="text-ui-fg-base">
              Re-orders are {aud(REPEAT)} per screen
            </strong>{" "}
            when you repeat the same design within 6 months.
          </li>
          <li>
            <strong className="text-ui-fg-base">
              Up to {SCREEN_MAX_COLOURS} colours
            </strong>{" "}
            per position, underbase included.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="The minimum" title={`Why ${MIN} pieces`} />
        <p className={prose}>
          Below {MIN} pieces the setup fee swamps everything else, so screen
          printing is not offered for smaller runs. The minimum applies per job:
          the same garment with the same artwork. Mixed sizes count together.
          Two different designs are two jobs, each needing {MIN}.
        </p>
        <p className={prose}>
          For anything smaller,{" "}
          <LocalizedClientLink href="/services/digital-transfers" className={linkClass}>
            DTF printing
          </LocalizedClientLink>{" "}
          and embroidery are available from a single garment. Runs above{" "}
          {SCREEN_MAX_QUANTITY} pieces are quoted individually.
        </p>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="The variable cost" title="Price per print" />
        <p className={prose}>
          The per-print rate depends on two things: how many pieces are in the
          job and how many colours are in the design. It does not change with
          the size of the print, up to {SCREEN_MAX_STANDARD_PRINT_CM.width} ×{" "}
          {SCREEN_MAX_STANDARD_PRINT_CM.height} cm. Prices are per print
          position, include GST and exclude the garment.
        </p>
        <div className={tableWrap}>
          <table className="w-full min-w-[560px] border-collapse">
            <thead className="border-b border-ui-border-base bg-ui-bg-subtle">
              <tr>
                <th className={th}>Pieces</th>
                {firstBand.prices.map((_, i) => (
                  <th key={i} className={th}>
                    {i + 1} colour{i ? "s" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCP_SCREEN_QUANTITY_TIERS.map((tier) => (
                <tr key={tier.label} className="border-b border-ui-border-base last:border-0">
                  <td className={`${td} font-semibold`}>{tier.label}</td>
                  {tier.prices.map((p, i) => (
                    <td key={i} className={td}>
                      {aud(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-ui-fg-muted">
          On a dark garment, read one column to the right (the underbase).
          Hoodies, fleece and polyester garments add{" "}
          {aud(SCREEN_HEAVY_GARMENT_SURCHARGE_MAJOR)} per print. Prints larger
          than {SCREEN_MAX_STANDARD_PRINT_CM.width} ×{" "}
          {SCREEN_MAX_STANDARD_PRINT_CM.height} cm are quoted.
        </p>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="Put together" title="Worked examples" />
        <p className={prose}>
          One print position, first-time setup, printing cost only. The last
          column is the number to compare: setup spread across the run.
        </p>
        <div className="grid gap-6 large:grid-cols-2">
          {EXAMPLE_JOBS.map((job) => (
            <div key={job.label} className={tableWrap}>
              <table className="w-full border-collapse">
                <caption className="border-b border-ui-border-base px-3 py-2 text-left text-sm font-semibold text-ui-fg-base">
                  {job.label} ({screenJobCost({ ...job, quantity: MIN }).screens}{" "}
                  screen
                  {screenJobCost({ ...job, quantity: MIN }).screens > 1 ? "s" : ""})
                </caption>
                <thead className="border-b border-ui-border-base bg-ui-bg-subtle">
                  <tr>
                    <th className={th}>Pieces</th>
                    <th className={th}>Setup</th>
                    <th className={th}>Prints</th>
                    <th className={th}>Total</th>
                    <th className={th}>Per shirt</th>
                  </tr>
                </thead>
                <tbody>
                  {EXAMPLE_QUANTITIES.map((quantity) => {
                    const c = screenJobCost({ ...job, quantity })
                    return (
                      <tr key={quantity} className="border-b border-ui-border-base last:border-0">
                        <td className={`${td} font-semibold`}>{quantity}</td>
                        <td className={td}>{aud(c.setup)}</td>
                        <td className={td}>{aud(c.prints)}</td>
                        <td className={td}>{aud(c.total)}</td>
                        <td className={`${td} font-semibold`}>{aud(c.perGarment)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="Choosing a method" title="When screen printing beats DTF" />
        <p className={prose}>
          DTF (a printed transfer pressed onto the garment) has no screens to
          make and is available from one piece, but its price is set by the
          size of the print and falls only slightly with quantity. Screen
          printing is the opposite: costly to start, cheap to repeat, and the
          same price for a small logo as a full-chest print. So the answer
          depends on colours, print size and quantity together.
        </p>
        <p className={prose}>
          The table shows the quantity at which screen printing, setup
          included, becomes cheaper than DTF for one print position.
        </p>
        <div className={tableWrap}>
          <table className="w-full min-w-[520px] border-collapse">
            <thead className="border-b border-ui-border-base bg-ui-bg-subtle">
              <tr>
                <th className={th}>Design</th>
                {DTF_SIZES.map((s) => (
                  <th key={s.id} className={th}>
                    {s.label} print ({s.dimensionsLabel})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BREAK_EVEN_DESIGNS.map((design) => (
                <tr key={design.label} className="border-b border-ui-border-base last:border-0">
                  <td className={`${td} font-semibold`}>{design.label}</td>
                  {DTF_SIZES.map((s) => {
                    const q = screenBreakEvenQuantity(design, s.id)
                    return (
                      <td key={s.id} className={td}>
                        {q ? `Screen from ${q} pieces` : "DTF stays cheaper"}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-5 max-w-3xl list-disc space-y-2 pl-5 text-base text-ui-fg-subtle">
          <li>
            <strong className="text-ui-fg-base">Choose screen printing</strong>{" "}
            for one to three solid colours, larger prints, and runs that are
            comfortably past the break-even above.
          </li>
          <li>
            <strong className="text-ui-fg-base">Choose DTF</strong> for small
            runs, small chest logos, photos and gradients, lots of colours, or
            individual names and numbers.
          </li>
          <li>
            <strong className="text-ui-fg-base">Feel is different too.</strong>{" "}
            Our screen prints use plastisol ink, which sits lighter and softer
            on the fabric than a DTF transfer.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="Spend less" title="How to bring the price down" />
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-base text-ui-fg-subtle">
          <li>
            <strong className="text-ui-fg-base">Drop a colour.</strong> Each one
            removes a {aud(SETUP)} screen and moves you a column left in the
            price table.
          </li>
          <li>
            <strong className="text-ui-fg-base">Print on a light garment.</strong>{" "}
            No underbase means one less screen.
          </li>
          <li>
            <strong className="text-ui-fg-base">Keep it to one position.</strong>{" "}
            A back print doubles the screens.
          </li>
          {bandJumpSaves ? (
            <li>
              <strong className="text-ui-fg-base">Check the next band up.</strong>{" "}
              {firstBand.maxQuantity} one-colour prints cost{" "}
              {aud(lastOfFirstBand.prints)}; {secondBand.minQuantity} cost{" "}
              {aud(firstOfSecondBand.prints)}. If you are close to a band
              boundary, the bigger order can be the cheaper one.
            </li>
          ) : null}
          <li>
            <strong className="text-ui-fg-base">Re-order within 6 months</strong>{" "}
            and setup falls to {aud(REPEAT)} per screen.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="Timing" title="Turnaround and rush" />
        <p className={prose}>
          Standard turnaround for screen printing is {TURNAROUNDS.screen.standard}{" "}
          after artwork approval. Priority brings that to{" "}
          {TURNAROUNDS.screen.priority} for an extra {RUSH_PERCENT}% on the
          printing and setup. There is no next-day option for screen printing;
          if the date is tighter than that, DTF is the faster method.
        </p>
      </section>

      <section className="mt-12">
        <SectionHeader eyebrow="Quick answers" title="Screen printing cost FAQ" />
        <dl className="mt-5 max-w-3xl space-y-5">
          {faqs.map((f) => (
            <div key={f.q}>
              <dt className="text-base font-semibold text-ui-fg-base">{f.q}</dt>
              <dd className="mt-1 text-base text-ui-fg-subtle">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-6 small:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-ui-fg-base">
          Price your own job
        </h2>
        <p className="mt-3 max-w-3xl text-base text-ui-fg-subtle">
          Pick a garment, upload your artwork and choose screen print in the
          designer. It shows the live price for your quantity and colour count
          {oneColourVsA4
            ? `, and you can switch to DTF to compare. For a one-colour A4 print, screen printing is the cheaper of the two from ${oneColourVsA4} pieces.`
            : ", and you can switch to DTF to compare."}
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
            Get a quote
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
