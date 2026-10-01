import { Metadata } from "next"
import { Big_Shoulders } from "next/font/google"
import Image from "next/image"
import type { HttpTypes } from "@medusajs/types"

import { getProductsByHandle } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { SCREEN_MIN_QUANTITY } from "@modules/customizer/lib/scp-screen-print-pricing"
import Reveal from "@modules/guides/components/reveal"
import FitFinder from "@modules/guides/shaka-wear/components/fit-finder"
import { SHAKA_STYLES, type ShakaStyle } from "@modules/guides/shaka-wear/styles"

// Look and feel follows shakawear.com on purpose: black and white, heavy
// condensed uppercase display type, outlined headlines, square corners, moody
// video. The audience is streetwear, not corporate uniforms — keep copy short.
//
// NO PRICING ON THIS PAGE (see the screen-printing guide for the rule).
// Colours, sizes, photos, size charts and GSM are read live from the six
// products; only the editorial lives in @modules/guides/shaka-wear/styles.

const display = Big_Shoulders({ subsets: ["latin"], weight: ["800", "900"], display: "swap" })

const PATH = "/guides/shaka-wear"
const TITLE = "Shaka Wear Australia: Max Heavyweight Tees, Fit & Size Guide"
const DESCRIPTION =
  "Shaka Wear Max Heavyweight tees in Australia: all six cuts compared, what 7.5oz means in GSM, garment dye explained, and size charts. Printed in Sydney from one piece."

const HERO_VIDEO = "/images/brands/shaka-wear-hero.mp4"
const HERO_POSTER = "/images/brands/shaka-wear-hero-poster.jpg"

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

type SizeGuide = { images: string[]; tips: string[] }

type Style = ShakaStyle & {
  front: string | null
  model: string | null
  colours: string[]
  sizes: string[]
  sizeGuide: SizeGuide | null
  /** Front flat-lay per colour, for the swatch strip. */
  colourShots: { colour: string; src: string }[]
}

const optionValues = (product: HttpTypes.StoreProduct, title: string): string[] =>
  product.options
    ?.find((o) => o.title?.toLowerCase() === title)
    ?.values?.map((v) => v.value)
    .filter((v): v is string => Boolean(v)) ?? []

/** `…/10M-002_Slate_Blue_Front.jpg` → "Slate Blue" */
const colourFromUrl = (url: string): string =>
  (url.split("/").pop() ?? "")
    .replace(/^[^_]+_/, "")
    .replace(/_Front\.[a-z]+$/i, "")
    .replace(/_/g, " ")

function mergeLive(style: ShakaStyle, product?: HttpTypes.StoreProduct): Style {
  const urls = (product?.images ?? []).map((i) => i.url).filter(Boolean)
  const guide = (product?.metadata as Record<string, unknown> | null)?.size_guide as
    | Partial<SizeGuide>
    | undefined
  return {
    ...style,
    front: product?.thumbnail ?? urls.find((u) => /_Front\./.test(u)) ?? null,
    model: urls.find((u) => /_Model/.test(u)) ?? null,
    colours: product ? optionValues(product, "colour") : [],
    sizes: product ? optionValues(product, "size") : [],
    sizeGuide:
      guide && Array.isArray(guide.images) && Array.isArray(guide.tips)
        ? { images: guide.images, tips: guide.tips }
        : null,
    colourShots: urls
      .filter((u) => /_Front\./.test(u))
      .map((src) => ({ colour: colourFromUrl(src), src })),
  }
}

const TICKER = [
  "7.5 oz",
  "255 GSM",
  "100% USA cotton",
  "Six cuts",
  "No minimum",
  "Printed in Sydney",
  "Shipped Australia-wide",
]

// Reference weights are typical industry figures, not specific products.
const WEIGHTS = [
  { label: "Typical lightweight tee", gsm: 150 },
  { label: "Typical everyday tee", gsm: 180 },
  { label: "Shaka Wear Max Heavyweight", gsm: 255, hero: true },
]

const CSS = `
.sw-outline { color: transparent; -webkit-text-stroke: 1.5px #fff }
@keyframes sw-marquee { to { transform: translateX(-50%) } }
.sw-marquee { display: flex; width: max-content; animation: sw-marquee 32s linear infinite }
@keyframes sw-rise { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: none } }
.sw-rise { animation: sw-rise .7s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0s) }
@media (prefers-reduced-motion: reduce) { .sw-marquee, .sw-rise { animation: none } }
`

const label = "text-xs font-bold uppercase tracking-[0.14em]"
const h2 = `${display.className} text-5xl uppercase leading-[0.9] tracking-tight small:text-7xl`
const container = "content-container"
const btnLight =
  "group inline-flex min-h-11 items-center gap-2 border border-white bg-white px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] !text-black transition hover:bg-transparent hover:!text-white"
const btnGhost =
  "inline-flex min-h-11 items-center gap-2 border border-white/40 px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] !text-white transition hover:border-white"
const btnDark =
  "inline-flex min-h-11 items-center gap-2 border border-black bg-black px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] !text-white transition hover:bg-white hover:!text-black"

const Arrow = () => (
  <span aria-hidden className="transition-transform group-hover:translate-x-1">
    →
  </span>
)

export default async function ShakaWearGuidePage({ params }: Props) {
  const { countryCode } = await params
  const region = await getRegion(countryCode)
  const products = region
    ? await getProductsByHandle({ handles: SHAKA_STYLES.map((s) => s.handle), regionId: region.id })
    : []
  const byHandle = new Map(products.map((p) => [p.handle, p]))
  const styles = SHAKA_STYLES.map((s) => mergeLive(s, byHandle.get(s.handle)))

  const gsm = Number((products[0]?.metadata as Record<string, unknown> | null)?.gsm) || 255
  const garmentDye = styles.find((s) => s.handle === "shaka-wear-max-heavyweight-garment-dye-tee")
  const maxGsm = Math.max(...WEIGHTS.map((w) => w.gsm))

  const faqs = [
    {
      q: "Can you get Shaka Wear in Australia?",
      a: `Yes. SC Prints carries six Shaka Wear Max Heavyweight styles, printed or embroidered in Sydney and shipped Australia-wide. You can order a single piece.`,
    },
    {
      q: "What is 7.5oz in GSM?",
      a: `7.5 ounces per square yard is about ${gsm} grams per square metre. A typical everyday tee is closer to 180 GSM, so Max Heavyweight is noticeably thicker and holds its shape.`,
    },
    {
      q: "What is Shaka Wear Max Heavyweight made of?",
      a: "100% USA cotton, in a dense heavyweight knit.",
    },
    {
      q: "How does Shaka Wear sizing run?",
      a: "It depends on the cut. The Max Heavyweight Tee and Long Sleeve are true to size. The Oversized Tee is cut wide and short, so take your usual size for a relaxed fit. The Drop Shoulder runs big and is usually sized down. Every style has its own size chart on this page.",
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
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }

  return (
    <div className="bg-[#0a0a0a]">
      <style>{CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }} />

      {/* HERO — poster paints first; the loop is decorative and skipped for reduced motion. */}
      <header className="relative isolate flex min-h-[78vh] items-end overflow-hidden bg-black text-white">
        <Image src={HERO_POSTER} alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
        <video
          className="absolute inset-0 -z-10 h-full w-full object-cover motion-reduce:hidden"
          src={HERO_VIDEO}
          poster={HERO_POSTER}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/60 to-black/30" />
        <div className={`${container} pb-14 pt-32 small:pb-20`}>
          <p className={`${label} sw-rise text-white/70`}>Guide · Streetwear essentials</p>
          <h1 className={`${display.className} mt-4 uppercase leading-[0.85] tracking-tight`}>
            <span className="sw-rise mb-3 block text-4xl small:text-6xl" style={{ ["--d" as string]: "0.1s" }}>
              Shaka Wear in Australia
            </span>
            <span
              className="sw-rise sw-outline block text-[17vw] small:text-[11rem]"
              style={{ ["--d" as string]: "0.25s" }}
            >
              Max Heavyweight
            </span>
          </h1>
          <p
            className="sw-rise mt-6 max-w-xl text-base text-white/80 small:text-lg"
            style={{ ["--d" as string]: "0.45s" }}
          >
            The LA heavyweight blank, on the ground in Sydney. Six cuts, one {gsm} GSM fabric, printed
            or embroidered with your artwork from a single piece.
          </p>
          <div className="sw-rise mt-8 flex flex-wrap gap-3" style={{ ["--d" as string]: "0.6s" }}>
            <a href="#lineup" className={btnLight}>
              See the lineup <Arrow />
            </a>
            <LocalizedClientLink href="/brands/shaka-wear" className={btnGhost}>
              Shop Shaka Wear
            </LocalizedClientLink>
          </div>
        </div>
      </header>

      {/* TICKER */}
      <div className="overflow-hidden border-y border-white/20 bg-white py-3 text-black" aria-hidden>
        <div className="sw-marquee">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0">
              {TICKER.map((t) => (
                <li
                  key={t}
                  className={`${display.className} flex items-center whitespace-nowrap px-6 text-2xl uppercase`}
                >
                  {t}
                  <span className="pl-12 text-black/30">✦</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {/* INTRO + STATS */}
      <section className="bg-[#0a0a0a] text-white">
        <div className={`${container} grid gap-10 py-16 small:grid-cols-[1.1fr_1fr] small:py-24`}>
          <div>
            <p className={`${label} text-white/60`}>What it is</p>
            <h2 className={`${h2} mt-3`}>Heavy on purpose</h2>
            <p className="mt-6 max-w-xl text-white/75">
              Shaka Wear is LA-created streetwear built around the basics. Max Heavyweight is the
              tee the label is known for: thick cotton, a boxy body and a lycra-ribbed collar. It is
              a go-to blank for brands, bands and crews who want merch that feels like retail.
            </p>
            <p className="mt-4 max-w-xl text-white/75">
              It is not widely stocked in Australia. We carry six cuts and decorate them in our
              Sydney studio, so you get the real thing without importing it yourself.
            </p>
          </div>
          <dl className="grid grid-cols-2 self-end border-l border-t border-white/20">
            {[
              ["7.5 oz", "Fabric weight"],
              [`${gsm}`, "GSM"],
              ["100%", "USA cotton"],
              [`${styles.length}`, "Cuts in the range"],
            ].map(([value, name], i) => (
              <Reveal key={name} delay={i * 0.08} className="border-b border-r border-white/20 p-6">
                <dd className={`${display.className} text-6xl uppercase leading-none small:text-7xl`}>
                  {value}
                </dd>
                <dt className={`${label} mt-2 text-white/60`}>{name}</dt>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* LINEUP */}
      <section id="lineup" className="scroll-mt-24 bg-white text-black">
        <div className={`${container} py-16 small:py-24`}>
          <p className={`${label} text-black/60`}>The lineup</p>
          <h2 className={`${h2} mt-3`}>Six cuts, one fabric</h2>
          <p className="mt-6 max-w-2xl text-black/70">
            Same {gsm} GSM cotton across the range. What changes is the shape and the finish.
          </p>
          <div className="mt-10 grid gap-px border border-black bg-black tablet:grid-cols-2 medium:grid-cols-3">
            {styles.map((s, i) => (
              <Reveal key={s.handle} delay={(i % 3) * 0.08} className="h-full bg-white">
                <LocalizedClientLink
                  href={`/products/${s.handle}`}
                  className="group flex h-full flex-col !text-black"
                >
                  <div className="relative aspect-square overflow-hidden border-b border-black bg-white">
                    {s.front ? (
                      <Image
                        src={s.front}
                        alt={`Shaka Wear ${s.name}, front`}
                        fill
                        sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                        className="object-contain p-6 transition-opacity duration-300 group-hover:opacity-0"
                      />
                    ) : null}
                    {s.model ? (
                      <Image
                        src={s.model}
                        alt={`Shaka Wear ${s.name} worn by a model`}
                        fill
                        sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                        className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      />
                    ) : null}
                    <span className={`${label} absolute left-3 top-3 bg-black px-2 py-1 !text-white`}>
                      {s.fitLabel}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <p className={`${label} text-black/50`}>{s.code}</p>
                    <h3 className={`${display.className} mt-1 text-4xl uppercase leading-none`}>
                      {s.name}
                    </h3>
                    <p className="mt-3 text-sm text-black/70">{s.take}</p>
                    <dl className="mt-4 space-y-1 text-sm">
                      {s.colours.length ? (
                        <div className="flex gap-2">
                          <dt className="shrink-0 font-semibold">{s.colours.length} colours</dt>
                          <dd className="text-black/60">{s.colours.join(", ")}</dd>
                        </div>
                      ) : null}
                      {s.sizes.length ? (
                        <div className="flex gap-2">
                          <dt className="shrink-0 font-semibold">Sizes</dt>
                          <dd className="text-black/60">
                            {s.sizes[0]} to {s.sizes[s.sizes.length - 1]}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <span className={`${label} mt-auto flex items-center gap-2 pt-6`}>
                      Customise this tee <Arrow />
                    </span>
                  </div>
                </LocalizedClientLink>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FIT FINDER */}
      <section className="bg-[#0a0a0a] text-white">
        <div className={`${container} py-16 small:py-24`}>
          <p className={`${label} text-white/60`}>Fit finder</p>
          <h2 className={`${h2} mt-3`}>
            Which one <span className="sw-outline">is yours?</span>
          </h2>
          <p className="mt-6 max-w-2xl text-white/75">
            Pick how you want it to sit and how you want it to look. We will narrow the six down.
          </p>
          <Reveal className="mt-8">
            <FitFinder
              displayClassName={display.className}
              styles={styles.map((s) => ({
                handle: s.handle,
                code: s.code,
                name: s.name,
                cut: s.cut,
                finish: s.finish,
                sleeve: s.sleeve,
                fitLabel: s.fitLabel,
                take: s.take,
                image: s.front,
              }))}
            />
          </Reveal>
        </div>
      </section>

      {/* WEIGHT */}
      <section className="bg-white text-black">
        <div className={`${container} grid gap-10 py-16 small:grid-cols-2 small:py-24`}>
          <div>
            <p className={`${label} text-black/60`}>The weight</p>
            <h2 className={`${h2} mt-3`}>What 7.5 oz means</h2>
            <p className="mt-6 max-w-xl text-black/70">
              Fabric weight is how much a square yard of the cloth weighs. 7.5 ounces works out to
              about {gsm} grams per square metre, the figure you will see on Australian spec sheets.
            </p>
            <p className="mt-4 max-w-xl text-black/70">
              In the hand that means a tee that hangs straight instead of clinging, holds its boxy
              shape, and is not see-through in white. It also gives a print a
              flat, dense surface to sit on.
            </p>
          </div>
          <Reveal className="self-center">
            <div className="space-y-5 border border-black p-6">
              {WEIGHTS.map((w, i) => (
                <div key={w.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`${label} ${w.hero ? "" : "text-black/60"}`}>{w.label}</span>
                    <span className={`${display.className} text-2xl`}>
                      {w.hero ? "" : "~"}
                      {w.gsm} GSM
                    </span>
                  </div>
                  <div className="mt-1.5 h-4 bg-zinc-100">
                    <div
                      className={`h-full origin-left transition-transform duration-700 ease-out group-data-[shown=false]/reveal:scale-x-0 ${
                        w.hero ? "bg-black" : "bg-zinc-400"
                      }`}
                      style={{
                        width: `${(w.gsm / maxGsm) * 100}%`,
                        transitionDelay: `${0.15 + i * 0.12}s`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-black/50">
                Lightweight and everyday figures are typical for the category, for comparison only.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* GARMENT DYE */}
      <section className="bg-[#0a0a0a] text-white">
        <div className={`${container} py-16 small:py-24`}>
          <div className="grid gap-10 small:grid-cols-2">
            <div>
              <p className={`${label} text-white/60`}>The finish</p>
              <h2 className={`${h2} mt-3`}>
                Garment dye, <span className="sw-outline">explained</span>
              </h2>
            </div>
            <div className="space-y-4 self-end text-white/75">
              <p>
                Most tees are sewn from fabric that was dyed on the roll. A garment-dyed tee is
                sewn first, then dyed and washed as a finished shirt.
              </p>
              <p>
                That is where the faded, already-worn colour comes from. The dye settles
                differently around the seams and collar, so no two pieces are exactly alike. That
                variation is the point, not a fault. Shaka Wear describes its garment-dyed tees as
                shrink-free washed.
              </p>
            </div>
          </div>
          {garmentDye?.colourShots.length ? (
            <ul className="mt-10 grid grid-cols-2 gap-px border border-white/20 bg-white/20 phone:grid-cols-4 small:grid-cols-8">
              {garmentDye.colourShots.map((c, i) => (
                <li key={c.src} className="bg-[#0a0a0a]">
                  <Reveal delay={(i % 8) * 0.05}>
                    <div className="relative aspect-square bg-white">
                      <Image
                        src={c.src}
                        alt={`Shaka Wear Garment Dye Tee in ${c.colour}`}
                        fill
                        sizes="(min-width: 1024px) 12vw, (min-width: 480px) 25vw, 50vw"
                        className="object-contain p-2"
                      />
                    </div>
                    <p className={`${label} px-2 py-3 text-center`}>{c.colour}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {/* SIZE & FIT */}
      <section className="bg-white text-black">
        <div className={`${container} py-16 small:py-24`}>
          <p className={`${label} text-black/60`}>Size and fit</p>
          <h2 className={`${h2} mt-3`}>How each cut runs</h2>
          <p className="mt-6 max-w-2xl text-black/70">
            Every cut has its own measurements. Open a style for the fit notes and the size chart.
          </p>
          <div className="mt-8 border-t border-black">
            {styles.map((s, i) => (
              <details key={s.handle} className="group border-b border-black" open={i === 0}>
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4">
                  <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className={`${display.className} text-3xl uppercase leading-none`}>
                      {s.name}
                    </span>
                    <span className={`${label} text-black/50`}>{s.fitLabel}</span>
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 text-2xl leading-none transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="grid gap-8 pb-8 small:grid-cols-[1fr_1.4fr]">
                  <ul className="space-y-2 text-sm text-black/75">
                    {(s.sizeGuide?.tips ?? [s.take]).map((tip) => (
                      <li key={tip} className="flex gap-3">
                        <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 bg-black" />
                        {tip}
                      </li>
                    ))}
                    <li className="pt-3">
                      <LocalizedClientLink href={`/products/${s.handle}`} className={btnDark}>
                        Customise the {s.name}
                      </LocalizedClientLink>
                    </li>
                  </ul>
                  <div className="space-y-4">
                    {s.sizeGuide?.images.map((src) => (
                      // Chart dimensions vary per supplier file, so a plain lazy <img> sizes itself.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={src}
                        src={src}
                        alt={`Shaka Wear ${s.name} size chart`}
                        loading="lazy"
                        className="w-full border border-black/10"
                      />
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* PRINTING */}
      <section className="bg-[#0a0a0a] text-white">
        <div className={`${container} py-16 small:py-24`}>
          <p className={`${label} text-white/60`}>Make it yours</p>
          <h2 className={`${h2} mt-3`}>
            Printing on <span className="sw-outline">Shaka Wear</span>
          </h2>
          <p className="mt-6 max-w-2xl text-white/75">
            All-cotton heavyweight takes every method we run. Which one suits depends on your
            artwork and how many you need.
          </p>
          <div className="mt-10 grid gap-px border border-white/20 bg-white/20 small:grid-cols-3">
            {[
              {
                name: "Full-colour print",
                when: "From one piece",
                body: "A digital transfer pressed onto the tee. Handles photos, gradients and as many colours as your artwork has. The way to test a design or run a small drop.",
              },
              {
                name: "Screen print",
                when: `From ${SCREEN_MIN_QUANTITY} pieces`,
                body: "Ink pushed through a screen, one colour at a time. Soft, light feel and the classic choice for bold one to three colour graphics on a bigger run.",
                href: "/guides/screen-printing-cost",
                link: "Why screen printing has setup costs",
              },
              {
                name: "Embroidery",
                when: "From one piece",
                body: "Your logo stitched into the fabric. Heavyweight cotton holds stitching well, so a small chest logo tends to sit flat.",
              },
            ].map((m, i) => (
              <Reveal key={m.name} delay={i * 0.08} className="h-full bg-[#0a0a0a] p-6 small:p-8">
                <p className={`${label} text-white/60`}>{m.when}</p>
                <h3 className={`${display.className} mt-2 text-4xl uppercase leading-none`}>{m.name}</h3>
                <p className="mt-4 text-sm text-white/75">{m.body}</p>
                {m.href ? (
                  <LocalizedClientLink
                    href={m.href}
                    className="mt-4 inline-block text-sm font-semibold !text-white underline underline-offset-4"
                  >
                    {m.link}
                  </LocalizedClientLink>
                ) : null}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white text-black">
        <div className={`${container} py-16 small:py-24`}>
          <p className={`${label} text-black/60`}>Quick answers</p>
          <h2 className={`${h2} mt-3`}>Shaka Wear FAQ</h2>
          <div className="mt-8 max-w-3xl border-t border-black">
            {faqs.map((f) => (
              <details key={f.q} className="group border-b border-black">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold">
                  {f.q}
                  <span
                    aria-hidden
                    className="shrink-0 text-2xl leading-none transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-5 text-black/70">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0a0a0a] text-white">
        <div className={`${container} py-20 text-center small:py-28`}>
          <Reveal>
            <h2 className={`${display.className} text-6xl uppercase leading-[0.85] tracking-tight small:text-9xl`}>
              Put your name <span className="sw-outline block">on it</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-white/75">
              Pick a cut, drop your artwork on it in the customiser and see it before you order.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <LocalizedClientLink href="/brands/shaka-wear" className={btnLight}>
                Shop Shaka Wear <Arrow />
              </LocalizedClientLink>
              <LocalizedClientLink href="/contact" className={btnGhost}>
                Talk to us about a drop
              </LocalizedClientLink>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
