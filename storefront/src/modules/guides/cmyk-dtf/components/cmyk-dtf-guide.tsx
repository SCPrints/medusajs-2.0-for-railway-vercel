import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MarketingHero from "@modules/common/components/marketing-hero"

import { cmykDtfChart } from "../cmyk-dtf-chart-schema"

import CmykDtfCategorySection from "./cmyk-dtf-category-section"

export default function CmykDtfGuide() {
  const chart = cmykDtfChart.cmyk_color_chart

  let cardOffset = 0
  const sectionsWithOffsets = chart.map((section) => {
    const start = cardOffset
    cardOffset += section.colors.length
    return { section, cardOffset: start }
  })

  return (
    <>
      <div className="bg-ui-bg-subtle border-b border-ui-border-base">
        <div className="content-container py-8 small:py-10">
          <MarketingHero
            eyebrow="Print preparation"
            align="center"
            title="CMYK for DTF printing"
            subtitle={
              <>
                CMYK describes how cyan, magenta, yellow, and black combine on film and garments.
                Screens use RGB and hex for approximation—the chart below helps artwork setup but does not guarantee final colour.
                DTF results depend on your RIP, ICC profiles, printer limits, white underbase, and fabric; request a physical proof for critical brand colours.
              </>
            }
            subtitleClassName="text-base max-w-2xl mx-auto leading-relaxed"
          />
        </div>
      </div>

      <div className="content-container py-12 small:py-16">
        <div className="mx-auto max-w-6xl space-y-14 small:space-y-16">
          <section className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-5 small:p-6">
            <h2 className="text-lg font-semibold text-ui-fg-base">Before you export</h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-ui-fg-subtle">
              <li>
                Work in your design app&apos;s CMYK workspace when possible; avoid converting RGB artwork
                at the last step unless you understand the colour shift.
              </li>
              <li>
                Coordinate white ink and choke/spread settings with whoever runs your films—those choices
                affect how sharp colours read on dark garments.
              </li>
              <li>
                Heavy ink stacks may hit printer limits; very saturated fills might need adjustment on press.
              </li>
            </ul>
            <p className="mt-4 text-sm text-ui-fg-muted">
              Questions about files or proofs?{" "}
              <LocalizedClientLink
                href="/contact"
                className="font-semibold text-[var(--brand-secondary)] underline-offset-2 hover:underline"
              >
                Contact us
              </LocalizedClientLink>
              .
            </p>
          </section>

          {sectionsWithOffsets.map(({ section, cardOffset: offset }) => (
            <CmykDtfCategorySection key={section.category} section={section} cardOffset={offset} />
          ))}
        </div>
      </div>
    </>
  )
}
