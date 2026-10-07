import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Reveal from "@modules/guides/components/reveal"

import { pantoneChart, type PantoneColor } from "../pantone-chart-schema"

import PantoneLibrary from "./pantone-library"

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-secondary)]" />
    <span>{children}</span>
  </li>
)

const Card = ({ color }: { color: PantoneColor }) => (
  <article className="flex flex-col overflow-hidden rounded-xl border border-ui-border-base bg-ui-bg-base shadow-sm">
    <div className="min-h-[110px] border-b border-ui-border-base" style={{ backgroundColor: color.hex }} aria-hidden />
    <div className="p-4">
      <h3 className="text-base font-semibold text-ui-fg-base">{color.name}</h3>
      <p className="mt-1 font-mono text-xs text-ui-fg-muted">
        {color.hex} · L{color.lab[0]} a{color.lab[1]} b{color.lab[2]}
      </p>
      {color.notes ? <p className="mt-2 text-sm leading-relaxed text-ui-fg-subtle">{color.notes}</p> : null}
    </div>
  </article>
)

export default function PantoneGuide() {
  return (
    <>
      <div className="border-b border-ui-border-base bg-ui-bg-subtle">
        <div className="content-container py-14 small:py-20">
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]/70">
              Print preparation
            </p>
            <h1 className="page-title-marketing mt-3 tracking-tight">Pantone colours for screen printing</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ui-fg-subtle small:text-lg">
              Screen printing lays down one mixed ink per colour, so a Pantone number is a real target we
              can mix to, not an approximation. This page explains how to supply one, what changes the
              result on fabric, and shows the references we get asked for most. The swatches are screen
              approximations; the pressed sheet is the truth.
            </p>
          </header>
        </div>
      </div>

      <div className="content-container py-12 small:py-16">
        <div className="mx-auto max-w-6xl space-y-12 small:space-y-16">
          <section className="grid gap-6 tablet:grid-cols-2">
            <div className="rounded-2xl border border-ui-border-base bg-white p-6 small:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
                Why Pantone here and CMYK there
              </p>
              <h2 className="mt-2 text-xl font-semibold text-ui-fg-base small:text-2xl">Spot ink versus process</h2>
              <p className="mt-4 text-sm leading-relaxed text-ui-fg-subtle small:text-base">
                A Pantone solid is a spot colour: a single ink mixed by recipe from the base inks. Screen
                printing prints exactly that ink, which is why it is the method for brand-critical colour.
                DTF and other digital methods build every colour from cyan, magenta, yellow and black dots,
                so they can only approximate a Pantone and some, like bright oranges, purples and fluoros,
                sit outside what process inks can reach.
              </p>
              <LocalizedClientLink
                href="/guides/cmyk-dtf"
                className="group mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ui-fg-base underline underline-offset-4 transition hover:text-[var(--brand-secondary)]"
              >
                Printing DTF instead? Read the CMYK guide
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
              </LocalizedClientLink>
            </div>

            <div className="rounded-2xl border border-ui-border-base bg-white p-6 small:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
                Pre-flight checklist
              </p>
              <h2 className="mt-2 text-xl font-semibold text-ui-fg-base small:text-2xl">How to supply a Pantone</h2>
              <ul className="mt-5 list-none space-y-3 p-0 text-sm leading-relaxed text-ui-fg-subtle small:text-base">
                <Bullet>
                  Quote the Solid Coated number, the one ending in <strong>C</strong>, for example PANTONE
                  286 C. Uncoated (U) and Bridge (CP) numbers describe paper, not ink.
                </Bullet>
                <Bullet>
                  Keep the colour as a named spot swatch in the artwork file. A Pantone that has been
                  converted to CMYK or RGB arrives as a different colour.
                </Bullet>
                <Bullet>
                  A hex code or a screenshot is not a Pantone. If that is all you have, send it and we will
                  pick the nearest solid together.
                </Bullet>
                <Bullet>Tell us the garment colour and which colours are critical. Not every colour on a job needs a tight match.</Bullet>
              </ul>
            </div>
          </section>

          <section className="rounded-2xl border border-ui-border-base bg-white p-6 small:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
              What changes the match
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ui-fg-base small:text-2xl">Fabric is not paper</h2>
            <div className="mt-5 grid gap-5 text-sm leading-relaxed text-ui-fg-subtle tablet:grid-cols-3 small:text-base">
              <p>
                <strong className="text-ui-fg-base">Garment colour.</strong> Ink is semi-transparent. On a
                dark or strongly coloured garment the same ink needs a white underbase first, and even then
                reads slightly differently to the fan deck.
              </p>
              <p>
                <strong className="text-ui-fg-base">Ink and finish.</strong> Plastisol, water-based and
                discharge inks each sit differently on the fibres. A matte finish looks darker and less
                saturated than a gloss one.
              </p>
              <p>
                <strong className="text-ui-fg-base">Light.</strong> Two colours can match under the shop
                lights and part ways in daylight. We judge matches in a daylight booth and against a current
                fan deck, not a monitor.
              </p>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-ui-fg-subtle small:text-base">
              We have pressed every colour in the library below onto garments and keep the sheets in the
              studio. For a brand-critical colour we hold your sample against the pressed sheet, then press a
              test on your actual garment before the run.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <p className="text-sm text-ui-fg-subtle">Have a brand colour to match?</p>
              <LocalizedClientLink
                href="/contact"
                className="group inline-flex items-center gap-1.5 text-sm font-semibold text-ui-fg-base underline underline-offset-4 transition hover:text-[var(--brand-secondary)]"
              >
                Send us the reference
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
              </LocalizedClientLink>
            </div>
          </section>

          {pantoneChart.pantone_chart.map((section, i) => (
            <Reveal key={section.category} delay={Math.min(i, 3) * 0.05}>
              <section className="scroll-mt-24">
                <h2 className="text-xl font-bold tracking-tight text-ui-fg-base small:text-2xl">{section.category}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ui-fg-subtle small:text-base">
                  {section.description}
                </p>
                <div className="mt-6 grid gap-5 phone:grid-cols-2 tablet:grid-cols-3 medium:grid-cols-4">
                  {section.colors.map((color) => (
                    <Card key={color.name} color={color} />
                  ))}
                </div>
              </section>
            </Reveal>
          ))}

          <section id="library" className="scroll-mt-24">
            <h2 className="text-xl font-bold tracking-tight text-ui-fg-base small:text-2xl">
              The full library we have pressed
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ui-fg-subtle small:text-base">
              Every Pantone Solid Coated colour, including the 2000 to 4000 series, plus the pastels, neons and
              the 10,000 series metallics. Type a number or name to find yours. The tile is a screen
              approximation of the book value; the pressed sheet in the studio is what we match to.
            </p>
            <PantoneLibrary swatches={pantoneChart.library} />
          </section>

          <p className="text-xs leading-relaxed text-ui-fg-muted">
            PANTONE® and other Pantone trademarks are the property of Pantone LLC. Values are taken from the
            Pantone libraries shipped with Adobe Illustrator and converted for screen display; they are a
            guide only and do not replace a physical fan deck.
          </p>
        </div>
      </div>
    </>
  )
}
