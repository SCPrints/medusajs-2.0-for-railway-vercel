import { Metadata } from "next"
import localFont from "next/font/local"
import Image from "next/image"
import type { HttpTypes } from "@medusajs/types"

import { getProductSummariesByHandle } from "@lib/data/products"
import { safeJsonLd } from "@lib/util/json-ld"
import { buildAbsoluteUrl, SEO } from "@lib/util/seo"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { SCREEN_MIN_QUANTITY } from "@modules/customizer/lib/scp-screen-print-pricing"
import Reveal from "@modules/guides/components/reveal"
import {
  ALL_HANDLES,
  COLOUR_WALL_HANDLE,
  FLEECE_LADDER,
  HERO_HANDLES,
  HI_VIS_PICKS,
  LABELS,
  NAME_DECODER,
  POLO_LADDER,
  RANGE_TILES,
} from "@modules/guides/jbs-wear/data"

// Look and feel: a site spec sheet. Deep navy and a safety-amber accent nod to
// JB's own navy and gold, but the type (condensed industrial caps), the
// reflective-tape bands and the style-code chips are ours — this is SC Prints
// talking about the range, not a copy of jbswear.com.au.
//
// NO PRICING ON THIS PAGE. Weights, colours, photos and types are read live
// from the products (slim, price-free fetch); what is featured lives in
// @modules/guides/jbs-wear/data.

const display = localFont({ src: [{ path: "../../../../../fonts/barlow-condensed-600-normal.woff2", weight: "600", style: "normal" }, { path: "../../../../../fonts/barlow-condensed-800-normal.woff2", weight: "800", style: "normal" }], display: "swap" })

const PATH = "/guides/jbs-wear"
const TITLE = "JB's Wear Custom Printing Australia: Polos, Hi-Vis & Workwear"
const DESCRIPTION =
  "JB's Wear polos, tees, hi-vis, fleece and scrubs, custom printed or embroidered in Sydney. Weights compared, hi-vis day vs day/night explained, and how to read the style names."

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
  code: string | null
  colours: number
  typeId: string | null
}

function summarise(p: HttpTypes.StoreProduct): Summary {
  const meta = (p.metadata ?? {}) as Record<string, any>
  return {
    handle: p.handle ?? "",
    title: p.title ?? "",
    thumbnail: p.thumbnail ?? null,
    gsm: Number(meta.gsm) || null,
    code: meta.jbs_wear?.style_code ?? null,
    colours:
      p.options?.find((o) => /colou?r/i.test(o.title ?? ""))?.values?.length ?? 0,
    typeId: p.type?.id ?? null,
  }
}

/** Colour → front flat-lay, from each variant's `garment_images`. */
function colourShots(p?: HttpTypes.StoreProduct) {
  const shots = new Map<string, string>()
  for (const v of p?.variants ?? []) {
    const meta = (v.metadata ?? {}) as Record<string, any>
    const colour: string | undefined = meta.garment_color ?? v.title?.split(" / ")[0]
    const front: string | undefined = meta.garment_images?.front
    if (colour && front && !shots.has(colour)) shots.set(colour, front)
  }
  return Array.from(shots).map(([name, src]) => ({ name, src })).sort((a, b) => a.name.localeCompare(b.name))
}

const NAVY = "#0f2238"
const AMBER = "#f5b300"

// Reflective tape: silver band with a moving-light sheen, amber edges.
const CSS = `
.jb-tape { background:
  linear-gradient(${AMBER}, ${AMBER}) top / 100% 6px no-repeat,
  linear-gradient(${AMBER}, ${AMBER}) bottom / 100% 6px no-repeat,
  repeating-linear-gradient(90deg, #b9c0ca 0 38px, #dfe3e8 38px 40px),
  #c9ced6 }
.jb-hazard { background: repeating-linear-gradient(-45deg, ${AMBER} 0 14px, ${NAVY} 14px 28px) }
@keyframes jb-rise { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
.jb-rise { animation: jb-rise .7s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--d, 0s) }
@media (prefers-reduced-motion: reduce) { .jb-rise { animation: none } }
`

const container = "content-container"
const label = "text-xs font-semibold uppercase tracking-[0.16em]"
const h2 = `${display.className} text-5xl font-extrabold uppercase leading-[0.92] small:text-7xl`
const chip = `${display.className} inline-block border px-2 py-0.5 text-sm font-semibold uppercase tracking-[0.08em]`
const btnAmber =
  "inline-flex min-h-11 items-center gap-2 bg-[#f5b300] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] !text-[#0f2238] transition hover:bg-white"
const btnGhost =
  "inline-flex min-h-11 items-center gap-2 border-2 border-white/50 px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] !text-white transition hover:border-white"
const btnNavy =
  "inline-flex min-h-11 items-center gap-2 bg-[#0f2238] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] !text-white transition hover:bg-[#1d3a5c]"
const delay = (s: number) => ({ ["--d" as string]: `${s}s` })

const Spec = ({ n, children, dark = false }: { n: string; children: string; dark?: boolean }) => (
  <p className={`${label} flex items-center gap-3 ${dark ? "text-white/60" : "text-[#0f2238]/60"}`}>
    <span className="bg-[#f5b300] px-1.5 py-0.5 text-[#0f2238]">Spec {n}</span>
    {children}
  </p>
)

function WeightLadder({ title, items }: { title: string; items: Summary[] }) {
  const max = Math.max(1, ...items.map((s) => s.gsm ?? 0))
  return (
    <div className="border-2 border-[#0f2238] bg-white">
      <h3 className={`${display.className} bg-[#0f2238] px-5 py-3 text-2xl font-extrabold uppercase text-white`}>
        {title}
      </h3>
      <Reveal>
        <ol>
          {items.map((s, i) => (
            <li key={s.handle} className="border-t border-[#0f2238]/15 first:border-t-0">
              <LocalizedClientLink
                href={`/products/${s.handle}`}
                className="group grid min-h-11 grid-cols-[1fr_auto] items-baseline gap-x-4 px-5 py-4 !text-[#0f2238]"
              >
                <span className="font-semibold group-hover:underline group-hover:underline-offset-4">
                  {s.title.replace(/^JB's\s+/, "")}
                </span>
                <span className={`${display.className} text-3xl font-extrabold tabular-nums`}>
                  {s.gsm}
                  <span className="ml-1 text-sm font-semibold text-[#0f2238]/50">GSM</span>
                </span>
                <span className="col-span-2 mt-2 block h-2.5 bg-[#0f2238]/10">
                  <span
                    className="block h-full origin-left bg-[#f5b300] transition-transform duration-700 ease-out group-data-[shown=false]/reveal:scale-x-0"
                    style={{ width: `${((s.gsm ?? 0) / max) * 100}%`, transitionDelay: `${0.1 + i * 0.08}s` }}
                  />
                </span>
              </LocalizedClientLink>
            </li>
          ))}
        </ol>
      </Reveal>
    </div>
  )
}

export default async function JbsWearGuidePage() {
  const [featured, wall] = await Promise.all([
    getProductSummariesByHandle({ handles: ALL_HANDLES }),
    getProductSummariesByHandle({ handles: [COLOUR_WALL_HANDLE], variants: true }),
  ])
  const byHandle = new Map(featured.map((p) => [p.handle, summarise(p)]))
  const pick = (handles: string[]) =>
    handles.map((h) => byHandle.get(h)).filter((s): s is Summary => Boolean(s))

  const hero = pick(HERO_HANDLES)
  const tiles = RANGE_TILES.map((t) => ({ ...t, p: byHandle.get(t.handle) })).filter((t) => t.p)
  const polos = pick(POLO_LADDER).filter((s) => s.gsm).sort((a, b) => (a.gsm ?? 0) - (b.gsm ?? 0))
  const fleece = pick(FLEECE_LADDER).filter((s) => s.gsm).sort((a, b) => (a.gsm ?? 0) - (b.gsm ?? 0))
  const hiVis = HI_VIS_PICKS.map((h) => ({ ...h, p: byHandle.get(h.handle) })).filter((h) => h.p)
  const labels = LABELS.map((l) => ({ ...l, p: byHandle.get(l.pick) }))
  const wallColours = colourShots(wall[0])
  const tee = byHandle.get(COLOUR_WALL_HANDLE)
  const teeColours = wallColours.length || tee?.colours || 0

  const stats = [
    teeColours ? [`${teeColours}`, "Colours in the JB's Tee"] : null,
    polos.length > 1 ? [`${polos[0].gsm}–${polos[polos.length - 1].gsm}`, "GSM across the polos"] : null,
    [`${LABELS.length}`, "Labels in the family"],
    ["1", "Piece minimum"],
  ].filter((s): s is string[] => Boolean(s))

  const faqs = [
    {
      q: "Can you print on JB's Wear?",
      a: "Yes. We decorate JB's Wear polos, tees, fleece, hi-vis, workwear and scrubs in our Sydney studio, with print or embroidery depending on the garment, and ship Australia-wide.",
    },
    {
      q: "What is the difference between day and day/night hi-vis?",
      a: "Day hi-vis is a fluoro garment that stands out in daylight. Day/night (D+N) adds retro-reflective tape so you are also seen under headlights and in low light. If anyone works before sunrise, after dark or near traffic, ask your site what it requires.",
    },
    {
      q: "Can you put a logo on hi-vis?",
      a: "Yes. We keep logos off the reflective tape and keep them modest in size, so the garment still does its job. Check your workplace rules, as some sites set their own limits on branding.",
    },
    {
      q: "Is there a minimum order?",
      a: `No. Full-colour prints and embroidery are available from one piece. Screen printing starts at ${SCREEN_MIN_QUANTITY} pieces.`,
    },
    {
      q: "Do you stock Podium and Colours of Cotton too?",
      a: "Yes. Both are part of the JB's Wear family and are decorated the same way. Podium is the sport and teamwear range; Colours of Cotton is the softer, heavier cotton range.",
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
    <div className="bg-[#f3f1ec] text-[#0f2238]">
      <style>{CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }} />

      {/* HERO */}
      <header className="bg-[#0f2238] text-white">
        <div className={`${container} grid gap-10 py-14 small:min-h-[70vh] small:grid-cols-[1.1fr_1fr] small:items-center small:py-20`}>
          <div>
            <p className={`${label} jb-rise text-white/60`}>Guide · Uniforms and workwear</p>
            <h1 className={`${display.className} mt-5 font-extrabold uppercase leading-[0.88]`}>
              <span className="jb-rise block text-6xl small:text-8xl" style={delay(0.1)}>
                JB&apos;s Wear,
              </span>
              <span className="jb-rise block text-6xl text-[#f5b300] small:text-8xl" style={delay(0.2)}>
                branded for the job.
              </span>
            </h1>
            <p className="jb-rise mt-6 max-w-xl text-base text-white/80 small:text-lg" style={delay(0.35)}>
              The Australian uniform range behind a lot of trade, club, school and clinic gear,
              decorated in our Sydney studio. Polos, hi-vis, fleece, workwear and scrubs, printed
              or embroidered from a single piece.
            </p>
            <div className="jb-rise mt-8 flex flex-wrap gap-3" style={delay(0.5)}>
              <a href="#range" className={btnAmber}>
                See the range →
              </a>
              <LocalizedClientLink href="/brands/jbs-wear" className={btnGhost}>
                Shop JB&apos;s Wear
              </LocalizedClientLink>
            </div>
          </div>
          <div className="jb-rise grid grid-cols-2 gap-3" style={delay(0.3)}>
            {hero.map((s, i) => (
              <LocalizedClientLink
                key={s.handle}
                href={`/products/${s.handle}`}
                className={`group block bg-[#f3f1ec] p-3 !text-[#0f2238] ${i ? "mt-10" : ""}`}
              >
                <div className="relative aspect-[9/11]">
                  {s.thumbnail ? (
                    <Image
                      src={s.thumbnail}
                      alt={s.title}
                      fill
                      priority
                      sizes="(min-width: 1024px) 22vw, 45vw"
                      className="object-contain transition duration-500 group-hover:scale-[1.03]"
                    />
                  ) : null}
                </div>
                <p className="mt-3 flex flex-wrap items-center gap-2">
                  {s.code ? <span className={`${chip} border-[#0f2238]`}>Style {s.code}</span> : null}
                  {s.gsm ? <span className={`${chip} border-transparent bg-[#0f2238] text-white`}>{s.gsm} GSM</span> : null}
                </p>
              </LocalizedClientLink>
            ))}
          </div>
        </div>
        <div className="jb-tape h-9" aria-hidden />
      </header>

      {/* STATS */}
      <section className="bg-white">
        <dl className={`${container} grid grid-cols-2 small:grid-cols-4`}>
          {stats.map(([value, name], i) => (
            <div key={name} className={`py-8 small:py-10 ${i ? "small:border-l-2 small:border-[#0f2238]/10 small:pl-8" : ""}`}>
              <dd className={`${display.className} text-5xl font-extrabold small:text-6xl`}>{value}</dd>
              <dt className={`${label} mt-1 text-[#0f2238]/60`}>{name}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* RANGE */}
      <section id="range" className="scroll-mt-24">
        <div className={`${container} py-16 small:py-24`}>
          <Spec n="01">The range</Spec>
          <h2 className={`${h2} mt-4`}>Kit out the whole crew</h2>
          <p className="mt-5 max-w-2xl text-[#0f2238]/75 small:text-lg">
            JB&apos;s covers most of what a team wears in a week, from the front desk to the site.
            Pick a part of the range to see every style in it.
          </p>
          <div className="mt-10 grid gap-4 phone:grid-cols-2 medium:grid-cols-3">
            {tiles.map((t, i) => {
              const href = t.anchor ?? (t.p?.typeId ? `/brands/jbs-wear?typeId=${t.p.typeId}` : "/brands/jbs-wear")
              const inner = (
                <>
                  <div className="relative aspect-[5/4] overflow-hidden bg-white">
                    {t.p?.thumbnail ? (
                      <Image
                        src={t.p.thumbnail}
                        alt={t.p.title}
                        fill
                        sizes="(min-width: 1280px) 30vw, (min-width: 480px) 50vw, 100vw"
                        className="object-contain p-5 transition duration-500 group-hover:scale-[1.05]"
                      />
                    ) : null}
                  </div>
                  <div className="flex items-start justify-between gap-3 border-t-2 border-[#0f2238] p-5">
                    <div>
                      <h3 className={`${display.className} text-3xl font-extrabold uppercase leading-none`}>{t.label}</h3>
                      <p className="mt-2 text-sm text-[#0f2238]/70">{t.blurb}</p>
                    </div>
                    <span aria-hidden className="text-2xl transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </>
              )
              return (
                <Reveal key={t.label} delay={(i % 3) * 0.08} className="h-full">
                  {t.anchor ? (
                    <a href={href} className="group block h-full border-2 border-[#0f2238] bg-white !text-[#0f2238]">
                      {inner}
                    </a>
                  ) : (
                    <LocalizedClientLink href={href} className="group block h-full border-2 border-[#0f2238] bg-white !text-[#0f2238]">
                      {inner}
                    </LocalizedClientLink>
                  )}
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* WEIGHTS */}
      {polos.length || fleece.length ? (
        <section className="bg-white">
          <div className={`${container} py-16 small:py-24`}>
            <Spec n="02">Fabric weight</Spec>
            <h2 className={`${h2} mt-4`}>The weight is in the name</h2>
            <p className="mt-5 max-w-2xl text-[#0f2238]/75 small:text-lg">
              GSM is grams per square metre: the higher the number, the thicker the fabric. JB&apos;s
              often puts it right in the style name, so the 210 Polo is 210 GSM. Lighter for the
              heat and hi-vis, heavier for a polo or hoodie that holds its shape.
            </p>
            <div className="mt-10 grid gap-6 small:grid-cols-2">
              {polos.length ? <WeightLadder title="Polos" items={polos} /> : null}
              {fleece.length ? <WeightLadder title="Fleece" items={fleece} /> : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* HI-VIS */}
      <section id="hi-vis" className="scroll-mt-24 bg-[#0f2238] text-white">
        <div className="jb-hazard h-3" aria-hidden />
        <div className={`${container} py-16 small:py-24`}>
          <div className="grid gap-10 small:grid-cols-[1fr_1.1fr]">
            <div>
              <Spec n="03" dark>
                Hi-vis
              </Spec>
              <h2 className={`${h2} mt-4`}>
                Day, or <span className="text-[#f5b300]">day/night?</span>
              </h2>
              <p className="mt-5 max-w-xl text-white/75 small:text-lg">
                Most JB&apos;s hi-vis is made to AS/NZS 4602.1, the Australian and New Zealand
                standard for hi-vis safety garments. The first choice is when you need to be seen.
              </p>
            </div>
            <dl className="grid gap-px self-end bg-white/15 phone:grid-cols-2">
              {[
                ["Day", "Fluoro fabric only. Stands out in daylight. Look for HV in the name."],
                ["Day/night", "Fluoro plus reflective tape, for dawn, dusk and headlights. Look for D+N."],
              ].map(([term, body]) => (
                <div key={term} className="bg-[#0f2238] p-6">
                  <dt className={`${display.className} text-4xl font-extrabold uppercase text-[#f5b300]`}>{term}</dt>
                  <dd className="mt-2 text-sm text-white/75">{body}</dd>
                </div>
              ))}
            </dl>
          </div>

          {hiVis.length ? (
            <div className="mt-12 grid gap-4 phone:grid-cols-2 medium:grid-cols-4">
              {hiVis.map((h, i) => (
                <Reveal key={h.handle} delay={i * 0.08} className="h-full">
                  <LocalizedClientLink href={`/products/${h.handle}`} className="group flex h-full flex-col bg-white !text-[#0f2238]">
                    <div className="relative aspect-square">
                      {h.p?.thumbnail ? (
                        <Image
                          src={h.p.thumbnail}
                          alt={h.p.title}
                          fill
                          sizes="(min-width: 1280px) 22vw, (min-width: 480px) 50vw, 100vw"
                          className="object-contain p-4 transition duration-500 group-hover:scale-[1.04]"
                        />
                      ) : null}
                    </div>
                    <div className="jb-tape h-4" aria-hidden />
                    <div className="flex flex-1 flex-col p-4">
                      <p className="font-semibold leading-snug">{h.p?.title.replace(/^JB's\s+/, "")}</p>
                      <p className="mt-1 text-sm text-[#0f2238]/65">{h.note}</p>
                    </div>
                  </LocalizedClientLink>
                </Reveal>
              ))}
            </div>
          ) : null}

          <div className="mt-12 border-l-4 border-[#f5b300] pl-5">
            <p className={`${display.className} text-2xl font-extrabold uppercase`}>Branding hi-vis</p>
            <p className="mt-2 max-w-2xl text-white/75">
              We keep logos off the reflective tape and sized so the fluoro still does its job. A
              chest logo and a company name across the back are the usual setup. Some sites set
              their own rules on branding, so check yours first.
            </p>
          </div>
        </div>
      </section>

      {/* COLOUR WALL */}
      {wallColours.length ? (
        <section>
          <div className={`${container} py-16 small:py-24`}>
            <Spec n="04">Colour</Spec>
            <h2 className={`${h2} mt-4`}>{wallColours.length} colours, one tee</h2>
            <p className="mt-5 max-w-2xl text-[#0f2238]/75 small:text-lg">
              The JB&apos;s Tee in every colour it comes in. Club colours, school colours and a
              matching tee for most uniform polos.
            </p>
            {/* One Reveal for the whole wall: one observer per swatch would be wasteful. */}
            <Reveal className="mt-10">
              <ul className="grid grid-cols-3 gap-2 phone:grid-cols-4 tablet:grid-cols-6 medium:grid-cols-9">
                {wallColours.map((c) => (
                  <li key={c.name} className="bg-white">
                    <div className="relative aspect-[9/11]">
                      <Image
                        src={c.src}
                        alt={`JB's Tee in ${c.name}`}
                        fill
                        sizes="(min-width: 1280px) 10vw, (min-width: 768px) 16vw, 30vw"
                        className="object-contain p-1.5"
                      />
                    </div>
                    <p className={`${display.className} border-t border-[#0f2238]/10 px-2 py-1.5 text-sm font-semibold uppercase`}>
                      {c.name}
                    </p>
                  </li>
                ))}
              </ul>
            </Reveal>
            <div className="mt-10">
              <LocalizedClientLink href={`/products/${COLOUR_WALL_HANDLE}`} className={btnNavy}>
                Customise the JB&apos;s Tee →
              </LocalizedClientLink>
            </div>
          </div>
        </section>
      ) : null}

      {/* LABELS */}
      <section className="bg-white">
        <div className={`${container} py-16 small:py-24`}>
          <Spec n="05">The family</Spec>
          <h2 className={`${h2} mt-4`}>Four labels, one supplier</h2>
          <p className="mt-5 max-w-2xl text-[#0f2238]/75 small:text-lg">
            JB&apos;s Wear sits alongside three sister labels. Mix them in one order, and we decorate
            them all the same way.
          </p>
          <div className="mt-10 grid gap-4 phone:grid-cols-2 medium:grid-cols-4">
            {labels.map((l, i) => (
              <Reveal key={l.handle} delay={i * 0.08} className="h-full">
                <LocalizedClientLink
                  href={`/brands/${l.handle}`}
                  className="group flex h-full flex-col border-2 border-[#0f2238] !text-[#0f2238]"
                >
                  <div className="relative aspect-square bg-[#f3f1ec]">
                    {l.p?.thumbnail ? (
                      <Image
                        src={l.p.thumbnail}
                        alt={l.p.title}
                        fill
                        sizes="(min-width: 1280px) 22vw, (min-width: 480px) 50vw, 100vw"
                        className="object-contain p-5 transition duration-500 group-hover:scale-[1.04]"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col border-t-2 border-[#0f2238] p-5">
                    <h3 className={`${display.className} text-3xl font-extrabold uppercase leading-none`}>{l.name}</h3>
                    <p className="mt-2 text-sm text-[#0f2238]/70">{l.blurb}</p>
                    <span className={`${label} mt-auto pt-5 group-hover:underline group-hover:underline-offset-4`}>
                      Shop {l.name} →
                    </span>
                  </div>
                </LocalizedClientLink>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* NAME DECODER */}
      <section>
        <div className={`${container} grid gap-10 py-16 small:grid-cols-[1fr_1.5fr] small:py-24`}>
          <div>
            <Spec n="06">Reading the name</Spec>
            <h2 className={`${h2} mt-4`}>Decode the label</h2>
            <p className="mt-5 max-w-md text-[#0f2238]/75 small:text-lg">
              JB&apos;s style names are packed with shorthand. Here is what it means.
            </p>
          </div>
          <Reveal>
            <dl className="grid gap-px border-2 border-[#0f2238] bg-[#0f2238]/15 phone:grid-cols-2">
              {NAME_DECODER.map((d) => (
                <div key={d.term} className="bg-white p-5">
                  <dt className={`${display.className} text-2xl font-extrabold uppercase`}>{d.term}</dt>
                  <dd className="mt-1 text-sm text-[#0f2238]/70">{d.meaning}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* DECORATION */}
      <section className="bg-white">
        <div className={`${container} py-16 small:py-24`}>
          <Spec n="07">Decoration</Spec>
          <h2 className={`${h2} mt-4`}>Put your logo on it</h2>
          <div className="mt-10 grid gap-4 small:grid-cols-3">
            {[
              {
                name: "Embroidery",
                when: "From one piece",
                body: "The uniform favourite. A stitched logo on a polo, fleece or jacket looks sharp and outlasts the garment.",
              },
              {
                name: "Full-colour print",
                when: "From one piece",
                body: "A digital transfer for detailed or multi-colour logos. Good on tees, hi-vis and polyester, and for small runs.",
              },
              {
                name: "Screen print",
                when: `From ${SCREEN_MIN_QUANTITY} pieces`,
                body: "Solid colours for a bigger run of tees or hoodies, like a club or event order.",
              },
            ].map((m, i) => (
              <Reveal key={m.name} delay={i * 0.08} className="h-full border-t-4 border-[#f5b300] bg-[#f3f1ec] p-6">
                <p className={`${label} text-[#0f2238]/60`}>{m.when}</p>
                <h3 className={`${display.className} mt-2 text-3xl font-extrabold uppercase`}>{m.name}</h3>
                <p className="mt-3 text-sm text-[#0f2238]/75">{m.body}</p>
              </Reveal>
            ))}
          </div>
          <p className="mt-8 text-sm text-[#0f2238]/70">
            Not sure which?{" "}
            <LocalizedClientLink
              href="/guides/dtf-vs-screen-printing-vs-embroidery"
              className="!text-[#0f2238] underline underline-offset-4 hover:no-underline"
            >
              Compare the three methods
            </LocalizedClientLink>
            .
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section>
        <div className={`${container} grid gap-10 py-16 small:grid-cols-[1fr_1.5fr] small:py-24`}>
          <div>
            <Spec n="08">Quick answers</Spec>
            <h2 className={`${h2} mt-4`}>JB&apos;s Wear FAQ</h2>
          </div>
          <div className="border-t-2 border-[#0f2238]">
            {faqs.map((f) => (
              <details key={f.q} className="group border-b-2 border-[#0f2238]/15">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold">
                  {f.q}
                  <span aria-hidden className="shrink-0 text-2xl leading-none transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-5 text-[#0f2238]/75">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0f2238] text-white">
        <div className="jb-tape h-9" aria-hidden />
        <div className={`${container} py-20 small:py-28`}>
          <Reveal>
            <h2 className={`${display.className} max-w-4xl text-6xl font-extrabold uppercase leading-[0.88] small:text-8xl`}>
              Uniforms sorted. <span className="text-[#f5b300]">From one piece.</span>
            </h2>
            <p className="mt-6 max-w-xl text-white/75 small:text-lg">
              Pick a style, add your logo in the customiser and see it on the garment before you
              order. Kitting out a whole team? Send us the list and we will quote it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LocalizedClientLink href="/brands/jbs-wear" className={btnAmber}>
                Shop JB&apos;s Wear →
              </LocalizedClientLink>
              <LocalizedClientLink href="/contact" className={btnGhost}>
                Get a uniform quote
              </LocalizedClientLink>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
