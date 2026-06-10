# Site Speed Remediation Plan — LCP + CLS (field data 5–10 June 2026)

Investigation date: 2026-06-10. All root causes below are grounded in code reads + live production probes
(curl against `medusajs-2-0-for-railway-vercel.vercel.app`, served-HTML inspection, stream-timing measurement).
Confidence is marked where a claim is inferred rather than measured.

## TL;DR — what is actually wrong

**The report's instinctive hypotheses (unoptimised images, missing width/height everywhere, web-font reflow,
render-blocking JS) are mostly NOT the causes here.** Verified clean: fonts (single `next/font` family,
`display:swap`, self-hosted), image optimisation (live HTML serves `/_next/image` URLs), third-party scripts
(GA4 `afterInteractive`, PostHog idle-deferred, chatbot lazy + fixed-position).

The real mechanisms:

1. **LCP = backend data latency, by architecture.** With `cacheComponents` (PPR) on, every page paints a fast
   static shell (hence good FCP) but the LCP element (product grid, hero, gallery) always sits inside a dynamic
   Suspense hole that streams only after the Vercel→Fly data fetches finish. When the Next data cache is warm
   that's fine; when it's cold the user stares at a skeleton for the full backend wait. **Measured live:
   `/au/categories/mens-t-shirts` cold = 14.5s total stream (field p75 LCP: 14,280ms — an exact match);
   warm = 1.8s.** TTFB was 0.25s in both cases — the report's "TTFB may be a factor" is ruled out.
2. **The cache is cold far more often than designed.** Three compounding reasons:
   - 3–9 storefront deploys/day during the field window — every deploy invalidates all `"use cache"` entries.
   - The `/api/warm-cache` cron runs fine on the Pro plan (verified live: route responds in ~300ms with all
     four facet caches warm) — but it **only warms the four facet queries** (tags, types, brands, nav menu).
     The per-category listing entries (`getProductsListWithSort` per category × sort × filter × page) and the
     full-route caches are never warmed, so they go cold on every deploy / tag purge / 24h expiry.
   - `revalidateTag("products")` fires from backend product writes (importers, inventory syncs, image crons)
     and purges every listing cache entry at once.
3. **The default category listing path is the slowest query on the site.** Ironically, filtered/price-sorted
   views now go through Meilisearch (`LISTING_VIA_SEARCH=true` is live — verified by probing a
   guaranteed-cold filtered URL: 4.0s vs the 30s+ a catalog scan would take), but the **default**
   created_at view still hits Medusa with the heavy field expansion (`calculated_price` + options + inventory
   across every variant of 12 products — hundreds of variants for AS Colour/Aussie Pacific styles). That's the
   14.5s cold path.
4. **CLS is dominated by skeleton→content swap geometry mismatch**, not unsized images. Every failing page
   paints a generic skeleton (from `(main)/loading.tsx` or a route-level fallback) whose shape bears no
   resemblance to the real content; when the dynamic hole streams in seconds later, everything below
   (including the footer, which renders in the shell) reflows. Verified in served HTML: skeleton + real
   content + `$RC` swap scripts present in the same document on /brands, /products/*, /categories/healthcare,
   /byo. Three page-specific unsized-element bugs compound it (dtf-builder canvas, lookbook masonry,
   sticky-header row collapse).

**Field-data caveat:** the 5–10 June window spans FOUR homepage hero implementations (particle-logo canvas →
none → text-only → image hero, commits 356b4cfe/edb7a050/69637d8c/959bb549). Re-measure against the current
build after fixes; don't chase day-to-day deltas inside that window.

---

## Phase 0 — verify before optimising (half a day)

| # | Action | Why |
|---|--------|-----|
| 0.1 | Sanity-check Vercel dashboard → Usage → Image Optimization spend/volume. The project is on **Pro** (usage-billed beyond the included transformation quota — no hard 402 cliff like the historical Hobby-era incident documented in `storefront/next.config.js:24-31` + `catalog-image-url.ts`). Optimization is confirmed active in live HTML. | Confirms the image pipeline is healthy and quantifies cost headroom before enabling AVIF (`images.formats`) — which can ship without quota anxiety on Pro. |
| 0.2 | Enable LCP/CLS **attribution** in the web-vitals capture (element + shift-source breakdown) in PostHog. | Post-fix verification needs to show *which* element/shift moved, not just the score. |

---

## Phase 1 — kill the cold-cache LCP (category 14.3s, home 4.1s, best-sellers 4.5s, lookbook 3.1s)

### 1.1 Route DEFAULT category/store listings through Meilisearch (highest-leverage single change)
`getProductsListWithSort` (`storefront/src/lib/data/products.ts:500`) only delegates to
`getListingViaSearch` for price sorts / client filters; `created_at`/`title` with no filters take the
"API pagination" path with the heavy `STORE_PRODUCT_FIELDS` expansion — measured 14.5s cold. The Meili path +
slim `LISTING_PRODUCT_FIELDS` hydration is 4.0s cold. The CLAUDE.md cutover notes already anticipated this
("to fully unify, also route them through `getListingViaSearch`"). Meili indexes `created_at_ts` as sortable.
- Files: `storefront/src/lib/data/products.ts`, `storefront/src/lib/data/listing-search.ts`
- Expected: category cold-stream 14.5s → ~4s; warm unchanged (~1.8s). Keep the legacy path as the
  fallback-on-Meili-error branch (already structured that way).

### 1.2 Fix the silently-broken cache options (confirmed bug, ~1h)
`getHomeSections` (`storefront/src/lib/data/home-sections.ts:14-30`) and `getProductionEta`
(`storefront/src/lib/data/production-eta.ts:14-24`) pass `next: { tags, revalidate }` **inside the `headers`
option** of `sdk.client.fetch` — the Medusa SDK coerces it to a junk HTTP header and the cache options are
dropped. Both endpoints hit Fly **uncached on every render**: home-sections blocks every homepage render,
production-eta blocks every homepage AND PDP render.
- Convert both to the repo's blessed pattern: `"use cache"` + `cacheTag(...)` + `cacheLife({ revalidate: 300–900,
  stale: 86400, expire: 86400 })` (copy `storefront/src/lib/data/regions.ts:7-9`).
- **Sweep for repeats:** `grep -rn "headers: { \.\.\.cacheInit\|headers: {[^}]*next:" storefront/src/lib/data/`.

### 1.3 Extend the warmer's coverage (the cron runs fine on Pro — it just warms the wrong things)
Verified live: `/api/warm-cache` responds in ~300ms with all four facet caches warm, so the `*/30` Vercel cron
is doing its job. But it only warms facets (tags/types/brands/nav) — NOT the per-category listing entries or
full-route caches, which is exactly where the measured 14.5s cold path lives.
- **Extend `storefront/src/app/api/warm-cache/route.ts`** to also fetch the top-N page URLs (home,
  /au/categories/mens, mens-t-shirts, mens-polos, best-sellers, lookbook, brands) — or call the underlying
  listing functions for the top categories' default view — so the listing + full-route entries stay warm.
  This is what converts "warm = 1.8s" from a lucky case into the p75 case.
- Consider tightening the schedule to `*/15` (fine on Pro) and triggering one warm pass post-deploy
  (deploy webhook), since each deploy cold-starts the data cache.
- Housekeeping: `CRON_SECRET` is NOT currently set in the Vercel prod env (verified via `vercel env ls`), so
  the route is publicly triggerable — set it so the auth gate the route already implements actually engages.

### 1.4 Cache the lookbook reads
`getLookbookPage` + `getLookbookHomeRail` (`storefront/src/lib/data/lookbook.ts`) are fully uncached;
the home rail makes 1–2 sequential round-trips with a `Math.random()` offset per render and keeps the home
page permanently dynamic.
- Wrap `getLookbookPage` in `"use cache"` + `cacheTag("lookbook")` + `cacheLife({revalidate: 600, stale: 86400,
  expire: 86400})` (copy `listBrands` in `brands.ts:41-48`); fire the `lookbook` tag from the admin CRUD routes
  via the existing revalidate endpoint.
- Home rail: fetch a cached pool (e.g. 32 items), randomise the window client-side or in the uncached wrapper.

### 1.5 Homepage: stop blocking the hero on the data chain
`page.tsx` awaits getRegion → getHomeSections → getProductsByHandle/listBundles → Promise.all(instagram, eta,
lookbook) before returning ANY JSX — but the hero and ~6 other sections have zero data dependencies
(`storefront/src/app/[countryCode]/(main)/page.tsx:164-281`).
- Return JSX immediately with `<HomeHero />` + static sections inline; move each data-dependent rail into its
  own async server component inside `<Suspense>` with a height-reserving fallback. With PPR this puts the hero
  (the LCP element, already `priority`) into the prerendered shell → homepage LCP collapses toward FCP.

### 1.6 Customizer pages: parallelise the sequential server chain
`customizer-v2/page.tsx:146-235` (and `customizer/page.tsx`) run 4–6 awaits strictly sequentially, including a
48-product full-expansion catalog list on the default no-`?handle` visit; the hero preload streams only after
the whole chain (measured: hero preload at byte 164k/300k, stream done at 3.7s).
- `Promise.all` the independent fetches (region / picker list / tier / print profile); set
  `CUSTOMIZER_DEFAULT_PRODUCT_HANDLE` so the default visit is a 1-product lookup; slim the fallback's fields.

---

## Phase 2 — put the LCP element in (or right behind) the shell

### 2.1 Eager-load the first row of grid images (every listing surface)
All product-card images are `next/image fill` + lazy with no `priority`/`fetchPriority` — confirmed in live
HTML on best-sellers (8/8 lazy) and the same components serve category/store/brand pages and home rails. After
streaming, the LCP image still waits for hydration + IntersectionObserver.
- Add an optional `priority?: boolean` prop to `ProductPreview` (`storefront/src/modules/products/components/product-preview/`)
  and `ProductListingCard` (`.../product-listing-card/index.tsx:~95-125`), threaded to the `<Image>`.
- Set it for the first 4 tiles in `PaginatedProducts` (`storefront/src/modules/store/templates/paginated-products.tsx:145`),
  best-sellers (`best-sellers/page.tsx:144-162`), and the FIRST home rail. Lookbook: `priority={i < 4}` in
  `lookbook-gallery.tsx:87-94` (currently 24/24 lazy — the single biggest lever on its 3.1s LCP).

### 2.2 PDP: let the gallery prerender; stop blocking on cookies
`ProductTemplate` awaits `getCustomerTier()` (cookie read → forces the whole subtree dynamic) and
`getPrintProfileForProduct()` before any JSX (`storefront/src/modules/products/templates/index.tsx:81,141`),
but both are only consumed inside the studio slot. Measured: hero image preload at byte ~372k of an 812k doc.
- Restructure so the landing (gallery/title/CTA/swatches) renders from cached product data; resolve tier +
  print-profile inside a Suspense-wrapped studio slot (pass as promises or fetch in an async child).
- Verify: hero preload appears in the first ~10KB of served HTML.

### 2.3 Lazy-load the studio bundle (fabric.js) behind the open action
578KB gz (1.8MB raw) of eager client JS ships on every PDP/customizer page including all of fabric v7 —
measured in live HTML; the studio UI only mounts on click (mount gates already exist, download gates don't).
- `const CustomizerTemplate = dynamic(() => import("@modules/customizer/templates"), { ssr: false })` in
  `embedded-product-customizer.tsx`; call `.preload()` on CTA `pointerenter` to hide the chunk fetch.
  The repo already uses this pattern (`chat-widget-lazy`).
- Deep-link entries (`?design=`/`?reorder=`): also `ReactDOM.preload` the garment image (known server-side as
  `defaultGarmentImage`) and add `fetchpriority="high"` on the `CanvasStage` img for first paint.

### 2.4 Contact page: SSR the wordmark
The LCP element (wordmark in the 72vh particle hero) renders only after hydrating a 4,747-line client
component via `createPortal` — zero hero markup in served HTML (verified; page is edge-cached, TTFB 0.16s,
yet field LCP is 4.0s).
- Move the static `<img>` out of the portal into server-rendered section markup as `next/image` with
  `priority` (`storefront/src/modules/home/components/home-particle-logo-hero/index.tsx:4633-4644,4725-4745`);
  keep the opacity fade hand-off to the canvases.

### 2.5 Preconnect hygiene (small)
`storefront/src/app/layout.tsx:126-144` preconnects `api.scprints.com.au` (cutover hasn't happened — wasted)
and misses `cdn11.bigcommerce.com` (FashionBiz/Gildan grid images). Derive the backend preconnect from
`NEXT_PUBLIC_MEDUSA_BACKEND_URL`; add bigcommerce.

---

## Phase 3 — CLS: fix the swaps and the three unsized elements

### 3.1 Replace the generic `(main)/loading.tsx` (cross-cutting — helps every failing page)
Every (main) route paints: nothing → generic skeleton (1 card + 6×h-44 tiles) → real content, via in-document
`$RC` swaps — even fully-prerendered static pages like /byo (verified in served HTML; the swap displaces the
LCP text and shifts the footer). The skeleton matches no real page.
- Slim it to a non-shifting indicator (thin top progress bar / minimal block), and rely on per-route
  `loading.tsx` only where streaming actually happens. Audit whether the two layout-level
  `<Suspense fallback={null}>` wrappers (`app/layout.tsx:160-166`, `(main)/layout.tsx:15`) can be scoped tighter.

### 3.2 PDP skeleton → mirror the studio landing (fixes the worst PDP CLS 0.390)
`SkeletonProductPage` is the legacy 3-column shape (text-first + aspect-**square** image); the real landing is
gallery-FIRST (order-1, lg:col-span-7, aspect-[3/4] capped 62vh). Copy `customizer-v2/loading.tsx` (already
nearly right) and match `ImageGallery` heroClassName exactly.
- Files: `storefront/src/app/[countryCode]/(main)/products/[handle]/loading.tsx`,
  `storefront/src/modules/skeletons/templates/skeleton-product-page/index.tsx`
- Cheap; ship first. 2.2 then removes the swap entirely.

### 3.3 Brands page (worst CLS site-wide, 0.404)
`listBrands` is already fully cached, yet the page still streams through a badly mismatched skeleton
(8 fixed h-44 tiles vs 13 variable-height tiles + hero + CTA).
- Hoist the static hero out of `BrandsContent`; render the grid without the Suspense boundary (cached data,
  SWR — no blocking risk). If a boundary must stay, make the fallback geometrically truthful (13 tiles,
  matching min-height). Add explicit dimensions to brand logo `<img>`s (`brands/page.tsx:144-151`).

### 3.4 Category pages: skeleton geometry + empty state + healthcare data
- `SkeletonProductGrid` renders 8 tiles; real grid is 12 (`PRODUCT_LIMIT`) with a taller card (swatch row).
  Match count + height (`storefront/src/modules/skeletons/`).
- `PaginatedProducts` renders a bare empty `<ul>` when count=0 — on /au/categories/healthcare the 8-tile
  skeleton collapses to nothing (verified live: empty products-list at byte 109,728/109,803). Add an explicit
  empty-state block sized near the skeleton.
- **Data bug:** healthcare currently has ZERO products. Verify category assignment (HEALTHCARE_BRAND_HANDLES /
  tags / title keywords in `backend/src/lib/shop-categories.ts`), run `DRY_RUN=1 backfill-product-taxonomy.ts`,
  check healthcare-* counts in admin.

### 3.5 DTF builder canvas (CLS 0.261)
The `<canvas>` SSRs with no width/height → paints at 300×150, then Fabric resizes it to e.g. 720×1200 after JS
loads. `widthPx`/`heightPx` are computed synchronously from the variant and available at SSR
(`storefront/src/modules/dtf-builder/gangsheet-builder.tsx:107-108,679`).
- Render `<canvas width={widthPx} height={heightPx} style={{maxWidth:'100%'}}>` + reserve the wrapper with
  aspect-ratio/min-height.

### 3.6 Lookbook masonry (CLS 0.154)
Tiles render `width={0} height={0} h-auto` (zero reserved space) inside CSS multi-column masonry with
`columnFill:'balance'` — every image load re-balances ALL columns. The model stores no dimensions.
- Root fix: add `image_width`/`image_height` to `lookbook_item` (+ migration — **mind the repo gotcha:
  migration timestamps are global across modules**), capture at admin upload, backfill existing rows by
  probing R2, pass through the store route, render real `width/height`.
- Interim one-liner if needed sooner: fixed `aspect-[4/5]` + object-cover on all tiles.

### 3.7 Sticky header row-2 collapse (global desktop CLS, recurring)
The 48px audience nav animates in-flow `max-height` 0↔3rem on scroll-direction change inside a sticky header —
every flip shifts the whole page; scroll does NOT get the CLS user-input exclusion. `overflow-anchor:none` was
applied document-wide to fight the feedback loop, removing native shift compensation everywhere.
- Animate with `transform: translateY` + opacity (compositor-only) or take row 2 out of flow; then delete the
  `overflow-anchor` hack (`storefront/src/modules/layout/components/header-shell/index.tsx:245-252`,
  `storefront/src/styles/globals.css:31-41`).

### 3.8 Small residuals
- `FrequentlyBoughtTogether` streams into `fallback={null}` → give it a height-matched skeleton rail
  (`products/templates/index.tsx:177`). `ProductionEtaStrip` skeleton can resolve to `null` → render a
  same-height placeholder instead.
- Carousel arrows pop in post-hydration (`featured-products-carousel/index.tsx:33-86`) → render disabled
  arrows at SSR or reserve the slot size.

---

## Phase 4 — verify (after each phase, and 7 days after the last)

1. `curl -o /dev/null -s -w 'ttfb:%{time_starttransfer} total:%{time_total}'` ×2 on the 6 worst URLs —
   cold stream must be <4s post-Phase-1, <2.5s post-Phase-2.
2. Served-HTML checks: hero/grid image preloads in the first ~10KB; first-row imgs not `loading="lazy"`;
   no `$RC` skeleton swap on /brands.
3. Lighthouse mobile (throttled) on: mens-t-shirts, home, as-colour-5080 PDP, brands, dtf-builder, lookbook.
4. Field p75 via the same dashboard this report came from — compare ONLY post-fix builds (the 5–10 June
   window mixed four homepage builds).
5. Vercel dashboard: image-transformation usage trend; confirm the extended warm-cache cron fires every
   15–30 min (Vercel → Logs, filter `/api/warm-cache`) and that category cold-probes stay <4s between runs.

## Suggested sequencing

| Order | Items | Effort | Expected movement |
|-------|-------|--------|-------------------|
| Week 1 (launch blockers) | 1.2, 1.3, 2.1, 3.2, 3.5, 0.1 | ~2 days | Category/lookbook/best-sellers LCP tail collapses; PDP CLS 0.39 → <0.1; dtf CLS fixed |
| Week 1–2 | 1.1, 1.4, 1.5, 3.1, 3.3, 3.4 | ~3 days | Category cold 14.5s → ~4s; home LCP → ~FCP; brands CLS 0.40 → <0.1; healthcare fixed |
| Week 2–3 | 2.2, 2.3, 1.6, 2.4, 3.6, 3.7 | ~4 days | PDP/customizer LCP to good; lookbook CLS root-fixed; global desktop CLS stops recurring |
| Anytime | 2.5, 3.8, AVIF (`images.formats` — fine on Pro, just sanity-check 0.1 first) | hours | Polish |

## Explicitly ruled out (don't spend time here)

- Fonts (next/font, swap, single family, no external CSS) — verified clean.
- Third-party scripts (GA4/PostHog/chatbot all deferred, fixed-position) — verified clean.
- TTFB / function region (syd1 pin confirmed; TTFB 0.16–0.54s everywhere) — fine.
- `SafeImage` fallback (dimension- and fill-safe at current call sites) — not a CLS source.
- The digital-rain hero (no longer on the homepage; was CLS-safe anyway).
- INP — healthy; the 578KB eager JS hasn't hurt interactivity, only LCP bandwidth contention.
