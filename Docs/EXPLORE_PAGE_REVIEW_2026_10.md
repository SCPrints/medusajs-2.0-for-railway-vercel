# `/au/explore` review — speed + "space theme" (2026-10-11)

> **Status (2026-10-11, same day):** Option C ("fast + full space theme") was implemented. Backend route rewritten (SQL counts + in-process cache + no prices), page made static, auto-prefetch removed, layout engine fixed, orbit/sun/planet/moon theme with the shared starfield, cockpit HUD + phone sheet, `--nav-height` defined, graph deps moved into `storefront/package.json` and the committed root `node_modules/` untracked. See the "Explore" section in `CLAUDE.md`. Backend needs `cd backend && fly deploy`; storefront ships on push to master.

Review only at the time of writing. No code changed. Live page, source, backend route and Vercel/PostHog signals were inspected; five independent reviewers (backend data, Next loading, canvas rendering, visual/space theme, product value) each had a skeptic re-check every finding against the code. Everything below survived that pass unless marked *unverified*.

## TL;DR

- **It is slow for four stacked reasons**, each individually fixable in hours: the backend rescans the whole catalog on every call, the page is a dynamic render because of an unused `?focus=` query param, the page auto-fires three 2–16 s brand expansions on every visit, and the client wipes the layout and re-simulates with the physics engine effectively off.
- **It looks dull for one simple reason**: the whole palette, label halo and logo treatment in `style.ts` were authored for a dark "Obsidian" canvas, but the section renders on the site's `#eeeeee`. The space theme you want is mostly "switch the background on and add orbits" — the starfield already exists in `space-hero`.
- **Nobody is visiting it**: PostHog, last 30 days: 1 visitor, 2 pageviews. No page links to it (the only "explore" matches in `src` are copy, not hrefs). It is in `sitemap.xml`, so Google is the only visitor, and Google gets a page that throws React #419 on every load.
- **Two real bugs ride along**: the hover tooltip shows B2B tier prices to guests (Gildan 2000B shows $9.31; the PDP says $27.21), and the repo-root `node_modules/` (17 MB, 1,563 files) is committed to git because the graph libraries live in the root `package.json` instead of `storefront/package.json`.

## Measured (production, 2026-10-11)

| What | Result |
| --- | --- |
| `GET /store/graph?mode=summary` (Fly, direct) | 3.6–4.5 s TTFB, 67 KB, 354 nodes (172 categories, 143 tags, 25 types, 13 brands), 353 links |
| `mode=brand&brand=AS Colour&limit=200` | 9.7 s curl, 16.3 s in-browser, 166 KB, 200 products + 827 links |
| `mode=brand&brand=Gildan` | 2.5–3.3 s, 35 products |
| HTML document (`x-vercel-cache: HIT`) | 169 KB, ends cleanly, contains the "Loading catalog…" fallback and 5 pending Suspense markers, **zero graph data** |
| Browser console | React error #419 on 3 of 3 loads ("server could not finish this Suspense boundary… switched to client rendering") |
| Time to graph HUD | ~1.75 s warm; ~30 s observed on one cold load (fallback visible the whole time) |
| After settle | `prefetchTopBrands(3)` fires; HUD goes from "211 of 354 nodes" to "779 of 922 nodes"; layout becomes a hairball |
| Traffic (PostHog, 30 d) | 1 visitor, 2 pageviews |
| Inbound links | none in `storefront/src`; listed in `sitemap.ts` |
| Graph chunk | one ~183 KB (58 KB gzip) client chunk, loaded after hydration + ResizeObserver |

Vercel runtime logs returned 403 for this session's token, so the server-side cause of #419 is *unverified*. The fix below removes the mechanism regardless.

## Why it is slow

### 1. Backend: the summary rescans the catalog to count things, uncached
[backend/src/api/store/graph/route.ts](../backend/src/api/store/graph/route.ts) lines 489–518 paginate **every published product** (500/page, with brand-link, type and tag joins, plus the fat unused `metadata` jsonb) just to count brands/types/tags in JS. Nothing is cached server-side. The `Cache-Control: s-maxage=300` header (line 307) does nothing: `api.scprints.com.au` is Fly direct with no CDN, and the browser ignores `s-maxage` without `max-age`. Commit `e285d884` (2026-05-16) removed this exact scan from `/brands` because it was "the sole cause of the slow load" — `/explore` still runs it.

Product modes (brand/category/type/tag) pull `variants.prices.*` (through the price-set module link) and `variants.metadata` (the bulk-pricing ladder) for every variant of 200 products (AS Colour styles run to 570 variants) to produce **one hover-only price per node**. That is the 10–16 s and the 166 KB. Also fetched and never read: `collection.*`, `brand.id`, `brand.handle`, `status`, `categories.parent_category_id`. Category mode additionally retries with a `category_id` filter that is not a column on Medusa v2 `product` (lines 723–743), a wasted full-projection query per click.

**Fix (hours, no new infra):**
- Replace the summary scan with three knex `GROUP BY` counts over `product_product_brand_brand`, `product.type_id`, `product_tags` — the exact pattern already in [backend/src/api/store/brands/route.ts](../backend/src/api/store/brands/route.ts) lines 33–40. Expect < 200 ms.
- Copy the 5-minute in-process `cache + inFlight` from [backend/src/api/store/shop-categories/menu/route.ts](../backend/src/api/store/shop-categories/menu/route.ts) (lines 71–74, 174–199) for the summary, and the keyed TTL map from `brands/[handle]/products/route.ts` for product modes. Add `max-age=300` to the header. Skip Redis and skip a nightly job.
- Drop every `variants.*` entry and the unused fields from `PRODUCT_FIELDS`; delete `lowestPrice` and the three price-reconciliation helpers (lines 148–289) with them. Expansions drop to ~1 s.
- Delete the `category_id` fallback query.

### 2. Storefront: a dead `?focus=` param makes the page a dynamic hole
[page.tsx](../storefront/src/app/[countryCode]/(main)/explore/page.tsx) line 120 awaits `searchParams` at the page root to read `?focus=` — which **nothing in `storefront/src` ever produces**. Under `cacheComponents: true` that single read makes the page body a dynamic resume hole on every visit. The served document (CDN HIT) carries the fallback and pending Suspense markers but never the payload; the browser logs #419 and re-fetches the page body client-side. That is the ≥ 1.7 s warm / 30 s cold "Loading catalog…".

[lib/data/graph.ts](../storefront/src/lib/data/graph.ts) is the only file in `lib/data` still using the legacy `fetch(..., { next: { revalidate } })` shape; everything else uses `"use cache: remote"` + `cacheTag` + `cacheLife` (see [brands.ts](../storefront/src/lib/data/brands.ts) lines 42–48). `getGraphForBrand/Category/All` have zero callers.

**Fix (hours):** delete the `searchParams` prop and the `focus` parsing from `page.tsx`; read `?focus` inside the existing client effect in `explore-template.tsx` via `window.location.search` if the deep link is ever wanted; make `getGraphSummary` a `"use cache: remote"` function tagged `graph`/`categories` (the `revalidate-products` purge already includes the `graph` tag); delete the three unused fetchers. The page body then prerenders into the CDN-served shell: HUD HTML arrives with the ~0.6 s document, no fallback is ever shown. (The nav's cart button keeps a small dynamic hole of its own; that one works today.)

### 3. Three uninvited brand expansions on every visit
[explore-template.tsx](../storefront/src/modules/graph/templates/explore-template.tsx) lines 150–157 call `prefetchTopBrands(3)` on first settle; the hook sorts brands by `productCount` and expands the three heaviest with `limit=200`. That is three concurrent full-hydration requests to a 2-CPU Fly machine, AS Colour alone 10–16 s, for a page with one visitor a month, and it is what builds the 779-node hairball. Two tabs = six concurrent requests (no request coalescing on the backend).

**Fix (minutes):** delete the call. Expansion already happens on click.

### 4. Client: every payload change wipes the layout and the engine is off
- [force-graph.tsx](../storefront/src/modules/graph/components/force-graph.tsx) line 219 clones every node on every payload or filter change, so d3 loses all `x/y` and re-seeds everything on a phyllotaxis spiral. `merge.ts` already preserves object identity for untouched nodes, so the clone is unnecessary.
- `explore-template.tsx` line 188 passes `cooldownTicks={settled ? 0 : 120}`. With 0, `force-graph` stops the engine on the first tick (`++cntTicks > cooldownTicks`, `force-graph.js` line 11548). So every merge and every filter toggle after settle gets only the 15 warm-up ticks: the "hairball" is an un-simulated spiral. The same setting breaks **node drag** at rest (neighbours never follow, links stretch) because drag calls `resetCountdown()` and the engine stops again next frame.
- The tuned d3 forces (lines 585–635) **never apply to the initial layout**: the effect early-returns because `instanceRef` is unset until the lazy chunk mounts, and nothing re-runs it. The summary lays out with library defaults; the custom forces only kick in at the first merge.
- Hover on the root spawns 4 photons × 211 links at 60 fps, with a Bezier allocated per link per frame (`linkCurvature=0.12`), on both the main and the shadow canvas; it sticks after a tap on touch.
- Product thumbnails are full-size supplier JPEGs, preloaded for every node, never evicted, downscaled on every draw. `drawEntryGlow` is time-based on a canvas that only repaints on demand, so it never animates.
- `focusNode` fires on stale coordinates before the expansion lands; the deep-link effect races the dynamic chunk.

**Fix (hours, all in two files):** pass `payload.nodes` through without cloning and seed new product nodes at their hub's coordinates; use a constant `cooldownTicks={120}` (or `d3AlphaMin`); replace `instanceRef` with a callback ref + `ready` state in the force-config effect deps; set `linkCurvature={0}` and remove the particle props (or 1 photon on small hubs only); stop preloading every thumbnail and have the image pool request a repaint on load.

### 5. Hygiene: wrong package.json, committed node_modules
`react-force-graph-2d`, `d3-force` and `@types/d3-force` live in the **repo-root** `package.json`, not `storefront/package.json`. Commit `bdeaa377` (2026-04-24) committed the root `node_modules/` tree: `git ls-files node_modules` = 1,563 files, 17 MB, and root `.gitignore` does not list it. Vercel's Root Directory is `storefront`, so the build only succeeds because Vercel includes files outside the root directory.

**Fix (one commit):** `cd storefront && pnpm add react-force-graph-2d@1.29.1 d3-force@3.0.0 && pnpm add -D @types/d3-force@3.0.10`; `git rm -r --cached node_modules package-lock.json` at the root; drop the dependency blocks from root `package.json`; add `node_modules/` to `.gitignore`; `npx tsc --noEmit && pnpm build` before pushing.

## Why it looks dull

1. **Dark palette on a light page.** [style.ts](../storefront/src/modules/graph/lib/style.ts) says so in its own comments (lines 20–24: "dark logos read fine against the dark canvas background"); the label halo is `rgba(15,23,42,.85)`; resting fills are slate greys; links are 40 % grey. The section is `bg-ui-bg-base` = `rgb(238,238,238)` and the canvas is transparent. One class (`bg-[#0B0C10]`, the space-hero background) makes the existing colours read as designed.
2. **Nothing is labelled at rest.** Labels draw only at zoom > 2.2 or on hover/selection/search; the first `zoomToFit` lands well below that. Visitors see 211 anonymous grey dots.
3. **10 of 13 brands are blank circles.** Only the three `CANONICAL_BRANDS` in the backend route carry `logoSrc`, yet the storefront already has a logo for every brand keyed by handle (`storefront/public/images/brands/logos/` + `getBrandPresentation`).
4. **The resting graph has no relationships.** It is a two-level tree (brands/types/tags/8 audiences → root; 164 sub-categories → parent). A force layout exists to show cross-links; there are none until expansion, and expansion immediately hairballs. Type diamonds are the only saturated colour, which is why they "scatter" after a merge.
5. **Chrome.** Generic white cards; the legend shows highlight swatches that never appear at rest; the search bar runs ~45 px under the Filters card below 1024 px; `--nav-height` is defined nowhere so the section overflows the viewport by 56 px on desktop (header is 128 px, fallback is 72); on a phone the Filters + Legend + HUD stack covers half the canvas, switches are 20×36 px and "Fit view" is under the 44 px rule; no `prefers-reduced-motion` handling anywhere in the module. Products at rest are 4 px flat squares (thumbnails only draw at zoom > 1.2).
6. **Tooltip prices are wrong.** `lowestPrice` takes the minimum over every price row in the variant's price set, which includes the "Tier: X" price-list rows, so guests see the platinum tier (Gildan 2000B: $9.31 in the tooltip, $27.21 on the PDP; Gildan 2000: $9.06). Dropping `variants.*` (fix 1) removes this; if a price is wanted, one `MIN(amount) WHERE price_list_id IS NULL` per product.

## The space theme: what exists and what it would take

Reusable today: [space-hero/index.tsx](../storefront/src/modules/home/components/space-hero/index.tsx) has the palette (`BG #0B0C10`, `STAR_DIM #1F2833`, `STAR_BRIGHT #C5C6C7`, teal `#45A29E`), a 3-layer parallax starfield (`buildStarfield`/`paintStarsFrame`, lines 510–650), nebula blobs, `drawPlanetGlow`, and reduced-motion handling. All of it is module-private; `SpaceHero` is the only export. Do **not** mount the whole 1,131-line component behind the graph (second rAF loop + second DPR-2 canvas).

Concept, cheapest first:
1. **Background (hours).** `bg-[#0B0C10]` on the section. For stars, either two or three `radial-gradient(1px 1px at …)` layers in CSS (zero JS, no reduced-motion work) or move lines 6–22, 434–452 and 510–650 of `space-hero/index.tsx` into `space-hero/starfield.ts` with named exports and paint them on one static backdrop canvas (half a day, only if twinkle/parallax is wanted).
2. **Orbits instead of a hairball (half a day).** Add `forceRadial` (same `d3-force` package already imported) with a ring radius per kind — brands ~150, the 8 audience categories ~230 — and `.strength(d => d.kind === 'product' ? 0 : 0.5)` so product dust still hugs its hub. Draw the ring circles faintly in `onRenderFramePre`; make root-spoke links very faint teal; `linkCurvature=0`. Sub-categories (164) and tags (143) must not share a ring: show them only when their parent/planet is selected.
3. **Iconography (hours).** Root = sun (radial gradient + `drawPlanetGlow`); brands = planets (clipped logo for all 13 via the storefront's brand presentation map, teal glow scaled by hover/focus, radius already scales by `log2(productCount)`); categories = moons (`#1F2833` fill, `#C5C6C7` stroke); products = 2 px dust that only appears for the selected planet; keep per-frame gradients bounded to root + 13 brands. Retune the highlight set too (today it is blue/orange/violet/amber, a different theme from rest); primary ring `#fbbf24` → `#66FCF1`.
4. **Labels (hours).** Always-on labels for brands and the 8 audiences at any zoom; everything else on focus.
5. **Cockpit HUD + mobile (1 day).** One shared surface class in `style.ts` (`bg-[#0B0C10]/70 border-[#45A29E]/30 !text-[#C5C6C7] backdrop-blur`) applied at the seven card sites, with `!text-*` to escape the `globals.css` repaints (note: `bg-ui-bg-base/90` silently drops its alpha today because the Medusa preset colour has no `<alpha-value>`, so the cards are opaque and the blur is dead). Below `tablet:` collapse Filters + Legend + Fit view into one bottom sheet behind a 44 px button that clears the chat FAB; `100dvh`; define `--nav-height` once on `:root` (80 px, 128 px at `small:`).
6. **Reduced motion (hours).** Static starfield + no photons when `prefers-reduced-motion`.

Honest total for the full space pass on top of the speed fixes: ~3–4 dev-days. The dark-background flip alone (step 1, first line) is the single highest-value hour on the page.

## Options

| Option | What | Effort | What you get |
| --- | --- | --- | --- |
| **A. Cut it** | Delete `storefront/src/modules/graph`, `lib/data/graph.ts`, `types/graph.ts`, the page, `backend/src/api/store/graph/route.ts`, the root deps + committed `node_modules`; 308 `/explore` → `/brands`; drop from sitemap | hours | ~3,100 LOC gone, no #419 in Google's crawl, nothing lost (1 visitor/month, orphaned) |
| **B. Keep, make it fast** | Fixes 1–5 above + `noindex` until done | 1–2 days | HUD in the CDN document (< 1 s), expansions ~1 s, drag works, no hairball |
| **C. B + space theme** | Steps 1–6 above | +3–4 days | Dark sun/planet/orbit catalog map, labelled, mobile-usable |
| **C-lite. Constellation, no physics** | New sandbox or `/brands` hero: 13 brand planets with logos and product counts in fixed orbits from the already-cached `listBrands()`, each a link to `/brands/[handle]`, over the space-hero starfield | ~1 day | The space look with no backend route, no d3, no HUD, nothing to keep fast |

**Recommendation.** Do the two-line `noindex` + sitemap removal and delete `prefetchTopBrands(3)` today regardless. Then decide between A and C-lite: a 13-planet constellation is the honest size of this feature (the resting graph has no relationships to explore, and every reviewer landed on "show dust only for the selected planet", which is a constellation with extra steps). Choose C only if you want the full catalog map as a product; then do B first, in the order listed, and verify each step on the live page.

## Also noticed (lower priority)
- The route runs `query.graph` without sales-channel scoping, so published "Internal Services" products (setup fees) are counted in type/tag totals and returned as clickable nodes by `mode=all`. Guard on `metadata.internal_service` once the counts move to SQL.
- Summary emits all 172 categories regardless of `is_active`/hidden/empty; the menu route already filters those.
- Tooltip copy says only brands/categories expand; types and tags expand too. The `next/dynamic` "Loading graph…" placeholder is a third light-themed surface to restyle with the rest.
- Keyboard and screen-reader users have no path to any product (`role="application"` canvas, no list fallback). Acceptable for a `noindex` sandbox, not for a public catalog page.
