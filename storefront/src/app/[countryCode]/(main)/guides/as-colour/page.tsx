import { Metadata } from "next"
import { Inter } from "next/font/google"
import Image from "next/image"
import type { HttpTypes } from "@medusajs/types"

import { getProductSummariesByHandle } from "@lib/data/products"
import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { SCREEN_MIN_QUANTITY } from "@modules/customizer/lib/scp-screen-print-pricing"
import TeeFinder, { type FinderTee } from "@modules/guides/as-colour/components/tee-finder"
import {
  asColourHandle,
  COLOUR_WALL_CODE,
  cutOf,
  FEATURED_CODES,
  fitClass,
  FLEECE_RANGES,
  NAME_DECODER,
  RANGE_TILES,
  TEE_CODES,
  TEE_LADDER_CODES,
  weightBand,
} from "@modules/guides/as-colour/data"
import Reveal from "@modules/guides/components/reveal"

// Look and feel follows ascolour.com.au on purpose: white space, a neutral
// grotesk in regular and medium weights, sentence-case headings that end in a
// full stop, hairline rules, square black buttons and muted, earthy accents.
//
// NO PRICING ON THIS PAGE. Weights, fits, colour counts, photos and product
// types are read live from the products (slim, variant-free fetch); what is
// featured lives in @modules/guides/as-colour/data.

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], display: "swap" })

const PATH = "/guides/as-colour"
const TITLE = "AS Colour Custom Printing Australia: The Range, Explained"
const DESCRIPTION =
  "AS Colour tees, hoodies and caps, custom printed or embroidered in Sydney. Staple vs Classic vs Heavy, fleece weights, colours and how to read the names."

const BRAND = "/images/brands"

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

type Summary = {
  handle: string
  title: string
  thumbnail: string | null
  gsm: number | null
  fitTip: string | null
  colours: string[]
  typeId: string | null
}

function summarise(p: HttpTypes.StoreProduct): Summary {
  const meta = (p.metadata ?? {}) as Record<string, unknown>
  const tips = ((meta.size_guide as { tips?: unknown } | undefined)?.tips ?? []) as unknown[]
  const fit = tips.find((t): t is string => typeof t === "string" && /^fit:/i.test(t))
  return {
    handle: p.handle ?? "",
    title: p.title ?? "",
    thumbnail: p.thumbnail ?? null,
    gsm: Number(meta.gsm) || null,
    fitTip: fit ? fit.replace(/^fit:\s*/i, "") : null,
    colours:
      p.options
        ?.find((o) => /colou?r/i.test(o.title ?? ""))
        ?.values?.map((v) => v.value)
        .filter((v): v is string => Boolean(v)) ?? [],
    typeId: p.type?.id ?? null,
  }
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())

/** AS Colour front shots are `…_COLOUR__hash.jpg`; backs are `…_COLOUR_BACK__…`. */
const frontShotFor = (urls: string[], colour: string): string | null => {
  const token = `_${colour.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")}__`
  return urls.find((u) => (u.split("/").pop() ?? "").toUpperCase().includes(token)) ?? null
}

// One-shot hero entrance. CSS only, so it is in the server HTML.
const CSS = `
@keyframes ac-rise { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
@keyframes ac-fade { from { opacity: 0; transform: scale(1.04) } to { opacity: 1; transform: none } }
.ac-rise { animation: ac-rise .8s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0s) }
.ac-fade { animation: ac-fade 1.4s cubic-bezier(.22,1,.36,1) both }
@media (prefers-reduced-motion: reduce) { .ac-rise, .ac-fade { animation: none } }
`

const INK = "#1a1a1a"
const container = "content-container"
const label = "text-xs uppercase tracking-[0.14em] text-[#6b6b66]"
const h2 = "text-4xl font-medium leading-[1.02] tracking-[-0.03em] small:text-6xl"
const lead = "mt-6 max-w-xl text-base leading-relaxed text-[#4d4d49] small:text-lg"
const rule = "border-[#e6e6e1]"
const btnDark =
  "inline-flex min-h-11 items-center bg-[#1a1a1a] px-7 py-3 text-sm font-medium !text-white transition hover:bg-[#3a3a36]"
const btnLight =
  "inline-flex min-h-11 items-center border border-[#1a1a1a] px-7 py-3 text-sm font-medium !text-[#1a1a1a] transition hover:bg-[#1a1a1a] hover:!text-white"
const textLink = "!text-[#1a1a1a] underline underline-offset-4 hover:no-underline"
const delay = (s: number) => ({ ["--d" as string]: `${s}s` })

export default async function AsColourGuidePage() {
  const [featured, wall] = await Promise.all([
    getProductSummariesByHandle({ handles: FEATURED_CODES.map(asColourHandle) }),
    getProductSummariesByHandle({ handles: [asColourHandle(COLOUR_WALL_CODE)], images: true }),
  ])
  const byHandle = new Map(featured.map((p) => [p.handle, summarise(p)]))
  const get = (code: string) => byHandle.get(asColourHandle(code))

  const ladder = TEE_LADDER_CODES.map(get)
    .filter((s): s is Summary => Boolean(s?.gsm))
    .sort((a, b) => (a.gsm ?? 0) - (b.gsm ?? 0))
  const maxTeeGsm = Math.max(1, ...ladder.map((s) => s.gsm ?? 0))

  const fleece = FLEECE_RANGES.map((r) => ({ ...r, hoodP: get(r.hood), crewP: get(r.crew) }))
    .filter((r) => r.hoodP?.gsm)
    .sort((a, b) => (a.hoodP?.gsm ?? 0) - (b.hoodP?.gsm ?? 0))
  const maxFleeceGsm = Math.max(1, ...fleece.map((r) => r.hoodP?.gsm ?? 0))

  const finderTees: FinderTee[] = TEE_CODES.map(get)
    .filter((s): s is Summary => Boolean(s))
    .map((s) => ({
      handle: s.handle,
      title: s.title,
      gsm: s.gsm,
      weight: weightBand(s.gsm),
      fit: fitClass(s.title, s.fitTip),
      cut: cutOf(s.title),
      colours: s.colours.length,
      image: s.thumbnail,
    }))

  const tiles = RANGE_TILES.map((t) => ({ ...t, p: get(t.code) })).filter((t) => t.p)

  const wallProduct = wall[0]
  const wallUrls = (wallProduct?.images ?? []).map((i) => i.url).filter(Boolean)
  const wallColours = (wallProduct ? summarise(wallProduct).colours : [])
    .map((c) => ({ name: titleCase(c), src: frontShotFor(wallUrls, c) }))
    .filter((c): c is { name: string; src: string } => Boolean(c.src))
    .sort((a, b) => a.name.localeCompare(b.name))
  const staple = get(COLOUR_WALL_CODE)
  const stapleColours = staple?.colours.length || wallColours.length

  const classic = get("5026")
  const heavy = get("5080")
  const stats = [
    stapleColours ? [`${stapleColours}`, "Colours in the Staple Tee"] : null,
    ladder.length ? [`${ladder[0].gsm}–${maxTeeGsm}`, "GSM across the tees"] : null,
    fleece.length ? [`${fleece[0].hoodP?.gsm}–${maxFleeceGsm}`, "GSM across the fleece"] : null,
    ["1", "Piece minimum"],
  ].filter((s): s is string[] => Boolean(s))

  const faqs = [
    {
      q: "Can you print on AS Colour garments?",
      a: "Yes. We decorate AS Colour tees, fleece, headwear, bags and more in our Sydney studio, with print or embroidery depending on the garment, and ship Australia-wide.",
    },
    {
      q: "What is the difference between the Staple, Classic and Heavy tee?",
      a:
        staple?.gsm && classic?.gsm && heavy?.gsm
          ? `Weight, mostly. The Staple Tee is ${staple.gsm} GSM, the Classic Tee is ${classic.gsm} GSM and the Heavy Tee is ${heavy.gsm} GSM. The heavier the tee, the more structured it hangs. The Heavy Tee is also cut more relaxed.`
          : "Weight, mostly. Staple is the mid weight, Classic is heavier, and Heavy is the heaviest and cut more relaxed.",
    },
    {
      q: "How many colours does the Staple Tee come in?",
      a: stapleColours
        ? `${stapleColours} at the moment. It is the widest colour range of any AS Colour style.`
        : "It has the widest colour range of any AS Colour style.",
    },
    {
      q: "Is there a minimum order?",
      a: `No. Full-colour prints and embroidery are available from one piece. Screen printing starts at ${SCREEN_MIN_QUANTITY} pieces.`,
    },
    {
      q: "Where do I find the size guide?",
      a: "On each product page. AS Colour publishes a size chart for every style, and it is shown with the fit under Size and fit.",
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
    <div className={`${inter.className} bg-white`} style={{ color: INK }}>
      <style>{CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }} />

      {/* HERO */}
      <header className={`grid border-b ${rule} small:min-h-[76vh] small:grid-cols-2`}>
        <div className="flex flex-col justify-end px-6 pb-12 pt-16 small:px-14 small:pb-20">
          <p className={`${label} ac-rise`}>Guide · Premium blanks</p>
          <h1
            className="ac-rise mt-5 text-5xl font-medium leading-[0.98] tracking-[-0.035em] small:text-7xl medium:text-8xl"
            style={delay(0.1)}
          >
            AS Colour, custom printed.
          </h1>
          <p className={`${lead} ac-rise`} style={delay(0.25)}>
            The blank range a lot of Australian labels are built on, decorated in our Sydney
            studio. Tees, fleece, headwear and more, printed or embroidered from a single piece.
          </p>
          <div className="ac-rise mt-9 flex flex-wrap items-center gap-4" style={delay(0.4)}>
            <a href="#range" className={btnDark}>
              See the range
            </a>
            <LocalizedClientLink href="/brands/as-colour" className={btnLight}>
              Shop AS Colour
            </LocalizedClientLink>
          </div>
        </div>
        <div className="relative min-h-[52vw] overflow-hidden bg-[#dcdad3] small:min-h-0">
          <Image
            src={`${BRAND}/as-colour-banner.png`}
            alt="Model wearing a pale blue AS Colour hood and track pants in an open landscape."
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="ac-fade object-cover"
          />
        </div>
      </header>

      {/* STATS */}
      <section className={`border-b ${rule}`}>
        <dl className={`${container} grid grid-cols-2 small:grid-cols-4`}>
          {stats.map(([value, name], i) => (
            <div key={name} className={`py-8 small:py-10 ${i ? `small:border-l small:pl-8 ${rule}` : ""}`}>
              <dd className="text-4xl font-medium tracking-[-0.03em] small:text-5xl">{value}</dd>
              <dt className={`${label} mt-2`}>{name}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* RANGE */}
      <section id="range" className="scroll-mt-24">
        <div className={`${container} py-20 small:py-28`}>
          <p className={label}>01</p>
          <h2 className={`${h2} mt-3`}>The range.</h2>
          <p className={lead}>
            AS Colour makes one thing: well-cut basics, in a lot of colours. Here is how the range
            breaks down, with a way into each part of it.
          </p>
          <div className="mt-12 grid gap-x-6 gap-y-12 phone:grid-cols-2 medium:grid-cols-3">
            {tiles.map((t, i) => (
              <Reveal key={t.label} delay={(i % 3) * 0.08}>
                <LocalizedClientLink
                  href={t.p?.typeId ? `/brands/as-colour?typeId=${t.p.typeId}` : "/brands/as-colour"}
                  className="group block !text-[#1a1a1a]"
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-[#f4f3f0]">
                    {t.p?.thumbnail ? (
                      <Image
                        src={t.p.thumbnail}
                        alt={`AS Colour ${t.p.title}`}
                        fill
                        sizes="(min-width: 1280px) 30vw, (min-width: 480px) 50vw, 100vw"
                        className="object-contain p-8 transition duration-700 group-hover:scale-[1.04]"
                      />
                    ) : null}
                  </div>
                  <h3 className="mt-4 text-2xl font-medium tracking-[-0.02em]">{t.label}.</h3>
                  <p className="mt-1 text-sm text-[#6b6b66]">{t.blurb}</p>
                  <span className="mt-3 inline-block text-sm underline underline-offset-4 group-hover:no-underline">
                    View all {t.label.toLowerCase()}
                  </span>
                </LocalizedClientLink>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* TEES */}
      <section className="bg-[#f4f3f0]">
        <div className={`${container} py-20 small:py-28`}>
          <div className="grid gap-12 small:grid-cols-[1fr_1.25fr]">
            <div>
              <p className={label}>02</p>
              <h2 className={`${h2} mt-3`}>Tees, decoded.</h2>
              <p className={lead}>
                The tee names are really a weight scale. Each range is the same idea in a heavier
                cloth: Basic is the lightest, Staple is the all-rounder, and it climbs from there to
                Heavy. Pick the weight first, then the fit.
              </p>
              <p className="mt-4 max-w-xl text-sm text-[#6b6b66]">
                GSM is grams per square metre. A higher number means a thicker, more structured tee.
              </p>
            </div>
            <Reveal>
              <ol className={`border-t ${rule}`}>
                {ladder.map((s, i) => (
                  <li key={s.handle} className={`border-b ${rule}`}>
                    <LocalizedClientLink
                      href={`/products/${s.handle}`}
                      className="group grid min-h-11 grid-cols-[1fr_auto] items-baseline gap-x-6 py-5 !text-[#1a1a1a]"
                    >
                      <span className="text-2xl font-medium tracking-[-0.02em] group-hover:underline group-hover:underline-offset-4">
                        {s.title}
                      </span>
                      <span className="text-2xl font-medium tabular-nums tracking-[-0.02em]">
                        {s.gsm} <span className="text-sm font-normal text-[#6b6b66]">GSM</span>
                      </span>
                      <span className="col-span-2 mt-3 block h-px bg-[#d9d9d4]">
                        <span
                          className="block h-[3px] origin-left -translate-y-px bg-[#6b705c] transition-transform duration-700 ease-out group-data-[shown=false]/reveal:scale-x-0"
                          style={{
                            width: `${((s.gsm ?? 0) / maxTeeGsm) * 100}%`,
                            transitionDelay: `${0.1 + i * 0.08}s`,
                          }}
                        />
                      </span>
                      <span className="col-span-2 mt-3 text-sm text-[#6b6b66]">
                        {[s.fitTip, `${s.colours.length} colours`].filter(Boolean).join(" · ")}
                      </span>
                    </LocalizedClientLink>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>

          <div className="mt-20">
            <h3 className="text-2xl font-medium tracking-[-0.02em] small:text-3xl">Find a tee.</h3>
            <p className="mt-2 max-w-xl text-[#6b6b66]">
              Mens and womens, across the weights and cuts. Narrow it down.
            </p>
            <Reveal className="mt-6">
              <TeeFinder tees={finderTees} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* FLEECE */}
      <section>
        <div className={`${container} grid gap-12 py-20 small:grid-cols-2 small:py-28`}>
          <Reveal className="relative aspect-[4/5] overflow-hidden bg-[#2a2a2a] small:aspect-auto small:min-h-[640px]">
            <Image
              src={`${BRAND}/as-colour/ugc/ugc-5.png`}
              alt="Model in a charcoal AS Colour hood and a yellow trucker cap against a dark backdrop."
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </Reveal>
          <div className="self-center">
            <p className={label}>03</p>
            <h2 className={`${h2} mt-3`}>Fleece.</h2>
            <p className={lead}>
              Hoods and crews follow the same logic as the tees. Five ranges, each a step heavier,
              and each one comes as a pullover hood and a crew.
            </p>
            <Reveal>
              <ol className={`mt-10 border-t ${rule}`}>
                {fleece.map((r, i) => (
                  <li key={r.name} className={`grid grid-cols-[1fr_auto] items-baseline gap-x-6 border-b py-5 ${rule}`}>
                    <span className="text-2xl font-medium tracking-[-0.02em]">{r.name}</span>
                    <span className="text-2xl font-medium tabular-nums tracking-[-0.02em]">
                      {r.hoodP?.gsm} <span className="text-sm font-normal text-[#6b6b66]">GSM</span>
                    </span>
                    <span className="col-span-2 mt-3 block h-px bg-[#d9d9d4]">
                      <span
                        className="block h-[3px] origin-left -translate-y-px bg-[#5c6b73] transition-transform duration-700 ease-out group-data-[shown=false]/reveal:scale-x-0"
                        style={{
                          width: `${((r.hoodP?.gsm ?? 0) / maxFleeceGsm) * 100}%`,
                          transitionDelay: `${0.1 + i * 0.08}s`,
                        }}
                      />
                    </span>
                    <span className="col-span-2 mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-[#6b6b66]">
                      <span>{r.note}</span>
                      {r.hoodP ? (
                        <LocalizedClientLink href={`/products/${r.hoodP.handle}`} className={`${textLink} inline-flex min-h-11 items-center`}>
                          Hood
                        </LocalizedClientLink>
                      ) : null}
                      {r.crewP ? (
                        <LocalizedClientLink href={`/products/${r.crewP.handle}`} className={`${textLink} inline-flex min-h-11 items-center`}>
                          Crew
                        </LocalizedClientLink>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </div>
      </section>

      {/* COLOUR */}
      {wallColours.length ? (
        <section className="bg-[#f4f3f0]">
          <div className={`${container} py-20 small:py-28`}>
            <p className={label}>04</p>
            <h2 className={`${h2} mt-3`}>{wallColours.length} colours.</h2>
            <p className={lead}>
              Colour is in the name for a reason. This is one style, the Staple Tee, in every
              colour it comes in. Many of the same shades run through the rest of the range, so a
              tee, a hood and a cap can often be matched.
            </p>
            {/* One Reveal for the whole wall: 76 observers would be wasteful. */}
            <Reveal className="mt-12">
              <ul className="grid grid-cols-3 gap-x-3 gap-y-6 phone:grid-cols-4 tablet:grid-cols-6 medium:grid-cols-10">
                {wallColours.map((c) => (
                  <li key={c.name}>
                    <div className="relative aspect-[4/5] bg-white">
                      <Image
                        src={c.src}
                        alt={`AS Colour Staple Tee in ${c.name}`}
                        fill
                        sizes="(min-width: 1280px) 9vw, (min-width: 768px) 16vw, 30vw"
                        className="object-contain p-1.5"
                      />
                    </div>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.1em] text-[#6b6b66]">{c.name}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
            <div className="mt-12">
              <LocalizedClientLink href={`/products/${asColourHandle(COLOUR_WALL_CODE)}`} className={btnDark}>
                Customise the Staple Tee
              </LocalizedClientLink>
            </div>
          </div>
        </section>
      ) : null}

      {/* NAME DECODER */}
      <section>
        <div className={`${container} grid gap-12 py-20 small:grid-cols-[1fr_1.4fr] small:py-28`}>
          <div>
            <p className={label}>05</p>
            <h2 className={`${h2} mt-3`}>Reading the name.</h2>
            <p className={lead}>
              Every style name is built from the same few words. Once you know them, the whole
              catalogue reads at a glance.
            </p>
          </div>
          <Reveal>
            <dl className={`grid border-t ${rule} phone:grid-cols-2 phone:gap-x-10`}>
              {NAME_DECODER.map((d) => (
                <div key={d.term} className={`border-b py-5 ${rule}`}>
                  <dt className="text-lg font-medium tracking-[-0.01em]">{d.term}</dt>
                  <dd className="mt-1 text-sm text-[#6b6b66]">{d.meaning}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* PHOTO STRIP */}
      <section aria-label="AS Colour worn" className="grid tablet:grid-cols-3">
        {[
          { src: "ugc-1.png", alt: "Model in a mint AS Colour crop tee and grey track pants." },
          { src: "ugc-3.png", alt: "Model in a cream AS Colour half zip crew." },
          { src: "ugc-6.png", alt: "Model in a white AS Colour hood and a pink beanie." },
        ].map((photo, i) => (
          <Reveal key={photo.src} delay={i * 0.08} className="relative aspect-[4/5] overflow-hidden bg-[#2a2a2a]">
            <Image
              src={`${BRAND}/as-colour/ugc/${photo.src}`}
              alt={photo.alt}
              fill
              sizes="(min-width: 768px) 33vw, 100vw"
              className="object-cover"
            />
          </Reveal>
        ))}
      </section>

      {/* DECORATION */}
      <section>
        <div className={`${container} py-20 small:py-28`}>
          <p className={label}>06</p>
          <h2 className={`${h2} mt-3`}>Decoration.</h2>
          <p className={lead}>
            A good blank deserves a clean finish. Three methods, each suited to a different job.
          </p>
          <div className={`mt-12 grid border-t ${rule} small:grid-cols-3`}>
            {[
              {
                name: "Full-colour print",
                when: "From one piece",
                body: "A digital transfer for photos, gradients and detailed artwork. The way to run a small drop or test a design.",
              },
              {
                name: "Screen print",
                when: `From ${SCREEN_MIN_QUANTITY} pieces`,
                body: "Solid colours with a soft, light feel. The classic finish for a bigger run of tees or hoods.",
              },
              {
                name: "Embroidery",
                when: "From one piece",
                body: "Stitched logos for caps, fleece, polos and jackets. The premium option, and the hardest wearing.",
              },
            ].map((m, i) => (
              <Reveal
                key={m.name}
                delay={i * 0.08}
                className={`border-b py-8 small:border-b-0 small:py-10 ${rule} ${i ? "small:border-l small:pl-10" : ""} small:pr-10`}
              >
                <p className={label}>{m.when}</p>
                <h3 className="mt-2 text-2xl font-medium tracking-[-0.02em]">{m.name}.</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#4d4d49]">{m.body}</p>
              </Reveal>
            ))}
          </div>
          <p className="mt-8 text-sm text-[#6b6b66]">
            Not sure which?{" "}
            <LocalizedClientLink href="/guides/dtf-vs-screen-printing-vs-embroidery" className={textLink}>
              Compare the three methods
            </LocalizedClientLink>
            .
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[#f4f3f0]">
        <div className={`${container} grid gap-12 py-20 small:grid-cols-[1fr_1.4fr] small:py-28`}>
          <div>
            <p className={label}>07</p>
            <h2 className={`${h2} mt-3`}>Questions.</h2>
          </div>
          <div className="border-t border-[#d9d9d4]">
            {faqs.map((f) => (
              <details key={f.q} className="group border-b border-[#d9d9d4]">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-medium tracking-[-0.01em]">
                  {f.q}
                  <span aria-hidden className="shrink-0 text-2xl font-normal leading-none transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-6 text-[#4d4d49]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1a1a1a] text-white">
        <div className={`${container} py-24 small:py-32`}>
          <Reveal>
            <h2 className="max-w-4xl text-5xl font-medium leading-[0.98] tracking-[-0.035em] text-white small:text-7xl">
              Start with a good blank.
            </h2>
            <p className="mt-6 max-w-xl text-white/70 small:text-lg">
              Pick a style, add your artwork in the customiser and see it on the garment before
              you order.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <LocalizedClientLink
                href="/brands/as-colour"
                className="inline-flex min-h-11 items-center bg-white px-7 py-3 text-sm font-medium !text-[#1a1a1a] transition hover:bg-[#e6e6e1]"
              >
                Shop AS Colour
              </LocalizedClientLink>
              <LocalizedClientLink
                href="/contact"
                className="inline-flex min-h-11 items-center border border-white/40 px-7 py-3 text-sm font-medium !text-white transition hover:border-white"
              >
                Talk to us about a range
              </LocalizedClientLink>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
