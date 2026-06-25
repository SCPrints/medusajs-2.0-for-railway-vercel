import { Metadata } from "next"

// ponytail: static server component — pure reference page, no client JS, no deps.
// Renders the storefront's OWN tokens live (globals.css vars + tailwind.config.js).
// Source of truth is the codebase; update the arrays below if a token changes.

export const metadata: Metadata = {
  title: "UI Design System",
  description:
    "The SC Prints storefront design system — colours, type, spacing, radius, elevation and components used across the site.",
  robots: { index: false, follow: false },
}

/* ---- Section heading (accent bar + uppercase kicker, Spotify-style) ---- */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2 h-0.5 w-8 rounded-full bg-[var(--brand-secondary)]" />
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ui-fg-base">
        {children}
      </h2>
    </div>
  )
}

/* ---- COLOUR ---- */
type Swatch = {
  token: string
  value: string
  name?: string
  usage: string
  dark?: boolean
  ring?: boolean
}

const BRAND: Swatch[] = [
  { token: "brand/primary", value: "#1a1a2e", name: "Inkwell Navy", usage: "Body text, headings, primary surfaces", dark: true },
  { token: "brand/secondary", value: "#ff2e63", name: "Magenta Punch", usage: "Primary CTAs, links, accent bars", dark: true },
  { token: "brand/accent", value: "#3dcfc2", name: "Brand Teal", usage: "Hover states, link hover, cursor trail", dark: true },
  { token: "brand/background", value: "#eeeeee", name: "Soft Light", usage: "Page background, subtle surfaces" },
]

const SEMANTIC: Swatch[] = [
  { token: "text/base", value: "#1a1a2e", usage: "Primary text (text-ui-fg-base)", dark: true },
  { token: "text/subtle", value: "rgba(26,26,46,0.72)", usage: "Secondary text (text-ui-fg-subtle)", dark: true },
  { token: "border/base", value: "rgba(26,26,46,0.22)", usage: "Dividers, card borders", ring: true },
  { token: "surface/white", value: "#ffffff", usage: "Cards, inputs, secondary buttons", ring: true },
]

const GREYS: { token: string; value: string }[] = [
  { token: "grey/0", value: "#FFFFFF" },
  { token: "grey/5", value: "#F9FAFB" },
  { token: "grey/10", value: "#F3F4F6" },
  { token: "grey/20", value: "#E5E7EB" },
  { token: "grey/30", value: "#D1D5DB" },
  { token: "grey/40", value: "#9CA3AF" },
  { token: "grey/50", value: "#6B7280" },
  { token: "grey/60", value: "#4B5563" },
  { token: "grey/70", value: "#374151" },
  { token: "grey/80", value: "#1F2937" },
  { token: "grey/90", value: "#111827" },
]

function SwatchCard({ s }: { s: Swatch }) {
  return (
    <div className="overflow-hidden rounded-large border border-ui-border-base bg-white">
      <div
        className={`h-24 w-full ${s.ring ? "border-b border-ui-border-base" : ""}`}
        style={{ backgroundColor: s.value }}
      />
      <div className="p-3">
        <p className="text-xs font-medium text-ui-fg-subtle">{s.token}</p>
        {s.name && <p className="text-sm font-semibold text-ui-fg-base">{s.name}</p>}
        <p className="font-mono text-xs text-ui-fg-base">{s.value}</p>
        <p className="mt-1 text-xs leading-snug text-ui-fg-subtle">{s.usage}</p>
      </div>
    </div>
  )
}

/* ---- TYPE ---- */
const TYPE: { token: string; cls: string; size: string; usage: string }[] = [
  { token: "page-title-marketing", cls: "page-title-marketing", size: "36 → 48px · Semibold", usage: "Marketing / content H1 (hero, services, FAQ)" },
  { token: "page-title-catalog", cls: "page-title-catalog", size: "30 → 36px · Semibold", usage: "Catalog H1 (store, category, collection)" },
  { token: "section-title", cls: "text-3xl font-semibold", size: "32px · Semibold", usage: "Section heading (SectionHeader h2)" },
  { token: "text-xl-semi", cls: "text-2xl leading-[36px] font-semibold", size: "24px · Semibold", usage: "Card title, sub-section heading" },
  { token: "text-large-regular", cls: "text-base leading-6", size: "16px · Regular", usage: "Lead paragraph, large body" },
  { token: "text-base-regular", cls: "text-sm leading-6", size: "14px · Regular", usage: "Primary body text" },
  { token: "text-small-regular", cls: "text-xs leading-5", size: "12px · Regular", usage: "Secondary text, metadata" },
  { token: "text-xsmall-regular", cls: "text-[10px] leading-4", size: "10px · Regular", usage: "Caption, fine print, floating labels" },
  { token: "eyebrow", cls: "text-xs font-semibold uppercase tracking-[0.12em]", size: "12px · Semibold · caps", usage: "Eyebrow / kicker above headings" },
]

/* ---- RADIUS ---- */
const RADIUS: { token: string; px: string; cls: string; usage: string }[] = [
  { token: "soft", px: "2px", cls: "rounded-soft", usage: "Hairline corners, small chips" },
  { token: "base", px: "4px", cls: "rounded-base", usage: "Inputs, list rows" },
  { token: "rounded", px: "8px", cls: "rounded-rounded", usage: "Buttons, cards, popovers" },
  { token: "large", px: "16px", cls: "rounded-large", usage: "Product cards, large surfaces" },
  { token: "circle", px: "9999px", cls: "rounded-full", usage: "Pills, avatars, badges, contrast-btn" },
]

/* ---- SPACING (Tailwind 4px base; values actually used on the site) ---- */
const SPACING: { px: number; util: string; usage: string }[] = [
  { px: 8, util: "gap-2", usage: "Icon-to-label, tight inline gap" },
  { px: 12, util: "gap-3", usage: "Between chips / CTA buttons" },
  { px: 16, util: "p-4", usage: "Card internal padding" },
  { px: 20, util: "mt-5", usage: "Heading → subhead spacing" },
  { px: 24, util: "px-6", usage: "Content gutter (content-container)" },
  { px: 28, util: "mt-7", usage: "Subhead → CTA row" },
  { px: 56, util: "py-14", usage: "Section vertical rhythm (mobile)" },
  { px: 80, util: "py-20", usage: "Section vertical rhythm (small+)" },
]

/* ---- ELEVATION ---- */
const ELEVATION: { token: string; shadow: string; usage: string }[] = [
  { token: "shadow-sm", shadow: "0 1px 2px 0 rgba(0,0,0,0.05)", usage: "Buttons, inputs — flat resting state" },
  { token: "elevation-card-rest", shadow: "0 2px 8px -2px rgba(0,0,0,0.12)", usage: "Cards at rest (Medusa UI token)" },
  { token: "elevation-card-hover", shadow: "0 8px 20px -6px rgba(0,0,0,0.22)", usage: "Cards on hover (Medusa UI token)" },
  { token: "card-lift", shadow: "0 28px 55px -12px rgba(0,0,0,0.38)", usage: "Product listing card hover lift" },
]

export default function DesignSystemPage() {
  return (
    <div className="content-container py-14 small:py-20">
      {/* Header */}
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-secondary)]">
          SC Prints
        </p>
        <h1 className="page-title-marketing mt-2 tracking-tight">
          UI Design System
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ui-fg-subtle small:text-lg">
          The tokens and shared components used across the storefront — derived
          from <span className="font-mono text-sm">tailwind.config.js</span>,{" "}
          <span className="font-mono text-sm">globals.css</span> and the design
          system v1 primitives. Live render, not a mockup. Last updated Jun 2026.
        </p>
      </header>

      {/* COLOUR */}
      <section className="mt-16">
        <SectionTitle>Colour System</SectionTitle>

        <p className="mb-3 text-sm font-medium text-ui-fg-base">Brand</p>
        <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
          {BRAND.map((s) => (
            <SwatchCard key={s.token} s={s} />
          ))}
        </div>

        <p className="mb-3 mt-8 text-sm font-medium text-ui-fg-base">Semantic</p>
        <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
          {SEMANTIC.map((s) => (
            <SwatchCard key={s.token} s={s} />
          ))}
        </div>

        <p className="mb-3 mt-8 text-sm font-medium text-ui-fg-base">
          Greyscale (grey/0 → grey/90)
        </p>
        <div className="flex overflow-hidden rounded-large border border-ui-border-base">
          {GREYS.map((g) => (
            <div key={g.token} className="flex-1" title={`${g.token} · ${g.value}`}>
              <div className="h-16 w-full" style={{ backgroundColor: g.value }} />
              <div className="bg-white px-1 py-2 text-center">
                <p className="text-[10px] font-medium text-ui-fg-base">
                  {g.token.replace("grey/", "")}
                </p>
                <p className="font-mono text-[9px] text-ui-fg-subtle">{g.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TYPE */}
      <section className="mt-16">
        <SectionTitle>Type Scale</SectionTitle>
        <p className="mb-5 text-sm text-ui-fg-subtle">
          Typeface: <span className="font-semibold text-ui-fg-base">Plus Jakarta Sans</span>.
          Tokens are the <span className="font-mono text-xs">text-*</span> utility
          classes defined in <span className="font-mono text-xs">globals.css</span>.
        </p>
        <div className="overflow-hidden rounded-large border border-ui-border-base">
          {TYPE.map((t, i) => (
            <div
              key={t.token}
              className={`grid grid-cols-1 gap-1 px-4 py-4 tablet:grid-cols-[200px_150px_1fr] tablet:items-center tablet:gap-4 ${
                i % 2 ? "bg-white" : "bg-black/[0.02]"
              }`}
            >
              <code className="text-xs font-semibold text-[var(--brand-secondary)]">
                {t.token}
              </code>
              <span className="text-xs text-ui-fg-subtle">{t.size}</span>
              <span className={`truncate text-ui-fg-base ${t.cls}`}>
                The quick brown fox
              </span>
              <span className="text-xs text-ui-fg-subtle tablet:col-span-3 tablet:hidden">
                {t.usage}
              </span>
            </div>
          ))}
        </div>
        <ul className="mt-3 grid gap-1 text-xs text-ui-fg-subtle">
          {TYPE.map((t) => (
            <li key={t.token} className="hidden tablet:block">
              <span className="font-mono text-[var(--brand-secondary)]">{t.token}</span>
              {" — "}
              {t.usage}
            </li>
          ))}
        </ul>
      </section>

      {/* SPACING */}
      <section className="mt-16">
        <SectionTitle>Spacing System</SectionTitle>
        <p className="mb-5 text-sm text-ui-fg-subtle">
          Base unit <span className="font-semibold text-ui-fg-base">4px</span> (Tailwind
          scale). The steps below are the ones the storefront actually leans on.
        </p>
        <div className="space-y-2">
          {SPACING.map((s) => (
            <div key={s.util} className="flex items-center gap-4">
              <div className="w-16 shrink-0 text-right font-mono text-xs text-ui-fg-base">
                {s.px}px
              </div>
              <div
                className="h-5 rounded-base bg-[var(--brand-accent)]"
                style={{ width: s.px }}
              />
              <code className="w-20 shrink-0 text-xs font-semibold text-[var(--brand-secondary)]">
                {s.util}
              </code>
              <span className="text-xs text-ui-fg-subtle">{s.usage}</span>
            </div>
          ))}
        </div>
      </section>

      {/* RADIUS */}
      <section className="mt-16">
        <SectionTitle>Border Radius</SectionTitle>
        <div className="grid grid-cols-2 gap-4 phone:grid-cols-3 tablet:grid-cols-5">
          {RADIUS.map((r) => (
            <div key={r.token}>
              <div
                className="mb-2 h-20 w-full border-2 border-[var(--brand-secondary)] bg-white"
                style={{ borderRadius: r.px }}
              />
              <p className="text-xs font-semibold text-[var(--brand-secondary)]">
                radius/{r.token}
              </p>
              <p className="text-sm font-bold text-ui-fg-base">{r.px}</p>
              <p className="text-xs leading-snug text-ui-fg-subtle">{r.usage}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ELEVATION */}
      <section className="mt-16">
        <SectionTitle>Elevation &amp; Shadow</SectionTitle>
        <div className="grid grid-cols-1 gap-6 phone:grid-cols-2 tablet:grid-cols-4">
          {ELEVATION.map((e) => (
            <div key={e.token}>
              <div
                className="mb-3 h-24 w-full rounded-large bg-white"
                style={{ boxShadow: e.shadow }}
              />
              <p className="text-xs font-semibold text-[var(--brand-secondary)]">{e.token}</p>
              <p className="text-xs leading-snug text-ui-fg-subtle">{e.usage}</p>
            </div>
          ))}
        </div>
      </section>

      {/* COMPONENTS */}
      <section className="mt-16">
        <SectionTitle>Components</SectionTitle>

        {/* Buttons */}
        <p className="mb-4 text-sm font-medium text-ui-fg-base">Buttons</p>
        <div className="flex flex-wrap items-center gap-4">
          <button className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--brand-secondary)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110">
            Primary action
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </button>
          <button className="group inline-flex items-center gap-2 rounded-lg border border-ui-border-base bg-white px-5 py-2.5 text-sm font-semibold text-ui-fg-base transition hover:bg-ui-bg-subtle">
            Secondary
            <span className="text-xs transition-transform group-hover:translate-x-0.5">→</span>
          </button>
          <button className="contrast-btn text-sm font-semibold">Contrast / pill</button>
          <button className="checkout-primary-action rounded-lg px-6 py-3 text-sm font-semibold">
            Checkout primary
          </button>
        </div>
        <p className="mt-3 text-xs text-ui-fg-subtle">
          Primary &amp; secondary carry an arrow that nudges{" "}
          <span className="font-mono">+2px</span> on hover (the brand micro-interaction).
          Buttons site-wide also get a <span className="font-mono">scale(0.97)</span>{" "}
          tactile press from <span className="font-mono">globals.css</span>.
        </p>

        {/* Card */}
        <p className="mb-4 mt-10 text-sm font-medium text-ui-fg-base">Card (hover lift)</p>
        <div className="grid max-w-md grid-cols-2 gap-4">
          <div
            className="rounded-large border border-ui-border-base bg-white p-4 transition-shadow duration-150"
            style={{ boxShadow: "0 2px 8px -2px rgba(0,0,0,0.12)" }}
          >
            <div className="mb-3 aspect-square w-full rounded-rounded bg-ui-bg-subtle" />
            <p className="text-sm font-semibold text-ui-fg-base">Product card</p>
            <p className="text-xs text-ui-fg-subtle">from $24.00</p>
          </div>
          <div className="rounded-large border border-ui-border-base bg-white p-4 shadow-[0_28px_55px_-12px_rgba(0,0,0,0.38)]">
            <div className="mb-3 aspect-square w-full rounded-rounded bg-ui-bg-subtle" />
            <p className="text-sm font-semibold text-ui-fg-base">Hover state</p>
            <p className="text-xs text-ui-fg-subtle">28px lift shadow</p>
          </div>
        </div>

        {/* Eyebrow + SectionHeader */}
        <p className="mb-4 mt-10 text-sm font-medium text-ui-fg-base">
          Section headers
        </p>
        <div className="grid gap-6 tablet:grid-cols-2">
          <div className="rounded-large border border-ui-border-base bg-white p-5">
            <div className="border-l-4 border-[var(--brand-secondary)] pl-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
                Eyebrow
              </p>
              <h3 className="mt-2 text-3xl font-semibold text-ui-fg-base">
                Left header
              </h3>
            </div>
            <p className="mt-3 text-xs text-ui-fg-subtle">
              <span className="font-mono">SectionHeader</span> · align=&quot;left&quot;
            </p>
          </div>
          <div className="rounded-large border border-ui-border-base bg-white p-5">
            <div className="mx-auto max-w-md text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/80">
                Eyebrow
              </p>
              <h3 className="mt-2 text-3xl font-semibold text-ui-fg-base">
                Centred header
              </h3>
            </div>
            <p className="mt-3 text-center text-xs text-ui-fg-subtle">
              <span className="font-mono">SectionHeader</span> · align=&quot;center&quot;
            </p>
          </div>
        </div>

        {/* Chips / badges */}
        <p className="mb-4 mt-10 text-sm font-medium text-ui-fg-base">Chips &amp; badges</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold">
            Auto-magenta chip
          </span>
          <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-emerald-700 ring-1 ring-emerald-200">
            Active
          </span>
          <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-blue-700 ring-1 ring-blue-200">
            Candidate
          </span>
          <span className="inline-block rounded bg-ui-bg-subtle px-1.5 py-0.5 text-[10px] font-medium leading-none text-ui-fg-subtle ring-1 ring-ui-border-base">
            Tech tag
          </span>
        </div>
        <p className="mt-3 text-xs text-ui-fg-subtle">
          Any <span className="font-mono">rounded-full</span> +{" "}
          <span className="font-mono">text-xs</span> element is auto-tinted magenta
          with a magenta border by a global rule in{" "}
          <span className="font-mono">globals.css</span>.
        </p>
      </section>

      <footer className="mt-20 border-t border-ui-border-base pt-6">
        <p className="text-xs text-ui-fg-subtle">
          Source of truth:{" "}
          <span className="font-mono">storefront/tailwind.config.js</span>,{" "}
          <span className="font-mono">src/styles/globals.css</span>,{" "}
          <span className="font-mono">modules/common/components/section-header</span>.
          This page renders those tokens live — if a render here looks wrong, the
          token changed.
        </p>
      </footer>
    </div>
  )
}
