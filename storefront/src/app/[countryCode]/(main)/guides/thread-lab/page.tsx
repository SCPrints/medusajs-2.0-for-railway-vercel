import { Metadata } from "next"
import { JetBrains_Mono, Space_Grotesk } from "next/font/google"
import Image from "next/image"
import type { HttpTypes } from "@medusajs/types"

import { getProductsByHandle } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import { getBrandPresentation } from "@modules/brands/data/brands"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { SCREEN_MIN_QUANTITY } from "@modules/customizer/lib/scp-screen-print-pricing"
import Reveal from "@modules/guides/components/reveal"
import { THREAD_LAB_STYLES, type ThreadLabStyle } from "@modules/guides/thread-lab/styles"

// Look and feel: a lab spec sheet. Warm unbleached-cotton paper, stone ink,
// monospace readouts and measurement rules — Thread Lab sells itself on the
// fabric spec, so the page leads with numbers. Calm, not streetwear-loud.
//
// NO PRICING ON THIS PAGE (see the screen-printing guide for the rule).
// Colours, sizes, photos and GSM are read live from the products; only the
// editorial lives in @modules/guides/thread-lab/styles.

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], display: "swap" })
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], display: "swap" })

const PATH = "/guides/thread-lab"
const TITLE = "Thread Lab Blanks: Core, Superior & Premium Tees Compared"
const DESCRIPTION =
  "Thread Lab tees and fleece explained: the Core, Superior and Premium tees by weight and fit, the Core Hoodie and Crew, every colour, and how we print them. From one piece."

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
    twitter: { card: "summary_large_image", title: socialTitle, description: DESCRIPTION, images: [SEO.ogImage] },
  }
}

type Style = ThreadLabStyle & {
  gsm: number | null
  front: string | null
  model: string | null
  colours: string[]
  sizes: string[]
  colourShots: { colour: string; src: string }[]
}

const optionValues = (product: HttpTypes.StoreProduct, title: string): string[] =>
  product.options
    ?.find((o) => o.title?.toLowerCase() === title)
    ?.values?.map((v) => v.value)
    .filter((v): v is string => Boolean(v)) ?? []

// Front flat-lays are named `<colour>-<style>-<garment>[_hash].jpg`; `-1` is
// the back, `TL_…` are model shots. The filename is the only colour join key.
const FRONT_RE = /\/([a-z]+)-(?:core|premium|superior)-(?:tee|hoodie|sweatshirt)(?:_[0-9a-f-]+)?\.jpg/i
const TOKEN_ALIAS: Record<string, string> = { stoneblue: "Stone Blue", blacksnow: "Black Snow Wash" }

function colourLabel(token: string, colours: string[]): string {
  const name = TOKEN_ALIAS[token] ?? token[0].toUpperCase() + token.slice(1)
  // Superior's "natural" shot is sold as Vanilla.
  if (name === "Natural" && !colours.includes("Natural") && colours.includes("Vanilla")) return "Vanilla"
  return name
}

function mergeLive(style: ThreadLabStyle, product: HttpTypes.StoreProduct): Style {
  const meta = (product.metadata ?? {}) as Record<string, unknown>
  const broken = new Set(
    ((meta.image_audit as { broken_urls?: string[] } | undefined)?.broken_urls ?? []) as string[]
  )
  const urls = (product.images ?? []).map((i) => i.url).filter((u) => u && !broken.has(u))
  const colours = optionValues(product, "colour")
  const fronts = urls.filter((u) => FRONT_RE.test(u))
  return {
    ...style,
    gsm: Number(meta.gsm) || null,
    front: (product.thumbnail && !broken.has(product.thumbnail) ? product.thumbnail : null) ?? fronts[0] ?? null,
    model: urls.find((u) => /\/TL_/.test(u)) ?? null,
    colours,
    sizes: optionValues(product, "size"),
    colourShots: fronts.map((src) => ({ colour: colourLabel(FRONT_RE.exec(src)![1].toLowerCase(), colours), src })),
  }
}

const CSS = `
@keyframes tl-marquee { to { transform: translateX(-50%) } }
.tl-marquee { display: flex; width: max-content; animation: tl-marquee 40s linear infinite }
@keyframes tl-rise { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
.tl-rise { animation: tl-rise .7s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0s) }
.tl-rule { background-image: repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 10px); height: 8px; opacity: .35 }
@media (prefers-reduced-motion: reduce) { .tl-marquee, .tl-rise { animation: none } }
`

const PAPER = "bg-[#efebe4]"
const INK = "bg-[#1c1917]"
const label = `${mono.className} text-[11px] font-semibold uppercase tracking-[0.16em]`
const h2 = `${display.className} text-4xl font-bold leading-[0.95] tracking-tight small:text-6xl`
const container = "content-container"
const btnInk =
  "group inline-flex min-h-11 items-center gap-2 rounded-full bg-[#1c1917] px-6 py-3 text-sm font-semibold !text-[#efebe4] transition hover:bg-black"
const btnLine =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-current px-6 py-3 text-sm font-semibold transition hover:bg-black/5"
const btnPaper =
  "group inline-flex min-h-11 items-center gap-2 rounded-full bg-[#efebe4] px-6 py-3 text-sm font-semibold !text-[#1c1917] transition hover:bg-white"

const Arrow = () => (
  <span aria-hidden className="transition-transform group-hover:translate-x-1">
    →
  </span>
)

export default async function ThreadLabGuidePage({ params }: Props) {
  const { countryCode } = await params
  const region = await getRegion(countryCode)
  const products = region
    ? await getProductsByHandle({ handles: THREAD_LAB_STYLES.map((s) => s.handle), regionId: region.id })
    : []
  const byHandle = new Map(products.map((p) => [p.handle, p]))
  // ponytail: styles not live on the store are dropped, never a dead link.
  const styles = THREAD_LAB_STYLES.flatMap((s) => {
    const p = byHandle.get(s.handle)
    return p ? [mergeLive(s, p)] : []
  })
  const tees = styles.filter((s) => s.family === "tee")
  const fleece = styles.filter((s) => s.family === "fleece")
  const gsms = styles.map((s) => s.gsm).filter((g): g is number => g !== null)
  const minGsm = gsms.length ? Math.min(...gsms) : 200
  const maxGsm = gsms.length ? Math.max(...gsms) : 340
  const colourCount = new Set(styles.flatMap((s) => s.colours)).size
  const hero = getBrandPresentation("thread-lab")
  const ladder = [...styles].filter((s) => s.gsm).sort((a, b) => a.gsm! - b.gsm!)

  const faqs = [
    {
      q: "Who is Thread Lab?",
      a: "Thread Lab is a Melbourne blank-apparel brand. It makes plain tees and fleece designed to be printed and embroidered, sold to decorators and brands rather than retail shoppers.",
    },
    {
      q: "What is the difference between the Core, Superior and Premium tee?",
      a: `Weight and shape. The Core Tee is the lightest${tees[0]?.gsm ? ` at ${tees[0].gsm} GSM` : ""} with a relaxed straight cut. The Superior is heavier and oversized with wide neck ribbing. The Premium is the heaviest, with a boxy 90s frame and dropped shoulders.`,
    },
    {
      q: "Do Thread Lab tees have a brand label in the neck?",
      a: "They use a tear-away neck label. Tear it out after decoration and nothing in the neck says Thread Lab, so the tee reads as your merch.",
    },
    {
      q: "How does Thread Lab sizing run?",
      a: "The Core Tee is relaxed but close to true to size. The Superior and Premium are cut oversized, so take your usual size for a loose fit or size down for a closer one. The fleece is relaxed with a drop shoulder.",
    },
    {
      q: "Is there a minimum order?",
      a: `No. Full-colour prints and embroidery are available from one piece. Screen printing starts at ${SCREEN_MIN_QUANTITY} pieces.`,
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
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  }

  const ticker = [
    "Melbourne made for print",
    `${minGsm}–${maxGsm} GSM`,
    "Combed cotton",
    "Tear-away labels",
    "Preshrunk",
    "From one piece",
    "Decorated in Sydney",
  ]

  return (
    <div className={`${PAPER} text-[#1c1917]`}>
      <style>{CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }} />

      {/* HERO — split: copy on paper, brand film in a framed panel. */}
      <header className={`${container} grid gap-10 pb-14 pt-12 small:grid-cols-[1.05fr_1fr] small:items-end small:pb-20 small:pt-20`}>
        <div>
          <p className={`${label} tl-rise text-[#1c1917]/60`}>Guide · Brand file 01 / Thread Lab</p>
          <h1
            className={`${display.className} tl-rise mt-5 text-5xl font-bold leading-[0.92] tracking-tight small:text-7xl`}
            style={{ ["--d" as string]: "0.1s" }}
          >
            Thread Lab blanks, <span className="text-[#1c1917]/45">tested for print.</span>
          </h1>
          <p className="tl-rise mt-6 max-w-xl text-base text-[#1c1917]/75 small:text-lg" style={{ ["--d" as string]: "0.25s" }}>
            A Melbourne label that makes plain tees and fleece for decorators. Here is the range by
            weight and fit, every colour we carry, and how each one takes a print.
          </p>
          <div className="tl-rise mt-8 flex flex-wrap gap-3" style={{ ["--d" as string]: "0.4s" }}>
            <a href="#lineup" className={btnInk}>
              See the range <Arrow />
            </a>
            <LocalizedClientLink href="/brands/thread-lab" className={btnLine}>
              Shop Thread Lab
            </LocalizedClientLink>
          </div>
        </div>
        <div className="tl-rise relative" style={{ ["--d" as string]: "0.2s" }}>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#d9d3c7]">
            {hero.videoSrc ? (
              <video
                className="absolute inset-0 h-full w-full object-cover"
                src={hero.videoSrc}
                poster={hero.videoPosterSrc}
                autoPlay
                muted
                loop
                playsInline
                aria-hidden
              />
            ) : null}
          </div>
          <p className={`${label} mt-3 flex justify-between text-[#1c1917]/50`}>
            <span>Fig. 1 — brand film</span>
            <span>Source: Thread Lab</span>
          </p>
        </div>
      </header>

      {/* TICKER */}
      <div className={`${INK} overflow-hidden py-3 text-[#efebe4]`} aria-hidden>
        <div className="tl-marquee">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0">
              {ticker.map((t) => (
                <li key={t} className={`${mono.className} flex items-center whitespace-nowrap px-6 text-sm uppercase tracking-[0.14em]`}>
                  {t}
                  <span className="pl-12 text-[#efebe4]/30">+</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {/* SPEC READOUT */}
      <section className={`${container} grid gap-10 py-16 small:grid-cols-[1fr_1.1fr] small:py-24`}>
        <div>
          <p className={`${label} text-[#1c1917]/55`}>What it is</p>
          <h2 className={`${h2} mt-3`}>Built to be decorated</h2>
          <p className="mt-6 max-w-xl text-[#1c1917]/75">
            Most blanks are retail tees with the logo left off. Thread Lab starts from the other
            end: preshrunk fabric so a print stays registered through the wash, combed cotton for a
            smooth surface, and a tear-away label so the finished piece carries your brand, not
            theirs.
          </p>
          <p className="mt-4 max-w-xl text-[#1c1917]/75">
            It is a smaller label than the big wholesalers, which is part of the appeal: your
            merch will not look like everyone else&apos;s.
          </p>
        </div>
        <dl className="grid grid-cols-2 self-end rounded-2xl border border-[#1c1917]/20 bg-white/40">
          {[
            [`${minGsm}–${maxGsm}`, "GSM across the range"],
            [`${styles.length}`, "Styles we carry"],
            [`${colourCount}`, "Colours"],
            ["MEL", "Based in Melbourne"],
          ].map(([value, name], i) => (
            <Reveal
              key={name}
              delay={i * 0.08}
              className={`p-6 ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b" : ""} border-[#1c1917]/20`}
            >
              <dt className={`${label} text-[#1c1917]/50`}>{name}</dt>
              <dd className={`${display.className} mt-2 text-5xl font-bold leading-none small:text-6xl`}>{value}</dd>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* LINEUP */}
      <section id="lineup" className="scroll-mt-24 bg-white">
        <div className={`${container} py-16 small:py-24`}>
          <p className={`${label} text-[#1c1917]/55`}>The range</p>
          <h2 className={`${h2} mt-3`}>{styles.length} blanks, one spec sheet each</h2>
          <p className="mt-6 max-w-2xl text-[#1c1917]/70">
            Three tees that step up in weight, and a hoodie and crew cut from the same fleece. Hover
            a card to see it worn.
          </p>
          <div className="mt-10 grid gap-5 tablet:grid-cols-2 medium:grid-cols-3">
            {styles.map((s, i) => (
              <Reveal key={s.handle} delay={(i % 3) * 0.08} className="h-full">
                <LocalizedClientLink
                  href={`/products/${s.handle}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[#1c1917]/15 bg-[#f7f5f0] !text-[#1c1917] transition hover:border-[#1c1917]/50"
                >
                  <div className="relative aspect-square overflow-hidden bg-[#efebe4]">
                    {s.front ? (
                      <Image
                        src={s.front}
                        alt={`Thread Lab ${s.name}, front`}
                        fill
                        sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                        className={`object-contain p-6 transition-opacity duration-300 ${s.model ? "group-hover:opacity-0" : ""}`}
                      />
                    ) : null}
                    {s.model ? (
                      <Image
                        src={s.model}
                        alt={`Thread Lab ${s.name} worn by a model`}
                        fill
                        sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                        className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      />
                    ) : null}
                    <span className={`${label} absolute left-3 top-3 rounded-full bg-[#1c1917] px-3 py-1 !text-[#efebe4]`}>
                      {s.code}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className={`${display.className} text-3xl font-bold leading-none`}>{s.name}</h3>
                    <p className="mt-3 text-sm text-[#1c1917]/70">{s.take}</p>
                    <dl className={`${mono.className} mt-5 divide-y divide-dashed divide-[#1c1917]/20 border-y border-dashed border-[#1c1917]/20 text-xs`}>
                      {[
                        ["Weight", s.gsm ? `${s.gsm} GSM` : null],
                        ["Fit", s.fitLabel],
                        ["Fabric", s.fabric],
                        ["Sizes", s.sizes.length ? `${s.sizes[0]}–${s.sizes[s.sizes.length - 1]}` : null],
                        ["Colours", s.colours.length ? s.colours.join(", ") : null],
                      ]
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-4 py-2">
                            <dt className="uppercase tracking-[0.12em] text-[#1c1917]/50">{k}</dt>
                            <dd className="text-right">{v}</dd>
                          </div>
                        ))}
                    </dl>
                    <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold">
                      Customise the {s.name} <Arrow />
                    </span>
                  </div>
                </LocalizedClientLink>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* WEIGHT LADDER */}
      {ladder.length ? (
        <section className={`${container} grid gap-10 py-16 small:grid-cols-[1fr_1.2fr] small:py-24`}>
          <div>
            <p className={`${label} text-[#1c1917]/55`}>Fig. 2 — the weight ladder</p>
            <h2 className={`${h2} mt-3`}>Pick by how heavy you want it</h2>
            <p className="mt-6 max-w-xl text-[#1c1917]/75">
              GSM is grams per square metre of fabric. Higher means thicker, more opaque and more
              structured. For tees, around 180 is an everyday weight and 250 plus is what people
              call heavyweight.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-[#1c1917]/75">
              <li><strong>Events, giveaways, uniforms:</strong> the Core Tee.</li>
              <li><strong>Merch that should feel like retail:</strong> the Superior or Premium.</li>
              <li><strong>Winter and staff layers:</strong> the Core Hoodie or Crew.</li>
            </ul>
          </div>
          <Reveal className="self-center">
            <div className="space-y-5 rounded-2xl border border-[#1c1917]/20 bg-white/40 p-6">
              {ladder.map((s, i) => (
                <div key={s.handle}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`${label}`}>{s.name}</span>
                    <span className={`${mono.className} text-sm`}>{s.gsm} GSM</span>
                  </div>
                  <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-[#1c1917]/10">
                    <div
                      className={`h-full origin-left rounded-full transition-transform duration-700 ease-out group-data-[shown=false]/reveal:scale-x-0 ${
                        s.family === "fleece" ? "bg-[#8a7f6f]" : "bg-[#1c1917]"
                      }`}
                      style={{ width: `${(s.gsm! / maxGsm) * 100}%`, transitionDelay: `${0.15 + i * 0.1}s` }}
                    />
                  </div>
                </div>
              ))}
              <div className="tl-rule text-[#1c1917]" />
              <p className={`${mono.className} flex gap-4 text-[11px] text-[#1c1917]/60`}>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#1c1917]" /> Tee</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#8a7f6f]" /> Fleece</span>
              </p>
            </div>
          </Reveal>
        </section>
      ) : null}

      {/* TEE COMPARISON */}
      {tees.length > 1 ? (
        <section className={`${INK} text-[#efebe4]`}>
          <div className={`${container} py-16 small:py-24`}>
            <p className={`${label} text-[#efebe4]/55`}>Side by side</p>
            <h2 className={`${h2} mt-3`}>Core vs Superior vs Premium</h2>
            <div className="mt-10 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#efebe4]/25">
                    <th className={`${label} py-3 pr-4 text-[#efebe4]/50`} />
                    {tees.map((t) => (
                      <th key={t.handle} className={`${display.className} py-3 pr-4 text-xl font-bold`}>{t.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={mono.className}>
                  {[
                    ["Weight", (t: Style) => (t.gsm ? `${t.gsm} GSM` : "—")],
                    ["Fit", (t: Style) => t.fitLabel],
                    ["Sizes", (t: Style) => (t.sizes.length ? `${t.sizes[0]}–${t.sizes[t.sizes.length - 1]}` : "—")],
                    ["Colours", (t: Style) => `${t.colours.length}`],
                    ["Best for", (t: Style) => ({ "thread-lab-core-tee": "Volume, events, uniforms", "thread-lab-superior-tee": "Everyday merch", "thread-lab-premium-tee": "Big back prints, streetwear" } as Record<string, string>)[t.handle] ?? "—"],
                  ].map(([name, get]) => (
                    <tr key={name as string} className="border-b border-dashed border-[#efebe4]/20">
                      <th className={`${label} py-3 pr-4 font-semibold text-[#efebe4]/50`}>{name as string}</th>
                      {tees.map((t) => (
                        <td key={t.handle} className="py-3 pr-4 text-[#efebe4]/85">{(get as (t: Style) => string)(t)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {/* COLOUR WALL */}
      <section className={`${container} py-16 small:py-24`}>
        <p className={`${label} text-[#1c1917]/55`}>Fig. 3 — swatches</p>
        <h2 className={`${h2} mt-3`}>Every colour, every style</h2>
        <p className="mt-6 max-w-2xl text-[#1c1917]/70">
          A tight, neutral palette: blacks, whites and naturals, plus a washed black and a stone blue.
        </p>
        <div className="mt-10 space-y-8">
          {styles.filter((s) => s.colourShots.length).map((s) => (
            <div key={s.handle}>
              <p className={`${label} mb-3`}>{s.name}</p>
              <ul className="grid grid-cols-2 gap-3 phone:grid-cols-4 small:grid-cols-6">
                {s.colourShots.map((c, i) => (
                  <li key={c.src}>
                    <Reveal delay={(i % 6) * 0.05}>
                      <LocalizedClientLink href={`/products/${s.handle}`} className="block !text-[#1c1917]">
                        <div className="relative aspect-square overflow-hidden rounded-xl bg-white">
                          <Image
                            src={c.src}
                            alt={`Thread Lab ${s.name} in ${c.colour}`}
                            fill
                            sizes="(min-width: 1024px) 16vw, (min-width: 480px) 25vw, 50vw"
                            className="object-contain p-2"
                          />
                        </div>
                        <p className={`${mono.className} mt-2 text-xs`}>{c.colour}</p>
                      </LocalizedClientLink>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* PRINTING */}
      <section className="bg-white">
        <div className={`${container} py-16 small:py-24`}>
          <p className={`${label} text-[#1c1917]/55`}>Make it yours</p>
          <h2 className={`${h2} mt-3`}>Printing on Thread Lab</h2>
          <p className="mt-6 max-w-2xl text-[#1c1917]/70">
            Combed cotton gives a smooth, even surface, and the fleece is preshrunk. Every method we
            run works; which one suits depends on your artwork and how many you need.
          </p>
          <div className="mt-10 grid gap-5 small:grid-cols-3">
            {[
              {
                name: "Full-colour print",
                when: "From one piece",
                body: "A digital transfer pressed onto the garment. Photos, gradients and any number of colours. The way to test a design or run a small drop.",
              },
              {
                name: "Screen print",
                when: `From ${SCREEN_MIN_QUANTITY} pieces`,
                body: "Ink pushed through a screen, one colour at a time. A soft hand on heavier tees and the classic choice for bold graphics on a bigger run.",
                href: "/guides/screen-printing-cost",
                link: "Why screen printing has setup costs",
              },
              {
                name: "Embroidery",
                when: fleece.length ? "From one piece · best on fleece" : "From one piece",
                body: "Your logo stitched into the fabric. Sits especially well on the Core Hoodie and Crew, and on the heavier tees.",
              },
            ].map((m, i) => (
              <Reveal key={m.name} delay={i * 0.08} className="h-full rounded-2xl border border-[#1c1917]/15 bg-[#f7f5f0] p-6 small:p-8">
                <p className={`${label} text-[#1c1917]/55`}>{m.when}</p>
                <h3 className={`${display.className} mt-2 text-3xl font-bold leading-none`}>{m.name}</h3>
                <p className="mt-4 text-sm text-[#1c1917]/75">{m.body}</p>
                {m.href ? (
                  <LocalizedClientLink href={m.href} className="mt-4 inline-block text-sm font-semibold !text-[#1c1917] underline underline-offset-4">
                    {m.link}
                  </LocalizedClientLink>
                ) : null}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={`${container} py-16 small:py-24`}>
        <p className={`${label} text-[#1c1917]/55`}>Quick answers</p>
        <h2 className={`${h2} mt-3`}>Thread Lab FAQ</h2>
        <div className="mt-8 max-w-3xl border-t border-[#1c1917]/30">
          {faqs.map((f) => (
            <details key={f.q} className="group border-b border-[#1c1917]/30">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold">
                {f.q}
                <span aria-hidden className="shrink-0 text-2xl leading-none transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-5 text-[#1c1917]/70">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className={`${INK} text-[#efebe4]`}>
        <div className={`${container} py-20 text-center small:py-28`}>
          <Reveal>
            <p className={`${label} text-[#efebe4]/55`}>End of report</p>
            <h2 className={`${display.className} mt-4 text-5xl font-bold leading-[0.92] tracking-tight small:text-8xl`}>
              Your logo, <span className="text-[#efebe4]/45">their blank.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-[#efebe4]/75">
              Pick a style, drop your artwork on it in the customiser and see it before you order.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <LocalizedClientLink href="/brands/thread-lab" className={btnPaper}>
                Shop Thread Lab <Arrow />
              </LocalizedClientLink>
              <LocalizedClientLink href="/contact" className={`${btnLine} !text-[#efebe4] hover:!bg-white/10`}>
                Talk to us about a run
              </LocalizedClientLink>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
