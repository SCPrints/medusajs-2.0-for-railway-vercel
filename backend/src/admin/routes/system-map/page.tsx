import { ArrowsPointingOut, Minus, Plus, XMark } from "@medusajs/icons"
import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"

// ─── Mermaid lazy-loader ───────────────────────────────────────────────────────

type MermaidAPI = {
  initialize: (cfg: Record<string, unknown>) => void
  render: (id: string, def: string) => Promise<{
    svg: string
    bindFunctions?: (el: Element) => void
  }>
}

let _m: MermaidAPI | null = null
let _p: Promise<MermaidAPI> | null = null

/**
 * The admin bundle code-splits mermaid into its own chunk (currently
 * ~500 KB gzipped). When a new deploy lands, browsers with the old
 * admin HTML cached will request a chunk URL that no longer exists on
 * the server, producing:
 *
 *   TypeError: Failed to fetch dynamically imported module: …/mermaid.core-<oldhash>.js
 *
 * We retry once after a short delay (covers genuine transient network
 * failures), then surface the error to MermaidDiagram which renders a
 * reload button.
 */
const dynamicImportMermaid = async (): Promise<typeof import("mermaid")> => {
  try {
    return await import("mermaid")
  } catch (firstErr) {
    await new Promise((resolve) => setTimeout(resolve, 400))
    try {
      return await import("mermaid")
    } catch {
      // Reset cached promise so subsequent calls can retry from scratch
      // (e.g. after the user reloads inline via the error button).
      _p = null
      throw firstErr
    }
  }
}

const loadMermaid = (): Promise<MermaidAPI> => {
  if (_m) return Promise.resolve(_m)
  if (_p) return _p
  _p = dynamicImportMermaid().then((mod) => {
    const api = mod.default as MermaidAPI
    api.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "loose",
      themeVariables: {
        // Foundation
        background: "#ffffff",
        mainBkg: "#f8fafc",
        nodeBkg: "#f8fafc",
        nodeBorder: "#e2e8f0",
        clusterBkg: "#f8fafc",
        clusterBorder: "#e2e8f0",
        titleColor: "#0f172a",

        // Primary nodes — violet tint
        primaryColor: "#f5f3ff",
        primaryTextColor: "#1e293b",
        primaryBorderColor: "#8b5cf6",

        // Secondary nodes — slate
        secondaryColor: "#f1f5f9",
        secondaryTextColor: "#475569",
        secondaryBorderColor: "#94a3b8",

        // Tertiary nodes — amber (external services)
        tertiaryColor: "#fffbeb",
        tertiaryTextColor: "#92400e",
        tertiaryBorderColor: "#f59e0b",

        // Edges & labels
        lineColor: "#94a3b8",
        edgeLabelBackground: "#f8fafc",
        textColor: "#334155",

        // Typography
        fontFamily: 'Inter, "system-ui", -apple-system, sans-serif',
        fontSize: "14px",

        // Sequence diagrams
        actorBkg: "#f5f3ff",
        actorBorder: "#8b5cf6",
        actorTextColor: "#1e293b",
        actorLineColor: "#e2e8f0",
        signalColor: "#64748b",
        signalTextColor: "#334155",
        noteBkgColor: "#fefce8",
        noteTextColor: "#713f12",
        noteBorderColor: "#fbbf24",
        activationBkgColor: "#ede9fe",
        activationBorderColor: "#8b5cf6",
        sequenceNumberColor: "#ffffff",
        labelBoxBkgColor: "#f5f3ff",
        labelBoxBorderColor: "#8b5cf6",
        labelTextColor: "#1e293b",
        loopTextColor: "#1e293b",

        // State diagrams
        labelColor: "#1e293b",
        altBackground: "#f1f5f9",
        compositeBackground: "#f8fafc",
        compositeBorder: "#e2e8f0",
        compositeTitleBackground: "#ede9fe",

        // Gantt
        gridColor: "#e2e8f0",
        section0: "#f5f3ff",
        section1: "#f8fafc",
        sectionBkgColor: "#f5f3ff",
        altSectionBkgColor: "#f8fafc",
        sectionBkgColor2: "#f5f3ff",
        taskBkgColor: "#8b5cf6",
        taskBorderColor: "#7c3aed",
        taskTextColor: "#ffffff",
        taskTextLightColor: "#ffffff",
        taskTextOutsideColor: "#334155",
        taskTextClickableColor: "#334155",
        activeTaskBkgColor: "#6d28d9",
        activeTaskBorderColor: "#5b21b6",
        doneTaskBkgColor: "#c4b5fd",
        doneTaskBorderColor: "#8b5cf6",
        critBkgColor: "#fecaca",
        critBorderColor: "#ef4444",
        todayLineColor: "#ef4444",
      },
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis", rankSpacing: 60, nodeSpacing: 30 },
      sequence: { useMaxWidth: true, mirrorActors: false },
    })
    _m = api
    return api
  })
  return _p
}

const MermaidDiagram = ({ chart, title }: { chart: string; title?: string }) => {
  const reactId = useId()
  const baseId = `mmd${reactId.replace(/\W/g, "")}`
  const inlineId = `${baseId}i`
  const overlayId = `${baseId}o`

  const inlineRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const overlayDiagramRef = useRef<HTMLDivElement>(null)
  const overlaySvgRef = useRef<SVGSVGElement | null>(null)
  const naturalWidthRef = useRef<number>(1200)
  // scroll positions at drag start
  const dragStart = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)

  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)

  // Inline render
  useEffect(() => {
    let gone = false
    loadMermaid()
      .then((m) => m.render(inlineId, chart))
      .then(({ svg }) => { if (!gone && inlineRef.current) inlineRef.current.innerHTML = svg })
      .catch((e) => { if (!gone) setErr(String(e)) })
    return () => { gone = true }
  }, [inlineId, chart])

  // Overlay render — fires each time overlay opens; stores ref to SVG + natural width
  useEffect(() => {
    if (!open) return
    let gone = false
    loadMermaid()
      .then((m) => m.render(overlayId, chart))
      .then(({ svg }) => {
        if (!gone && overlayDiagramRef.current) {
          overlayDiagramRef.current.innerHTML = svg
          const svgEl = overlayDiagramRef.current.querySelector("svg")
          if (svgEl) {
            // Mermaid sets max-width: Npx inline — read it as the natural rendered width
            const mw = parseFloat(svgEl.style.maxWidth)
            const vbw = svgEl.viewBox?.baseVal?.width ?? 0
            const natW = mw > 10 ? mw : vbw > 10 ? vbw : 1200
            naturalWidthRef.current = natW
            overlaySvgRef.current = svgEl as SVGSVGElement
            svgEl.style.maxWidth = "none"
            svgEl.style.display = "block"
            svgEl.style.width = `${natW * scale}px`
            svgEl.style.height = "auto"
          }
        }
      })
      .catch(() => {})
    return () => { gone = true }
  }, [open, overlayId, chart]) // deliberately excludes `scale` — handled by the effect below

  // Resize SVG when scale changes without re-rendering
  useEffect(() => {
    if (!overlaySvgRef.current || !open) return
    overlaySvgRef.current.style.width = `${naturalWidthRef.current * scale}px`
  }, [scale, open])

  const handleClose = useCallback(() => {
    setOpen(false)
    setScale(1)
    overlaySvgRef.current = null
  }, [])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, handleClose])

  // Wheel zoom — non-passive so we can preventDefault and avoid page scroll
  useEffect(() => {
    if (!open) return
    const el = overlayRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.15 : 0.15
      setScale((s) => Math.min(5, Math.max(0.2, +(s + delta).toFixed(2))))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [open])

  // Drag-to-scroll pan — manipulates scrollLeft/scrollTop so layout stays correct
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const ds = dragStart.current
      const el = overlayRef.current
      if (!ds || !el) return
      el.scrollLeft = ds.sl - (e.clientX - ds.x)
      el.scrollTop = ds.st - (e.clientY - ds.y)
    }
    const onUp = () => setDragging(false)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [dragging])

  if (err) {
    // Chunk-load failures look like "Failed to fetch dynamically imported
    // module" or "Loading chunk … failed". They almost always indicate the
    // browser is holding stale HTML pointing at a chunk a newer deploy has
    // replaced. A hard reload fixes it.
    const isChunkLoadError =
      /failed to fetch dynamically imported module|loading chunk|importing a module script failed/i.test(
        err
      )
    return (
      <div className="rounded border border-ui-border-error bg-ui-bg-subtle p-3 text-sm text-ui-fg-error">
        {isChunkLoadError ? (
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Diagram code couldn&apos;t load — looks like the admin has been
              updated since this page opened. Reload to fetch the latest
              assets.
            </span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-xs font-semibold text-ui-fg-base hover:bg-ui-bg-subtle"
            >
              Reload page
            </button>
          </div>
        ) : (
          <span>Diagram render error — {err}</span>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Expand button */}
      <button
        onClick={() => { setScale(1); setOpen(true) }}
        className="absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded border border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle text-ui-fg-muted hover:text-ui-fg-base shadow-sm"
        aria-label="Expand diagram"
        title="Expand fullscreen"
      >
        <ArrowsPointingOut />
      </button>

      {/* Inline SVG */}
      <div ref={inlineRef} className="overflow-x-auto [&_svg]:max-w-full [&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto" />

      {/* Fullscreen overlay — portalled to document.body so fixed inset-0 covers the full
          viewport even when an ancestor element has a CSS transform applied */}
      {open && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between shrink-0 px-4 py-2 bg-ui-bg-base border-b border-ui-border-base shadow-sm">
            <span className="text-sm font-semibold text-ui-fg-base">{title ?? "Diagram"}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setScale((s) => Math.min(5, +(s + 0.25).toFixed(2)))}
                className="flex items-center justify-center w-7 h-7 rounded hover:bg-ui-bg-subtle"
                aria-label="Zoom in"
              >
                <Plus />
              </button>
              <span className="text-xs text-ui-fg-subtle tabular-nums w-10 text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={() => setScale((s) => Math.max(0.2, +(s - 0.25).toFixed(2)))}
                className="flex items-center justify-center w-7 h-7 rounded hover:bg-ui-bg-subtle"
                aria-label="Zoom out"
              >
                <Minus />
              </button>
              <button
                onClick={() => setScale(1)}
                className="text-xs px-2 py-1 rounded hover:bg-ui-bg-subtle text-ui-fg-subtle"
              >
                Reset
              </button>
              <button
                onClick={handleClose}
                className="flex items-center gap-1 rounded px-2 py-1 text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-subtle"
                aria-label="Close"
              >
                <XMark />
                <span className="text-xs">Close</span>
              </button>
            </div>
          </div>

          {/* Scrollable diagram area — overflow:auto means zoom produces real scrollbars */}
          <div
            ref={overlayRef}
            className="flex-1 overflow-auto bg-white"
            style={{ cursor: dragging ? "grabbing" : "grab" }}
            onMouseDown={(e) => {
              // Don't steal clicks on buttons inside the diagram (e.g. mermaid clickable nodes)
              if ((e.target as HTMLElement).closest("button")) return
              setDragging(true)
              dragStart.current = {
                x: e.clientX,
                y: e.clientY,
                sl: overlayRef.current?.scrollLeft ?? 0,
                st: overlayRef.current?.scrollTop ?? 0,
              }
            }}
          >
            <div className="p-8 min-w-max">
              <div ref={overlayDiagramRef} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Section definitions ───────────────────────────────────────────────────────

type Section = {
  id: string
  title: string
  diagram?: string
  body?: ReactNode
}

const SECTIONS: Section[] = [
  // ── 1. Big picture ──────────────────────────────────────────────────────────
  {
    id: "big-picture",
    title: "The big picture",
    diagram: `flowchart LR
    CUST[Customer touchpoints]
    CORE[Orders and catalog]
    CUSTOM[SC custom modules]
    REACTIONS[Events and reactions]
    CRONS[Scheduled crons]
    OUT[External services]
    ADMIN[Admin dashboard]

    CUST -->|"cart + inquiries"| CORE
    CORE -->|"emits events"| REACTIONS
    REACTIONS -->|"notify"| OUT
    CRONS -->|"scheduled sends"| OUT
    CRONS -.->|"reads"| CORE
    CUSTOM <-->|"linked"| CORE
    CORE -.->|"read by"| ADMIN
    CUSTOM -.->|"read by"| ADMIN
    CUST -.->|"analytics"| OUT

    classDef ext fill:#fef3c7,stroke:#92400e;
    classDef cron fill:#dbeafe,stroke:#1e40af;
    classDef sub fill:#e0e7ff,stroke:#3730a3;
    class OUT ext;
    class CRONS cron;
    class REACTIONS sub;`,
    body: (
      <div className="mt-3 grid grid-cols-1 small:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <p className="font-semibold text-ui-fg-base">Customer touchpoints</p>
          <p className="text-ui-fg-subtle text-xs mt-0.5">Storefront catalog, Fabric.js customizer, /account dashboard, BYO inquiry form, inbound email replies</p>
        </div>
        <div>
          <p className="font-semibold text-ui-fg-base">Orders and catalog</p>
          <p className="text-ui-fg-subtle text-xs mt-0.5">Medusa core: cart → order lifecycle, customer, product — the central data spine everything else reads from</p>
        </div>
        <div>
          <p className="font-semibold text-ui-fg-base">SC custom modules</p>
          <p className="text-ui-fg-subtle text-xs mt-0.5">design, wishlist, quote, print recipe, production reject, lookbook, organisation, group order, customer_tag / note / comment</p>
        </div>
        <div>
          <p className="font-semibold text-ui-fg-base"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-100 border border-indigo-800 mr-1 align-middle" />Events and reactions</p>
          <p className="text-ui-fg-subtle text-xs mt-0.5">order.placed · stage_changed · artwork_changed · customer.created → email sender, automation rules, perks snapshot, stage stamps, photo attach</p>
        </div>
        <div>
          <p className="font-semibold text-ui-fg-base"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-800 mr-1 align-middle" />Scheduled crons</p>
          <p className="text-ui-fg-subtle text-xs mt-0.5">Abandoned cart, win-back, NPS request, reorder reminders, stale-order scan, cross-sell refresh, PostHog cohort sync, supplier inventory, SEO analytics</p>
        </div>
        <div>
          <p className="font-semibold text-ui-fg-base"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-800 mr-1 align-middle" />External services</p>
          <p className="text-ui-fg-subtle text-xs mt-0.5">Resend (email), Slack (alerts), PostHog (analytics + cohorts), GA4 (e-commerce tracking), ShipStation, Stripe, Meilisearch</p>
        </div>
        <div>
          <p className="font-semibold text-ui-fg-base">Admin dashboard</p>
          <p className="text-ui-fg-subtle text-xs mt-0.5">Studio, order detail widgets, customer detail widgets, reports, production calendar, quote pipeline — all read-only consumers</p>
        </div>
        <div className="text-ui-fg-muted text-xs pt-1 border-t border-ui-border-base col-span-full">
          Solid arrows = primary data flow. Dotted = reads from (no write to source).
        </div>
      </div>
    ),
  },

  // ── 1b. Hosting topology ─────────────────────────────────────────────────────
  {
    id: "hosting-topology",
    title: "Hosting topology (where everything runs)",
    diagram: `flowchart TB
    subgraph BROWSERS["Customer & staff browsers"]
        CUST_BROWSER[Customer]
        STAFF_BROWSER[Staff]
    end

    subgraph VERCEL["Vercel · global edge (Sydney POP)"]
        STOREFRONT["Next.js 15 storefront"]
    end

    subgraph FLY["Fly.io · Sydney (syd) — ~$11/mo"]
        BACKEND["sc-prints-backend<br/>Medusa server + admin SPA<br/>shared-cpu-1x · 2 GB · min 1 machine"]
        REDIS["sc-prints-redis<br/>Redis 7 · event bus + workflow + locks<br/>private 6PN only"]
        MEILI["sc-prints-search<br/>Meilisearch v1.10 · catalog index"]
    end

    subgraph DO["DigitalOcean Managed · SYD1 — ~$15/mo"]
        PG[("Postgres 16<br/>self-signed cert · port 25060")]
    end

    subgraph CF["Cloudflare R2 · Oceania — free tier"]
        BUCKET[("sc-prints-media bucket<br/>S3-compatible · public dev URL")]
    end

    subgraph SAAS["External SaaS"]
        RESEND[Resend · email]
        STRIPE[Stripe · payments + Payment Links]
        POSTHOG[PostHog Cloud US]
        GOOGLE[Google GSC + GA4]
        SHIPSTATION[ShipStation]
        SUPPLIERS[AS Colour / FashionBiz / Aussie Pacific APIs]
        ANTHROPIC[Anthropic · chatbot + AI copy]
    end

    CUST_BROWSER --> STOREFRONT
    STAFF_BROWSER --> BACKEND

    STOREFRONT -->|"store API · HTTPS"| BACKEND
    STOREFRONT -->|"search-scoped key"| MEILI

    BACKEND -->|"TLS · NODE_TLS_REJECT_UNAUTHORIZED=0"| PG
    BACKEND -->|"6PN private"| REDIS
    BACKEND -->|"S3 API"| BUCKET
    BACKEND -->|"admin key"| MEILI

    BACKEND --> RESEND
    BACKEND --> STRIPE
    BACKEND --> POSTHOG
    BACKEND --> GOOGLE
    BACKEND --> SHIPSTATION
    BACKEND --> SUPPLIERS
    BACKEND --> ANTHROPIC

    classDef ext fill:#fef3c7,stroke:#92400e;
    classDef host fill:#f5f3ff,stroke:#8b5cf6;
    classDef store fill:#dcfce7,stroke:#166534;
    class RESEND,STRIPE,POSTHOG,GOOGLE,SHIPSTATION,SUPPLIERS,ANTHROPIC ext;
    class STOREFRONT,BACKEND,REDIS,MEILI host;
    class PG,BUCKET store;`,
    body: (
      <>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Migrated off Railway in May 2026 after a multi-day Railway outage. The new stack is multi-provider, Australian-resident where the data lives, and split into single-purpose services so an outage at one provider doesn&apos;t take everything down. Total infra spend ~$26/mo: Fly backend $5 + DO Postgres $15 + self-hosted Redis $3 + self-hosted Meilisearch $3 + Vercel Hobby + R2 free tier.
        </Text>

        <Text className="mt-3 font-semibold text-sm">Deploy pipeline</Text>
        <ul className="text-sm list-disc pl-5 space-y-1 text-ui-fg-subtle">
          <li><strong>Backend</strong> — <code>cd backend &amp;&amp; fly deploy --app sc-prints-backend</code> from a clean master. The Dockerfile bakes <code>BACKEND_PUBLIC_URL</code> into the admin SPA so it hits the right backend from the browser.</li>
          <li><strong>Migrations</strong> — fly.toml&apos;s <code>release_command</code> runs <code>db:migrate</code> + <code>db:sync-links</code> once per deploy (not on every boot), so machines start cold in ~5s.</li>
          <li><strong>Storefront</strong> — <code>git push origin master</code>; Vercel auto-deploys. PR previews build per branch.</li>
          <li><strong>Meilisearch</strong> — <code>cd meilisearch &amp;&amp; fly deploy --app sc-prints-search</code>. Image-only deploy that pulls <code>getmeili/meilisearch:v1.10</code>.</li>
          <li><strong>Secrets</strong> — <code>fly secrets set --app &lt;app&gt; KEY=value</code>. Any secret change triggers a rolling redeploy automatically.</li>
        </ul>

        <Text className="mt-3 font-semibold text-sm">Why self-hosted Redis and Meilisearch instead of managed providers?</Text>
        <Text size="small" className="text-ui-fg-subtle">
          Medusa uses Redis as <em>infrastructure</em> (BullMQ queues + workflow engine + distributed locks), not a cache — even an idle backend burns ~50-100k commands/day on BullMQ worker polling alone. Add the importers and a managed free tier (e.g. Upstash&apos;s 500k cmd/day) gets blown in under 24h. Self-hosted on Fly is a flat ~$3/mo, no command quota, sub-ms latency over the private 6PN network, and the same applies to Meilisearch — paid Meilisearch Cloud starts at $30/mo for capacity we don&apos;t need.
        </Text>

        <Text className="mt-3 font-semibold text-sm">Constants resolution</Text>
        <Text size="small" className="text-ui-fg-subtle">
          <code>BACKEND_URL</code> resolves from <code>process.env.BACKEND_PUBLIC_URL</code> → <code>https://${'{FLY_APP_NAME}'}.fly.dev</code> (auto-detected on Fly) → <code>http://localhost:9000</code>. <code>NODE_TLS_REJECT_UNAUTHORIZED=0</code> is set as a Fly secret because DigitalOcean Postgres uses a self-signed cert — kept tightly scoped to the backend app only.
        </Text>
      </>
    ),
  },

  // ── 2. Order lifecycle ───────────────────────────────────────────────────────
  {
    id: "order-lifecycle",
    title: "Order lifecycle (the spine)",
    diagram: `sequenceDiagram
    autonumber
    participant C as Customer
    participant SF as Storefront
    participant BE as Backend
    participant ST as Staff (Admin)
    participant EM as Email (Resend)
    participant SL as Slack

    C->>SF: Add to cart from customizer
    SF->>BE: POST /store/carts/.../scp-line-items
    BE-->>SF: cart updated

    C->>SF: Checkout + pay
    SF->>BE: complete cart
    BE->>BE: emit order.placed
    BE->>BE: stamp production_stage=received
    BE->>BE: snapshot tax_exempt + perks
    BE->>BE: hydrate lifetime_value on payload
    BE->>BE: run automation rules
    BE->>EM: Order placed email (to customer + merchant)

    Note over BE: order moves through artwork + blanks + production tracks

    ST->>BE: Advance artwork to awaiting_approval
    BE->>BE: emit order.artwork_stage_changed
    BE->>EM: Artwork approval email (HMAC-signed link)
    EM->>C: deliver

    C->>SF: Click approve link
    SF->>BE: POST /store/artwork-approval
    BE->>BE: advance artwork_stage to approved

    ST->>BE: Upload production photo
    BE->>BE: store URL on order.metadata.production_photos

    ST->>BE: Advance to in_production
    BE->>BE: emit order.production_stage_changed
    BE->>BE: read latest photo from metadata
    BE->>EM: Stage email with photo + watcher BCCs
    EM->>C: deliver

    ST->>BE: Advance to shipped (Medusa core)
    BE->>EM: Order shipped email (Medusa core)

    ST->>BE: Advance to delivered
    Note over BE: 14 days later, NPS cron fires

    BE->>EM: NPS request email (HMAC-signed buttons)
    EM->>C: deliver
    C->>SF: Click 1-5 score
    SF->>BE: POST /store/nps
    BE->>BE: store on order.metadata.nps_star

    Note over BE: Daily stale-order scan at 08:00 UTC
    BE->>BE: Stamp is_stale on idle orders
    BE->>SL: Digest of newly-stale orders`,
  },

  // ── 3. Production-stage state machine ────────────────────────────────────────
  {
    id: "state-machine",
    title: "Production-stage state machine",
    diagram: `stateDiagram-v2
    [*] --> received: order.placed

    state Production {
        received --> in_production
        in_production --> quality_check
        quality_check --> shipped
        shipped --> delivered
        delivered --> [*]
    }

    state Artwork {
        [*] --> pending: parallel start
        pending --> in_review
        in_review --> awaiting_approval
        awaiting_approval --> approved: customer clicks Approve
        awaiting_approval --> in_review: customer requests changes
    }

    state Blanks {
        [*] --> not_started: parallel start
        not_started --> ordered
        ordered --> arrived
    }

    note right of Artwork
        runs in parallel
        with Production
    end note

    note right of Blanks
        runs in parallel
        with Production
    end note`,
    body: (
      <Text size="small" className="text-ui-fg-subtle mt-2">
        The three tracks run in parallel — nothing is hard-gated. Emails fire only on specific transitions
        (<code>STAGES_THAT_EMAIL</code> in <code>backend/src/lib/production-stage.ts</code>).
        Rollbacks don&apos;t re-send.
      </Text>
    ),
  },

  // ── 4. Customer marketing data flow ──────────────────────────────────────────
  {
    id: "marketing-data",
    title: "Customer marketing data flow",
    diagram: `flowchart LR
    subgraph SOURCES["Where customer data is captured"]
        SIGNUP[Storefront signup]
        NEWSLETTER[Newsletter footer form]
        QUOTE_REQ[Quote request]
        CHAT[Storefront chatbot · Claude Haiku]
    end

    subgraph CONSENT["Consent layer"]
        FLAG[customer.metadata.marketing_consent_email]
    end

    subgraph SEGMENT["Segmentation"]
        TAG[customer_tag]
        LTV_AUTO[Automation rule: LTV > $1500 = VIP tag]
        PH_COHORT[PostHog cohort sync]
    end

    subgraph CAMPAIGNS["Outbound campaigns"]
        ABANDONED[Abandoned cart cron]
        WINBACK[Win-back cron]
        REORDER[Reorder reminder cron]
        NPS_C[NPS request cron]
        CROSSSELL[Cross-sell PDP block]
    end

    SIGNUP --> FLAG
    NEWSLETTER --> FLAG
    QUOTE_REQ -.contact form.-> FLAG

    FLAG --> ABANDONED
    FLAG --> WINBACK
    FLAG --> REORDER
    FLAG --> NPS_C

    LTV_AUTO --> TAG
    PH_COHORT --> TAG
    TAG --> CROSSSELL

    TAG -.read by.-> ABANDONED
    TAG -.read by.-> WINBACK

    classDef consent fill:#fee2e2,stroke:#991b1b;
    classDef seg fill:#dcfce7,stroke:#166534;
    classDef camp fill:#dbeafe,stroke:#1e3a8a;
    class FLAG consent;
    class TAG,LTV_AUTO,PH_COHORT seg;
    class ABANDONED,WINBACK,REORDER,NPS_C,CROSSSELL camp;`,
    body: (
      <Text size="small" className="text-ui-fg-subtle mt-2">
        Consent gates every marketing send. If <code>marketing_consent_email</code> is <code>false</code>,
        none of the four crons email the customer. Tags are still applied — they just don&apos;t trigger automated outreach.
      </Text>
    ),
  },

  // ── 5. Quote → cart conversion ───────────────────────────────────────────────
  {
    id: "quote-conversion",
    title: "Quote → cart conversion",
    diagram: `sequenceDiagram
    autonumber
    participant C as Customer
    participant BYO as BYO form
    participant ST as Staff (Admin)
    participant BE as Backend
    participant EM as Email

    C->>BYO: Submit inquiry + mood board
    BYO->>BE: POST /store/quotes
    BE->>BE: Create quote (status=new)
    BE->>BE: Upload mood board to R2 (S3 storage)
    BE->>EM: Notify merchant team

    ST->>BE: Open quote in /app/quotes
    ST->>BE: Edit line items + total estimate
    ST->>BE: Set status=quoted
    ST->>BE: Copy accept link
    Note over ST,C: Staff pastes link into their own email to the customer

    C->>BE: GET /store/quotes/:id?sig=...
    BE-->>C: Render quote details

    C->>BE: POST /store/quotes/:id/accept
    BE->>BE: Verify HMAC signature
    BE->>BE: Pick region + sales_channel
    BE->>BE: createCartWorkflow
    BE->>BE: addToCartWorkflow per line_item with variant_id
    BE->>BE: Mark quote accepted + log event
    BE-->>C: cart_id + lines_added

    C->>C: Redirect to /cart
    Note over C,BE: Customer reviews + checks out via normal Stripe flow`,
  },

  // ── 6. Data ownership map ────────────────────────────────────────────────────
  {
    id: "data-ownership",
    title: "What writes where (data ownership map)",
    diagram: `flowchart LR
    subgraph CORE["Core tables (what writes)"]
        direction TB
        T_ORDER[order]
        T_CUSTOMER[customer]
        T_PRODUCT[product]
    end

    subgraph META["order.metadata (what gets written)"]
        direction TB
        M_STAGE[production_stage_*]
        M_ARTWORK[artwork_stage_*]
        M_BLANKS[blanks_stage_*]
        M_PHOTOS[production_photos]
        M_NPS[nps_score / nps_comment]
        M_PERKS[applied_perks]
        M_TAX[tax_exempt + reason]
        M_WATCHERS[watcher_emails]
        M_DEPOSIT[deposit_*]
        M_STALE[is_stale + stale_since]
        M_RECIPE_LINKS[print_recipe_ids]
    end

    subgraph CUST_META["customer.metadata"]
        direction TB
        CM_CONSENT[marketing_consent_*]
        CM_TAX[tax_exempt + reason]
        CM_LAST_WINBACK[last_winback_sent_at]
        CM_LAST_NPS[last_nps_request_sent_at]
        CM_LAST_REORDER[last_reorder_reminder_sent_at]
    end

    subgraph PRODUCT_META["product.metadata"]
        direction TB
        PM_XSELL[cross_sell_product_ids]
    end

    T_ORDER --> M_STAGE
    T_ORDER --> M_ARTWORK
    T_ORDER --> M_BLANKS
    T_ORDER --> M_PHOTOS
    T_ORDER --> M_NPS
    T_ORDER --> M_PERKS
    T_ORDER --> M_TAX
    T_ORDER --> M_WATCHERS
    T_ORDER --> M_DEPOSIT
    T_ORDER --> M_STALE
    T_ORDER --> M_RECIPE_LINKS

    T_CUSTOMER --> CM_CONSENT
    T_CUSTOMER --> CM_TAX
    T_CUSTOMER --> CM_LAST_WINBACK
    T_CUSTOMER --> CM_LAST_NPS
    T_CUSTOMER --> CM_LAST_REORDER

    T_PRODUCT --> PM_XSELL`,
    body: (
      <>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Rule of thumb: <strong>read/written in many places, queried for reports</strong> → new table.{" "}
          <strong>Snapshot of a moment in time, read in one or two places</strong> → metadata on order / customer / product.
        </Text>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          <strong>SC PRINTS custom tables</strong> (own rows, not metadata): design / design_version, wishlist_item, quote / quote_event, print_recipe, production_reject, lookbook_item, organisation / organisation_member, group_order / group_order_participant, customer_tag, customer_note, order_comment.
        </Text>
      </>
    ),
  },

  // ── 7. Group order → cart ────────────────────────────────────────────────────
  {
    id: "group-order",
    title: "Group order → cart conversion",
    diagram: `sequenceDiagram
    autonumber
    participant C as Coach (customer)
    participant SF as Storefront
    participant BE as Backend
    participant P as Participant

    C->>SF: Save a design in customizer
    C->>SF: /account/designs - Use for a group order
    SF->>BE: POST /store/group-orders
    BE-->>SF: public_token
    SF-->>C: Share link

    Note over C,P: Coach distributes share link

    P->>SF: GET /group-order/token
    SF->>BE: GET /store/group-orders/token
    BE-->>SF: group_order + design preview + product preview + participants
    SF-->>P: Render design + size picker

    P->>SF: Submit name + size + qty
    SF->>BE: POST /store/group-orders/token/participants
    BE-->>SF: participant

    Note over C: Coach closes the group order

    C->>SF: /account/group-orders - Convert to cart
    SF->>BE: POST /store/customers/me/group-orders/id/convert-to-cart
    BE->>BE: Match each participant size_label to variant_id
    BE->>BE: createCartWorkflow + addToCartWorkflow per matched line
    BE->>BE: Stamp group_order.status=converted + cart_id
    BE-->>SF: cart_id + lines_added + skipped list

    C->>SF: Review skipped + open /cart
    SF->>BE: Checkout via standard Stripe flow`,
    body: (
      <ul className="text-sm list-disc pl-5 space-y-1 text-ui-fg-subtle mt-2">
        <li>0 participants → 400 "Add at least one participant"</li>
        <li>Base product deleted → 404</li>
        <li>No size matches at all → 400 with full skipped list</li>
        <li>Some matches, some misses → cart built, skipped list returned</li>
        <li>Already converted → returns existing <code>cart_id</code>, no double-build</li>
        <li>Caller isn&apos;t the owner → 404 (don&apos;t leak existence)</li>
      </ul>
    ),
  },

  // ── 8. AI description generator ─────────────────────────────────────────────
  {
    id: "ai-descriptions",
    title: "AI description generator",
    diagram: `flowchart LR
    subgraph IN[Admin product detail]
        ADMIN[Admin clicks Generate]
        HINT[Optional hint]
    end

    subgraph BACKEND_AI[Backend]
        ROUTE[POST /admin/products/:id/generate-description]
        CTX[ProductContext]
        PROMPT[Pure prompt builder]
        SVC[generateProductDescriptions]
    end

    subgraph EXT[External LLM]
        OPENAI[OpenAI Chat Completions]
        ANTHROPIC[Anthropic Messages API]
    end

    PARSE[parseDescriptionResponse]
    DRAFTS[3 drafts: Short / Standard / Detailed]

    ADMIN --> ROUTE
    HINT --> ROUTE
    ROUTE --> CTX
    CTX --> PROMPT
    PROMPT --> SVC
    SVC -- AI_PROVIDER=openai --> OPENAI
    SVC -- AI_PROVIDER=anthropic --> ANTHROPIC
    OPENAI --> PARSE
    ANTHROPIC --> PARSE
    PARSE --> DRAFTS
    DRAFTS --> ADMIN

    classDef ext fill:#fef3c7,stroke:#92400e;
    class OPENAI,ANTHROPIC ext;`,
    body: (
      <Text size="small" className="text-ui-fg-subtle mt-2">
        Never sends pricing, SKUs, or stock to the LLM — only safe-keyed metadata (<code>fabric_blend</code>,{" "}
        <code>gsm</code>, <code>fit</code>, <code>country_of_origin</code>, <code>decoration_methods</code> etc.).
        The pure prompt builder (<code>prompt.ts</code>) is fully unit-tested with no network dependency.
      </Text>
    ),
  },

  // ── 9. Print queue optimiser ─────────────────────────────────────────────────
  {
    id: "print-queue",
    title: "Print queue optimiser",
    diagram: `flowchart LR
    subgraph IN[Inputs]
        ORDERS[(In-flight orders received to in_production)]
        LINES[Line item metadata customizerDesign / decorationDesign]
        META[Order metadata: decoration_method, ink_colours, deadline_at, is_stale]
        RECIPES[(Linked print_recipe ids)]
    end

    subgraph PIPE[Get queue]
        SPLIT[Split each order into N jobs one per decoration method]
        EXTRACT[Extract method + colours from line items fall back to order metadata]
    end

    subgraph PURE[Pure buildPrintQueue]
        SIG[colourSignature: lowercase + sorted + dedupe]
        BUCKETS[Bucket jobs by method + colours]
        SORT_J[Sort within bucket: stale then deadline asc then FIFO]
        SORT_B[Sort buckets: has_stale then total_units desc then alphabetical]
    end

    OUT[(Ordered batches rendered at Production - Print queue tab)]

    ORDERS --> EXTRACT
    LINES --> EXTRACT
    META --> EXTRACT
    EXTRACT --> SPLIT
    SPLIT --> SIG
    RECIPES --> BUCKETS
    SIG --> BUCKETS
    BUCKETS --> SORT_J
    SORT_J --> SORT_B
    SORT_B --> OUT`,
    body: (
      <Text size="small" className="text-ui-fg-subtle mt-2">
        Pure compute — no DB writes, no caching. An order with multiple decoration techniques appears in
        multiple buckets (deliberate, so each machine setup runs once per technique). Same colour set in
        different order or case → same bucket.
      </Text>
    ),
  },

  // ── 10. External services ────────────────────────────────────────────────────
  {
    id: "external-services",
    title: "External services",
    body: (
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-ui-border-base">
              <th className="text-left py-2 pr-4 font-semibold text-ui-fg-base">Service</th>
              <th className="text-left py-2 pr-4 font-semibold text-ui-fg-base">Purpose</th>
              <th className="text-left py-2 pr-4 font-semibold text-ui-fg-base">Auth env var</th>
            </tr>
          </thead>
          <tbody className="text-ui-fg-subtle">
            {[
              ["Vercel", "Storefront hosting (Next.js 15) — global edge, Sydney POP", "—"],
              ["Fly.io (Sydney)", "Backend + self-hosted Redis + self-hosted Meilisearch", "FLY_API_TOKEN (CI only)"],
              ["DigitalOcean Managed Postgres (SYD1)", "Primary database — Postgres 16, self-signed cert", "DATABASE_URL"],
              ["Cloudflare R2 (Oceania)", "File storage — photos, mood boards, lookbook, customer originals. S3-compatible, accessed via the legacy 'MinIO' module name in the codebase", "MINIO_* (endpoint + access/secret + bucket + public URL)"],
              ["Redis 7 (self-hosted on Fly)", "Event bus + workflow engine + distributed locking. Private 6PN, no public exposure", "REDIS_URL"],
              ["Meilisearch v1.10 (self-hosted on Fly)", "Catalog search — separate Fly app sc-prints-search", "MEILISEARCH_HOST + MEILISEARCH_ADMIN_KEY"],
              ["Resend", "All outbound email — sender domain scprints.com.au", "RESEND_API_KEY"],
              ["Stripe", "Card payments — Medusa checkout + admin-created Payment Links (two webhook endpoints)", "STRIPE_API_KEY + STRIPE_WEBHOOK_SECRET + STRIPE_PAYMENT_LINK_WEBHOOK_SECRET"],
              ["PostHog Cloud (US)", "Product analytics + cohort sync + LLM tracking", "POSTHOG_API_KEY + POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID + POSTHOG_HOST"],
              ["GA4", "E-commerce funnel tracking (storefront-side)", "NEXT_PUBLIC_GA_MEASUREMENT_ID"],
              ["Google GSC + GA4 (admin reporting)", "Read via service account that impersonates info@scprints.com.au (DWD)", "GOOGLE_SERVICE_ACCOUNT_JSON + GSC_SITE_URL + GA4_PROPERTY_ID"],
              ["ShipStation", "Shipping label rates + tracking", "SHIPSTATION_API_KEY + SHIPSTATION_WEBHOOK_SECRET + SHIPSTATION_WAREHOUSE_*"],
              ["AS Colour API", "Supplier catalog + hourly inventory + dropship orders", "ASCOLOUR_SUBSCRIPTION_KEY + ASCOLOUR_PRICELIST_*"],
              ["FashionBiz API", "Supplier catalog + daily inventory (no dropship endpoint)", "FASHIONBIZ_API_TOKEN + FASHIONBIZ_BRANCH + FASHIONBIZ_COST_ADJUSTMENT"],
              ["Aussie Pacific API", "Supplier catalog + daily inventory + dropship orders (submit-only, no status endpoint)", "AUSSIE_PACIFIC_API_TOKEN + AUSSIE_PACIFIC_COST_ADJUSTMENT"],
              ["Anthropic", "Storefront chatbot (Claude Haiku) + admin AI description generator (when AI_PROVIDER=anthropic)", "ANTHROPIC_API_KEY + ANTHROPIC_MODEL"],
              ["OpenAI (optional)", "AI description generator (when AI_PROVIDER=openai)", "OPENAI_API_KEY + OPENAI_MODEL"],
              ["Slack (optional)", "Production-floor stale-order alerts", "SLACK_PRODUCTION_WEBHOOK_URL"],
              ["Inbound email (optional)", "Customer email replies → order comments", "ORDER_INBOX_DOMAIN + INBOUND_EMAIL_SECRET"],
            ].map(([svc, purpose, auth]) => (
              <tr key={svc} className="border-b border-ui-border-base last:border-0">
                <td className="py-2 pr-4 font-medium text-ui-fg-base whitespace-nowrap">{svc}</td>
                <td className="py-2 pr-4">{purpose}</td>
                <td className="py-2 font-mono text-xs">{auth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },

  // ── 11. Cron schedule ────────────────────────────────────────────────────────
  {
    id: "cron-schedule",
    title: "Cron schedule (all UTC)",
    diagram: `gantt
    title Daily cron schedule (UTC)
    dateFormat HH:mm
    axisFormat %H:%M

    section Inventory + analytics
    AS Colour inventory (hourly)   :00:00, 1h
    Cross-sell refresh             :02:00, 30m
    PostHog cohort sync            :03:30, 30m
    FashionBiz inventory           :04:00, 30m
    Aussie Pacific inventory       :05:00, 30m
    SEO analytics                  :05:00, 30m
    Tier price regeneration        :06:00, 30m

    section Production
    Stale-order scan               :08:00, 15m
    Tasks overdue notification     :09:00, 15m

    section Marketing
    NPS request                    :22:00, 30m
    Abandoned-cart reminder        :23:15, 30m
    Reorder reminder               :23:30, 30m
    Report alerts                  :23:45, 15m
    Quote expiry                   :23:45, 15m`,
    body: (
      <>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Every cron is gated by an <code>*_ENABLED=true</code> env var — dev / staging stays quiet by default.
          Continuous schedules that don&apos;t fit on the daily Gantt: AS Colour <strong>order status sync</strong> every 15 minutes;
          POS <strong>session expiry</strong> hourly at <code>:30</code>.
        </Text>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Weekly / monthly: <strong>win-back</strong> fires Mondays 00:00 UTC; <strong>monthly digest</strong> fires the 2nd at 22:00 UTC.
        </Text>
      </>
    ),
  },

  // ── 12. Where things live ────────────────────────────────────────────────────
  {
    id: "code-locations",
    title: "Where things live in the codebase",
    body: (
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-ui-border-base">
              <th className="text-left py-2 pr-4 font-semibold text-ui-fg-base">Feature</th>
              <th className="text-left py-2 font-semibold text-ui-fg-base">File / directory</th>
            </tr>
          </thead>
          <tbody className="text-ui-fg-subtle">
            {[
              ["Production stage list + emails", "backend/src/lib/production-stage.ts"],
              ["Stage-changed subscriber", "backend/src/subscribers/order-production-stage-changed.ts"],
              ["Artwork approval flow", "backend/src/services/artwork-approval/ + backend/src/api/store/artwork-approval/"],
              ["LTV computation", "backend/src/services/customer-ltv/compute-ltv.ts"],
              ["Studio aggregator", "backend/src/services/studio-dashboard/build.ts"],
              ["Quote → cart conversion", "backend/src/api/store/quotes/[id]/accept/route.ts"],
              ["Cross-sell recommendations", "backend/src/services/cross-sell-recommendations/"],
              ["Production ETA", "backend/src/services/production-eta/"],
              ["Print queue optimiser", "backend/src/services/print-queue/build.ts + get-queue.ts"],
              ["AI description generator", "backend/src/services/ai-copy/prompt.ts + generate.ts"],
              ["Group order convert-to-cart", "backend/src/api/store/customers/me/group-orders/[id]/convert-to-cart/route.ts"],
              ["Stale-order scan", "backend/src/services/stale-orders/scan.ts"],
              ["Order timeline aggregator", "backend/src/services/order-timeline/build.ts"],
              ["Customer journey aggregator", "backend/src/services/customer-journey/build.ts"],
              ["Inbound email webhook", "backend/src/api/hooks/inbound-email/route.ts"],
              ["Tax invoice HTML", "backend/src/api/store/customers/me/orders/[id]/invoice/route.ts"],
              ["Email templates", "backend/src/modules/email-notifications/templates/"],
              ["Automation rule engine", "backend/src/services/automation-rules/evaluate.ts"],
            ].map(([feature, path]) => (
              <tr key={feature} className="border-b border-ui-border-base last:border-0">
                <td className="py-2 pr-4 text-ui-fg-base">{feature}</td>
                <td className="py-2 font-mono text-xs">{path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },

  // ── 13. New feature checklist ────────────────────────────────────────────────
  {
    id: "new-feature",
    title: "When you add a new feature — checklist",
    body: (
      <ol className="text-sm list-decimal pl-5 space-y-2 text-ui-fg-subtle mt-2">
        <li><strong>Does this state live across multiple read paths?</strong> → new entity, not metadata.</li>
        <li><strong>Does it need a migration?</strong> → add to <code>backend/src/modules/&#x3C;name&#x3E;/migrations/</code> — Medusa auto-runs on boot.</li>
        <li><strong>Does it fire an event?</strong> → add a subscriber under <code>backend/src/subscribers/</code>.</li>
        <li><strong>Does it need to react to a schedule?</strong> → add to <code>backend/src/jobs/</code> and pick a free slot from the Gantt above.</li>
        <li><strong>Is it gated for safety?</strong> → add an <code>*_ENABLED=true</code> env var with <code>false</code> default.</li>
        <li><strong>Does staff need to see / interact with it?</strong> → admin widget at the right zone, or new route under <code>backend/src/admin/routes/</code>.</li>
        <li><strong>Does the customer see it?</strong> → storefront page + data lib under <code>storefront/src/lib/data/</code>.</li>
        <li><strong>Does it produce a number worth tracking?</strong> → emit a PostHog event with <code>getPostHog()?.capture(...)</code>.</li>
        <li><strong>Should staff understand it without asking?</strong> → add a <code>&#x3C;HelpTooltip&#x3E;</code> next to the heading explaining the <em>why</em> and the gotchas.</li>
      </ol>
    ),
  },
]

// ─── Page component ────────────────────────────────────────────────────────────

const SystemMapPage = () => {
  const [active, setActive] = useState<string>(SECTIONS[0].id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-ui-border-base">
        <div>
          <Heading level="h1">System map</Heading>
          <Text size="xsmall" className="text-ui-fg-muted">
            How every service, module, event, and cron connects. Source of truth: <code>Docs/BACKEND_FLOW.md</code>
          </Text>
        </div>
        <Badge color="blue">11 diagrams</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr]">
        <nav className="border-r border-ui-border-base p-4 lg:sticky lg:top-0 lg:self-start lg:max-h-[85vh] lg:overflow-y-auto">
          <ul className="flex flex-col gap-y-1 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`block rounded px-2 py-1 leading-snug ${
                    active === s.id
                      ? "bg-ui-bg-subtle font-semibold text-[var(--brand-primary,#7c3aed)]"
                      : "text-ui-fg-base hover:bg-ui-bg-subtle"
                  }`}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-6 flex flex-col gap-y-12">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <Heading level="h2" className="mb-1 text-ui-fg-base">
                {s.title}
              </Heading>
              <div className="mb-4 h-px bg-ui-border-base" />
              {s.diagram && (
                <>
                  <div className="rounded-xl border border-ui-border-base bg-white p-6 shadow-sm overflow-hidden">
                    <MermaidDiagram chart={s.diagram} title={s.title} />
                  </div>
                  <p className="mt-1.5 text-center">
                    <span className="inline-flex items-center gap-1 text-xs text-ui-fg-muted select-none">
                      <ArrowsPointingOut className="w-3 h-3" /> Click ↗ to expand fullscreen
                    </span>
                  </p>
                </>
              )}
              {s.body && <div className="mt-4">{s.body}</div>}
            </section>
          ))}
        </div>
      </div>
    </Container>
  )
}

// Page is now embedded as "System map" tab in Help & guide;
// direct URL /app/system-map still works for deep links

export default SystemMapPage
