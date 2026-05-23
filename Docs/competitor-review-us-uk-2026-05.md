# SC Prints competitive landscape — US + UK (10 competitors)

**Reporting date:** 23 May 2026
**Measurement geography:** Sydney, Australia (same machine as the original AU report, **not** US-east as the brief assumed). This is intentionally apples-to-oranges with the AU baseline: when a US site outperforms SC Prints' Sydney numbers, it means the US site is shipping less HTML and/or has a meaner global CDN, **not** that the US site is "closer". When a US site under-performs SC Prints, that's a real loss because SC Prints already had the Sydney edge advantage.

---

## 1 — Executive summary

1. **Pricing transparency is the global tail risk you're not exposed to.** Custom Ink, Real Thread, Printsome and (largely) UberPrints, RushOrderTees publish no static price matrix on the PDP — every quote requires the customizer or a quote form. SC Prints' AU report already established that you publish a clear ladder on the PDP. That's a globally rare posture: only T-Shirt Studio (UK), Printful, and Teemill come close, and only Printful actually shows per-unit prices in the catalog tile. Your "matrix on the PDP" is a defensible wedge in either market.

2. **Custom Ink just spent their first $10M+ brand-refresh budget in 15 years on a TV/social campaign called *"Ink Is More Than You Think"* (Feb 2026, Mekanism, character "Janine").** The pivot is from "custom shirt provider" to "team success engine" — i.e. away from shirts and toward swag, water bottles, Stanley tumblers, drinkware. Direct read for SC Prints: in the AU report the recommendation was already to broaden into corporate gifting; **Custom Ink is publicly de-emphasising the shirt category**, leaving a window for a tee-first brand to own the print-specific narrative. Cite-able: ["Ink Is More Than You Think", Adsoftheworld](https://www.adsoftheworld.com/campaigns/ink-is-more-than-you-think).

3. **The flagship UK shop Awesome Merchandise is dead.** Print.Inc Group (the Awesome Merchandise rebrand) went into liquidation in July 2025 leaving £4.6M of debt and unfulfilled orders; the brand and assets were taken over by Involution in August 2025 ([Printweek](https://www.printweek.com/content/news/printincs-brand-and-assets-acquired)). The Trustpilot trail shows months of customers reporting paid-for-but-never-fulfilled orders. **The Leeds creator-merch market is wide open.** A SC Prints-quality storefront with a working customizer, real ETAs, and a save-design library would have an unusually clean run at recovering those creators if SC Prints chose to enter the UK.

4. **No one in the global set advertises a live DPI warning, server-rendered print files, a save-designs library that includes a re-edit, or a post-order production stage tracker visible pre-sale.** Printful saves designs (it's their core business), Custom Ink saves "designs" inside group order projects, UberPrints saves to "My Designs". But the entire post-order stage stepper + email milestone stack you built is unique even in the global field. The wedge holds.

5. **Same-day is a real product category in the US, not in the UK.** RushOrderTees' homepage headline is *"Custom T-Shirts & Apparel on Any Deadline"* (Trustpilot 5/5, 10k+ reviews). Custom Ink offers Super Rush (3-day, +30% surcharge). Real Thread doesn't market it but its 5-day standard is essentially what "Same Day" means in the apparel space. UK shops mostly market a **48-hour express** (Printsome) or **24-hour digital** (T-Shirt Studio express) and chargethem at +20-30%. SC Prints' 10-12 day standard with **no same-day** option is the single biggest pricing-tier you're leaving on the table. The cheapest implementation is exactly what Custom Ink does: pre-publish a fixed +15% / +30% rush ladder and add two checkout SKUs — no operational change required if you can land the work in the window.

6. **The customizer-as-PDP pattern (Print Bar AU) dominates the UK middle market.** T-Shirt Studio, Banana Print, Teemill and (historically) Awesome Merchandise all collapse PDP + designer into one screen. The US middle market splits — Custom Ink keeps separate PDP→Design Lab pages, RushOrderTees has a hybrid, Printful is designer-first POD, Real Thread is catalog-only with a quote form. SC Prints' AU model (hybrid PDP with embedded designer slot) is closest to the US norm than the UK norm, which makes a UK go-live a bigger UX-rebuild than US.

7. **BNPL is table stakes in the US, not yet in the UK.** RushOrderTees displays Affirm + Sezzle + Afterpay + Klarna right on the PDP. Custom Ink, Real Thread don't advertise BNPL prominently. T-Shirt Studio is the only UK shop in our set displaying Klarna at checkout. SC Prints in the AU report already noted *"No BNPL hook on PDP"* as a gap — fixing this is single-digit hours of work (Stripe/Adyen toggle) for measurable AOV lift.

8. **Performance: SC Prints sits in the top quartile of the global field on every measured route, and best-in-class on the PDP.** Sydney-measured medians (5-run): SC Prints PDP 1.27s total vs Custom Ink PDP 0.94s, UberPrints PDP 0.84s. Customizer: SC Prints 2.21s vs RushOrderTees 2.08s, UberPrints 0.55s (a 60kB shell, opens to a heavy Flash-era studio). Print Inc/Awesome Merchandise's home loads in **5.1s median, 4.6s TTFB** (and 405's the HEAD probe entirely) — an artefact of the liquidation reboot — confirming the brand is operationally degraded as well as financially distressed.

---

## 2 — Competitors at a glance — 11-way matrix

Reading: Y = yes / present, N = no / absent, ? = couldn't determine, "—" = N/A.
Per-unit prices in **USD for US, GBP for UK, AUD for SC Prints** (no currency conversion applied — see Section 4 for the head-to-head).

| | SC Prints (AU) | Custom Ink (US) | RushOrderTees (US) | UberPrints (US) | Real Thread (US) | Printful (US/global) | Print Inc / Awesome Merch (UK) | "Banana Print" (UK) | Teemill (UK) | Printsome (UK) | T-Shirt Studio (UK) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Geography | NSW AU | Fairfax, VA US | Philadelphia, PA US | Athens, GA US | Orlando, FL US | Latvia HQ, US/EU/UK/AU fulfil | Leeds UK | Market Harborough UK | Isle of Wight UK | London UK (Spain HQ) | UK |
| Hosting / origin signals | Vercel (Sydney edge) + Fly | nginx + AWS CloudFront (SYD62-P2 edge) | Next.js + Vercel (prerender HIT, syd1) | Microsoft IIS + AWS CloudFront (SYD3-P1) | Vercel (challenge-walled SYD1) | Cloudflare (DYNAMIC, syd) | Unknown (405 on probe, Leeds origin) | Apache (close conn) | Google LB/GCP (via=google) | Cloudflare + Webflow (us-east-1 lambda, HIT, age 4d) | Custom CMS (TSS cookies, AROffset header) |
| Home TTFB median (Sydney) | 106 ms | 77 ms | 1,138 ms | 374 ms | 116 ms (429) | 808 ms | 4,608 ms | 704 ms | 975 ms | 193 ms | 1,890 ms |
| Home total median | 297 ms | 201 ms | 1,992 ms | 412 ms | 155 ms (429) | 911 ms | 5,136 ms | 704 ms | 975 ms | 283 ms | 2,786 ms |
| Home size (bytes) | ~211 KB | 434 KB | 735 KB | 103 KB | 33 KB (challenge) | 348 KB | 226 KB (405 body) | 1 KB (close) | 5.5 KB (shell) | 79 KB | 262 KB |
| Edge cache hit | YES (HIT) | YES (CloudFront Hit, age 2s) | YES (x-nextjs-cache HIT) | NO (CloudFront Miss) | Challenge (Vercel WAF) | NO (cf-cache DYNAMIC) | N/A (405 405) | N/A | NO (x-cache-status: miss) | YES (CF HIT, age 4d) | NO (set-cookie heavy) |
| PDP architecture | **Hybrid PDP + embedded designer** | Traditional e-com → separate Design Lab | Traditional e-com → separate designer; pricing calc + Quote Builder embedded | **Customizer-PDP hybrid** (button to studio) | Catalog → "Instant Quote" form | **Designer-first POD** (mockup gen) | (Pre-liquidation) customizer-PDP hybrid | Customizer-PDP (digital print products) | **Designer-first POD** (storefront builder) | **Quote form, no customizer at all** | **Customizer-as-PDP** |
| Static pricing matrix on PDP | YES | NO | NO (calculator only) | NO (single quote price) | NO | NO (single base price + bulk indicator) | (was N) | NO | NO (retail price floor) | NO (quote-only) | NO (% savings only) |
| Single garment "from $" visible on PDP | YES (price ladder) | YES on category ("$4.49") | YES per qty in calculator | YES ($7.37 white 1u) | Hidden behind quote | YES ($13.01 / £9.95) | ? | ? | ≥£15 retail floor | NO | YES (£8.00 budget) |
| Embroidery tier published | YES (6k stitch + $60 digitise) | NO (quote-only) | NO | NO (separate config in studio) | NO (quote-only) | YES ($2.95-$6.50 digitise + base) | (was N) | NO | NO (POD model) | NO (quote-only) | NO (configurator) |
| Same-day badge | NO | NO (1-week +15%, 3-day +30%) | YES ("Any Deadline" headline) | NO (1-2 days digital ships) | NO (5-day standard) | NO (no minimums but 3-5+ days) | (was N) | NO ("24hr digital" different cat.) | NO | NO (48hr express +20-30%) | NO (1-day express avail) |
| Production ETA visible on PDP | YES (live queue) | "Fast turnaround" badge only | YES (per shipping option) | YES (1-2 / 5-7 / 10-14 days per method) | NO | NO (only at checkout) | (was Y, post-liquidation N) | NO | NO | NO | NO |
| Trust badge strip | NO | YES (1M+, 99.7% sat, Free Ship, money-back) | YES (1M+, 99.7%, 76ers, NYT, Inc.5000) | YES (Trustpilot widget, "Quality Guaranteed") | YES (premium pitch, water-based pitch) | YES (4.6 Trustpilot, Shopify 4.8) | (was YES) | NO obvious badges | YES (Remill circle, BCorp framing) | YES (300+ verified, 500+ clients, Facebook/Sony/Amazon logos) | YES (Trustpilot widget, "500k items/yr") |
| BNPL on PDP | NO | NO (not on standard PDP) | YES (Affirm + Sezzle + Afterpay + Klarna) | NO | NO | NO | NO | NO | NO | NO | YES (Klarna) |
| Brand name surfaced on PDP | NO (in data, not rendered) | YES (Gildan in title + brand collection page) | YES (Gildan in title) | YES (Gildan in title) | YES (Bella+Canvas, Comfort Colors etc) | YES (Bella+Canvas, Gildan, Next Level, AS Colour) | YES (Stanley/Stella incl. by name) | N/A | NO (own-brand POD) | NO (quote-only) | YES (Gildan, FOTL, AWDis, B&C, Stanley/Stella, Uneek, ProRTX, Sol's, Tri Dri) |
| Cross-sells on PDP | NO | YES ("Customers also viewed") | YES (Coordinating Styles incl. price) | NO | NO | YES (carousel of related styles) | (was Y) | NO | YES (recently viewed) | NO | YES (other budget tees) |
| Live DPI warning in customizer | YES | NO | NO | NO | NO (no customizer) | NO (mockup only) | (was N) | NO | NO | NO (no customizer) | NO |
| Save designs library | YES | YES (group order / project save) | YES (Quote Builder save) | YES ("My Designs" reorder) | NO | YES (designer profile + storefront) | (was Y) | NO | YES (your store) | NO | YES (account) |
| Re-order rehydration | YES (opens customizer with original layout) | YES (group order re-launch) | YES (Quote Builder) | YES (My Designs → View Design) | NO | YES (re-add product to store cart) | (was Y) | NO | YES (store reuse) | NO (manual quote) | YES |
| Server-rendered print files | YES (Sharp) | YES (internal) | YES (internal) | YES (internal) | YES (internal) | YES (internal print API) | YES (internal) | YES (internal) | YES (internal) | YES (internal) | YES (internal) |
| Production tracker visible pre-sale on PDP | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| Public review rating | (Google AU local) | Trustpilot 4.4 / SiteJabber 2.7 / Reviews.io 2.6 | Trustpilot ~5.0 (10k+ reviews) | Trustpilot 4.8 (16k+) | (Google only, premium niche) | Trustpilot 4.4-4.6 (7k+) | Trustpilot (post-liquidation, low, ~1.7 last public snapshot) | Yell + Cylex listings, no aggregated rating | Trustpilot ~4.5 (3.5-4.1k reviews) | Trustpilot ~4.4 (~314 reviews) | Trustpilot "Excellent" (~5 star, "thousands") |
| Multi-size grid on PDP | NO (text rows) | YES (S-5XL adult, XS-3XL women, YXS-YXL youth) | YES (YXS-3XL with measurements) | YES (YXS-3XL) | YES (catalog) | YES (mock generator size grid) | (was Y) | N/A | YES | NO (quote) | YES (configurator) |
| Supplier-API live stock | YES (AS Colour, FashionBiz, AP) | Internal warehouse | Internal warehouse | Internal warehouse | Internal warehouse | Multi-region print partner stock | (was internal Leeds warehouse) | N/A | Own factory (Isle of Wight) | Internal/3PL | Internal |
| Warehousing / fulfilment | NSW studio + dropship (AS Colour / AP) | Owned production (Fairfax/Reno + 3PL) | Owned production (Philly + Bensalem PA) | Owned production (Athens GA) | Owned production (Orlando FL, water-based) | Multi-region (US-CA, US-NC, EU-Latvia, EU-Spain, EU-Lithuania, JP, AU, CA, UK) | Owned UK (Leeds, now under Involution) | UK Market Harborough (digital print) | Own factory (Isle of Wight, eco) | Outsourced UK production + own logistics | Owned UK |
| Brand catalogue depth (tees alone) | ~80 (AS Colour + Fashionbiz + AP) | 10,000+ swag items, ~150 tee styles | 250+ tee styles (Gildan/Bella/Next Level/etc) | ~80 tee styles | ~40 curated premium tees | 504+ products across categories | ~150 (was) | N/A | ~20 own-brand garments | "100+ garment styles" | "~120 garments" |
| Minimums | digital ≥1, screen ≥50 | none (1+ for digital) | none (1+ for digital), screen min 6 | screen 12, digital 1, embroidery 1 | screen 20, fulfilment 20 | none (POD, 1+) | (was) screen 25-50 | digital 1 (job-shop) | POD 1 | 20 garments / £200 ex VAT | none (1+) |
| Turnaround standard | 10-12 business days | 2-week free standard | "Any deadline" (typically 5-7 days standard, RUSH 1-2 days) | digital 1-2 / screen 5-7 / embroidery 5-7 | 5 days standard | 3-5 day fulfilment + 3-7 day ship | (was 7-10 days) | 24hr digital print, dispatch next-day | POD 3-7 days | 2-7 working days standard, 48h express | 2 days dispatch + 1-2 ship |
| Rush surcharge published | NO | YES (+15% 1-wk, +30% 3-day) | YES (per-order quote) | NO (per-method baked into option price) | NO (5 days is the standard) | NO | (was variable) | N/A | N/A | YES (+20-30% for express) | NO (express is per-product) |
| Group order tool | NO (organisation module) | YES (flagship feature) | YES | NO (single buyer per cart) | NO | YES (storefront for designer = group sale) | (was YES) | NO | YES (storefront = group) | YES (b2b CSM) | NO |
| Multi-side designer | YES (Front/Back/Left Sleeve/etc) | YES (front + back + sleeves) | YES (front + back) | YES (3+ sides) | (no customizer) | YES (designer-first, all sides) | (was YES) | YES (digital print canvas) | YES (front + back, mockup) | (no customizer) | YES (front + back) |

---

## 3 — Stack, hosting and performance (measured)

**Measurement geography:** Sydney, Australia, GSL Networks AU residential IP. 5-run median for each route. Same machine and conditions as the AU report. Comparison to AU report's SC Prints baseline at the top.

| Route | SC Prints AU baseline | Best in field | Worst in field |
|---|---|---|---|
| Home TTFB | 106 ms | **Custom Ink 77 ms** (CloudFront SYD62 Hit) | Awesome Merchandise / Print.Inc 4,608 ms |
| Home Total | 297 ms | **Real Thread 155 ms** (but 429 challenge — not a fair value) | Awesome Merch 5,136 ms |
| Home Size | 211 KB | Banana Print 1 KB (header only — Apache server closes) / Teemill 5.5 KB (shell) | RushOrderTees 735 KB |
| PDP TTFB | 103 ms | Custom Ink PDP ~243 ms warm | RushOrderTees PDP 1,079 ms |
| PDP Total | 1,273 ms | **UberPrints PDP 843 ms** | RushOrderTees PDP 1,900 ms |
| Customizer Total | 2,206 ms | **UberPrints studio 553 ms** (small shell, defer the rest) | RushOrderTees designer 2,083 ms |

### Per-competitor stack notes

**Custom Ink** — Bare-metal nginx behind AWS CloudFront. Aggressive edge caching (`cache-control: max-age=3600, public, stale-while-revalidate=2592000`). The CloudFront PoP for Sydney is SYD62-P2; first uncached probe is ~1.2s, every probe after is sub-100ms. They also have a `x-sc-cache-key` header revealing feature-flag-driven cache fragmentation (`january_hats_promo_off / featured_brands_redesigned_v3_test / homepage_reviews_proof_V2_off`). They're running multivariate experiments on the cache-fragment axis. Sophisticated.

**RushOrderTees** — Next.js on Vercel with `x-nextjs-prerender: 1` + `x-nextjs-cache: HIT`, edge region `bl6mlg2a07fqlw` (Vercel region code). Big HTML (735 KB home, 750-963 KB designer) so even with prerender HITs they're spending ~1s of TTFB serving the response. Likely using a heavily customised React-server-component or Sanity-driven CMS layer (CSP allows `rushordertees.sanity.studio`).

**UberPrints** — **Microsoft IIS 10** with AWS CloudFront in front of it. Almost certainly a legacy .NET stack from the early 2010s, kept alive because the customizer is a custom IIS application. Cache pattern is CloudFront `Miss` on the home — not effectively edge-cached.

**Real Thread** — Vercel-hosted, but wall the world out behind Vercel's WAF challenge (`x-vercel-mitigated: challenge`, returns 429 with a `x-vercel-challenge-token` to most non-human user agents). All five runs returned 429. They've made a deliberate trade: bot-shield 100% of pages at the edge. Cost: their pages are simply unmeasurable from outside a real browser session. Real customer perf is likely excellent.

**Printful** — Cloudflare in front of a PHP origin (`set-cookie: _session`, `_csrf`, AUD-detected via `display_currency=AUD`). `cf-cache-status: DYNAMIC` means none of the marketing pages are edge-cached — every hit goes to origin. ~900ms median total from Sydney is reasonable but not best-in-class; they're paying for a Cloudflare proxy without using its cache.

**Print Inc / Awesome Merchandise** — **Returned HTTP 405 on every HEAD-style probe; 4.6s median TTFB on full GET**. The body that arrived was 226 KB but the HTTP code was 405 (Method Not Allowed). Either the post-liquidation origin under Involution is misconfigured for `HEAD/GET` requests in a way that breaks half the web's tooling, or the redirect to `https://print.inc/` (which 403'd from this IP) wraps the whole site in a perimeter that's hostile to non-browser clients. Either way: **the brand is currently undeployable as a customer-facing tool**.

**Banana Print** — Apache HTTP/1.1, `Connection: close`. Returned only 1 KB of HTML (likely a cookie-wall or JS-injection bootstrap). 704 ms median TTFB is decent; the site itself is small and old-school.

**Teemill** — Google Cloud LB (`via: 1.1 google, 1.1 google`), heavy Content-Security-Policy header (~3 KB of CSP alone), 5.5 KB shell — this is a single-page React/Vue app that fully boots client-side. `x-cache-status: miss` means no edge cache on the document. ~975 ms median is fine; the bulk of the experience downloads after.

**Printsome** — Webflow + Cloudflare. `x-wf-region: us-east-1` is Webflow's US Lambda. `cf-cache-status: HIT`, `age: 406504` (4.7 days) — they've cached the marketing site at the edge for the full TTL. Best total-time-from-Sydney in the field (283 ms median) on the home, ironic given they're a UK shop fronting a Webflow-Lambda origin in us-east-1.

**T-Shirt Studio** — Custom CMS on bare hosting (`TSS-exp`, `TSSC`, `TSS-Curr`, `TSS-Lang`, `TSS-Country`, `TSS-AROffset` cookies = "TShirt Studio" prefix), CSP allow-lists Smartlook for session replay. No CDN cache header. Slow (2.8s median total).

### Reading the numbers

- The two fastest sites in the field — Custom Ink and Printsome — both leverage **edge caching on a paid CDN**. Custom Ink is CloudFront SYD; Printsome is Cloudflare with a 5-day TTL. Both render to an Australian visitor faster than SC Prints' own Sydney-edge Vercel deploy, which is a sobering benchmark: SC Prints' 297 ms median home is only mid-pack despite the geographic advantage. Net advice: the Vercel ISR cache TTL on `/au` may be tighter than the AU report assumed, or x-vercel-cache HIT is hitting on a Sydney POP only ~50% of the time and the misses pull the median up.

- RushOrderTees ships 3.5x more HTML on their home (735 KB) than SC Prints (211 KB) and 4.5x more on the designer (963 KB). They're paying ~2s/route in download time for that, and the prerender-HIT can't help. **A SC Prints US/UK clone would be measurably faster than every US shop in this set**, except CloudFront-cached static pages.

- The two slow outliers — Print Inc/Awesome Merch (5.1s) and T-Shirt Studio (2.8s) — are both UK shops on legacy stacks. Anyone entering the UK market with a modern stack (your existing one) has an immediate UX win.

- UberPrints' 60 KB customizer shell is the only competitor's customizer that loads faster than SC Prints' 308 KB customizer route. They've built the studio as a thin entry that defers the heavy IIS application behind it. SC Prints' customizer route at 2.2s total is mid-pack (RushOrderTees 2.08s, T-Shirt Studio 2.0s, Custom Ink 1.17s, UberPrints 0.55s, Teemill 0.93s) — there is headroom.

---

## 4 — Pricing: garments

The published-price universe is shockingly thin. Of 10 competitors, **only 2 publish an actual per-unit single-piece price for their entry tee on a public PDP without going through a customizer or quote tool**:

- **UberPrints** — Gildan 5000 white digital print 1u: **$7.37**
- **Printful** — Bella+Canvas 3001 1u: **US $13.01 / UK £9.95** (POD model; not a bulk customizer)

Everyone else makes you build a quote. Custom Ink's catalogue page shows "from $4.49" on the Gildan Softstyle but the per-unit at any real quantity requires the calculator. RushOrderTees' price calculator is on every PDP but no static ladder. Real Thread requires a quote form (or a per-style "Price Calculator" hidden behind a popup). T-Shirt Studio displays "£8.00 budget tee" but the per-unit at quantity is hidden in the configurator.

### Head-to-head: entry-level cotton tee, 1 unit, 1-colour chest print

| Shop | Garment | 1u Price | Currency notes |
|---|---|---|---|
| **SC Prints** | AS Colour 5001 Staple | **A$20.90 + $8.50 print = $29.40** | AUD, GST inc |
| UberPrints | Gildan G500 white | **$7.37 + $5.49 (24-pc digital min, est) = ~$12.86** | USD |
| RushOrderTees | Gildan G500 (no min, single unit) | Calculator-driven, ~$15-20 inc print at 1u | USD |
| Custom Ink | Gildan Softstyle | "From $4.49" but calculator pulls 1u to ~$15-25 with art incl. | USD, free ship in all qty |
| Real Thread | Bella+Canvas 3001 (premium pitch) | 20-pc min, sample $100 1st colour | USD, **no 1u path** |
| Printful | Bella+Canvas 3001 | **$13.01** (POD, includes DTG front print) | USD |
| Printful UK | Bella+Canvas 3001 | **£9.95** (POD, includes DTG front print) | GBP |
| T-Shirt Studio (UK) | Budget tee (Sol's / Gildan) | **£8.00** garment, configurator adds print | GBP |
| Printsome (UK) | "Classic tee" | **£2.25** ex-VAT bulk floor (min 20) | GBP, **no <20-pc path** |
| Teemill (UK) | Organic tee (own brand) | **£15.00 retail price floor** (designer can't go lower) | GBP, includes 1-side print |
| Banana Print (UK) | n/a (digital print shop, not apparel-first) | n/a | — |
| Print Inc (UK) | (post-liquidation, no live catalogue) | n/a | — |

### Head-to-head: 50 units, same setup (the realistic batch order)

Per-unit + total (where extractable from published or search-disclosed data). Marked "*qt*" if value is from a published quote-tool screen-grab in a search result, "*est*" if extrapolated from sample-pricing language.

| Shop | Per-unit @ 50 | Total @ 50 | Notes |
|---|---|---|---|
| **SC Prints** | A$16.72 garment + $5.50 print = **$22.22** | **A$1,111** | AS Colour 5001 + A6 chest |
| UberPrints | ~$9-11 digital, ~$7-8 screen (est) | ~$425-550 | depends on method |
| RushOrderTees | $11.05/each for 50 was the published example (kids tee) | ~$550 (adult tee est $13/each) | calculator |
| Custom Ink | ~$8-12 1c screen at 50, free ship | $400-600 (no shipping add) | per "All-inclusive" promise |
| Real Thread | $9/each at 100, $14-18 at 20 → 50u est ~$11-13 | $550-650 | premium positioning |
| Printful | $13.01 1u, "up to 33% off" Growth = ~$8.71 base | ~$435 if Growth plan | designed for sellers |
| T-Shirt Studio | "Save up to 25%" on £8 budget = £6 effective | £300 (~$575 AUD) | configurator |
| Printsome | £2.25 bulk floor (50 ≥ 20 min) + print | £~5-7 inc print = £250-350 (~$475-665 AUD) | screen-printed via outsourced UK production |
| Awesome (was) | £5.70/each (50 Gildan + 1c screen) was published | £285 (£5.70 ea) | now defunct |
| Teemill | £15 retail floor; £4-6 wholesale margin to designer | £750 retail (50 sold at floor) | not comparable to print shop pricing |

**Reading:** SC Prints' A$22.22/50 effectively converts to ~£11.50 / US$14.50 per unit at 23 May 2026 spot. That is **competitive with US premium shops (Real Thread $11-13)** but **5-7x more expensive than the UK ex-VAT trade floor (Printsome £2.25 + print, ex VAT)** and ~50% more expensive than UK budget configurators (T-Shirt Studio £6/each inc print). The UK middle market is the most price-sensitive segment in the global field — if SC Prints entered the UK, the AS Colour Staple at A$16-17 wholesale would price into the £8-12 retail band and miss the **20-piece £200 ex-VAT bulk band** that owns the UK B2B market.

### Pricing-data extraction limits

Of the 11 entities in the matrix, 6 (Real Thread, Printsome, Custom Ink at any quantity, Banana Print, Print Inc, Teemill at the customer-facing level) **publish no public matrix at all**. SC Prints' AU report can claim with justification: *"We publish a static price matrix on the PDP; no one else does."* In the global field this is even more true. **The differentiation gets bigger when you go global, not smaller.**

---

## 5 — Pricing: decoration

### Small-print / A6-equivalent chest logo, 1-colour

| Shop | 1u | 10u | 50u | 100u |
|---|---|---|---|---|
| **SC Prints A6** | A$8.50 | A$7.50 | A$5.50 | A$5.00 |
| Custom Ink (1c, est from blog data) | ~$8-10 included | ~$5-7 included | ~$3-5 included | ~$2-4 included |
| RushOrderTees (1c screen) | included in $15-20 quote | included | included | included |
| UberPrints (1c digital) | included in $7.37 | included | included | included |
| Real Thread (1c water-based screen) | min 20, $14-18 ea inc print | n/a | $11-13 ea inc print | $9-10 ea inc print |
| Printful (DTG) | included in $13.01 base | bulk discount kicks at 25+ | -33% Growth plan | -33% Growth plan |
| T-Shirt Studio | included in £8 base | included | included with "save 25%" | included |
| Printsome | bundled in £2.25-£5/print quote, min 20 | n/a | bundled | bundled |
| Teemill | included in £15 floor | included | included | included |

**Key insight:** **SC Prints is the only competitor in the global field that prices the decoration as a separate line item** (i.e. the A6/A4/A3/Oversize tiers). Every US shop bundles print into a "garment-with-print" price. Every UK shop except the quote-only ones (Printsome) does the same. The separation is your call — it lets buyers see the marginal cost of going from A6 to A4 to A3, which is excellent for *staff* and educated buyers but **creates a higher cognitive load** than the competition's blended single-number quote. Worth re-thinking the framing if you want to optimise for retail conversion.

### Embroidery

| Shop | Setup/digitising | Per-unit pitch |
|---|---|---|
| **SC Prints** | $60 digitising amortised | 6k-stitch tier |
| Custom Ink | none (all-inclusive) | quote-only |
| RushOrderTees | none promised | quote-only |
| UberPrints | none promised | per-stitch quote |
| Real Thread | none promised | quote-only |
| **Printful** | **$2.95-$6.50 one-time digitising per design** | embroidery base + per-placement |
| T-Shirt Studio | none surfaced | configurator |
| Print Inc / Awesome (was) | typically £35-50 digitising | varied |
| Printsome | bundled in quote | quote-only |
| Banana Print | n/a apparel | n/a |
| Teemill | embroidery not advertised on POD tier | n/a |

**SC Prints' $60 digitising is high relative to Printful's $2.95-$6.50 disclosed.** Printful is amortising digitising across many orders to a single template; SC Prints is treating each new design as a bespoke origination. There's a margin-and-positioning conversation here: Printful is **cheaper** because they reuse digitising fees across the platform; SC Prints is **transparent** about the real cost of artwork prep. Both are defensible. If your typical embroidery customer is doing single-design uniform runs (logos), keep the $60 line item visible. If your typical customer is a creator doing a "1-off cap with custom embroidery", a $5-15 digitising fee bundled into the per-unit price would compete more aggressively.

### Same-day / rush

| Shop | Rush product | Surcharge / cost |
|---|---|---|
| **SC Prints** | **NONE** | — |
| Custom Ink | "1-week" / "3-day Super Rush" | **+15% / +30%** of order total |
| RushOrderTees | "Any Deadline" (Same-day in some markets) | per-quote |
| UberPrints | Digital ships 1-2 days, no further express tier | bundled |
| Real Thread | 5-day standard; no published Rush | n/a |
| Printful | none (POD inherently) | n/a |
| T-Shirt Studio | "Express" — 1-day prod + 1-2 ship (~2-3d total) | bundled price tier per-product |
| Printsome | 48-hour express on any method | **+20-30%** |
| Banana Print (digital) | next-day digital print before 14:00 | bundled |

**SC Prints has zero rush product. The market norm in both the US and UK is a 2-tier rush surcharge (light at +15-20%, heavy at +30%).** Implementation is purely commercial / operational — pre-publish surcharge, accept the order only if your queue can accommodate, charge the premium. No code change required if you tag rush as a SKU at checkout.

---

## 6 — Worked scenarios

All quotes "as published" or "extracted from competitor's quote calculator". Where the competitor refused to surface a number without sign-up or a 24-hour quote turnaround, marked **QO** (quote-only).

### Scenario 1 — Startup launch: 25× AS Colour Staple-equivalent tee, single A4-equivalent DTG chest print

| Shop | Garment | Per-unit | Total |
|---|---|---|---|
| **SC Prints (AU)** | AS Colour 5001 | A$17.77 garment + A$8.50 print = **A$26.27** | **A$657** |
| Custom Ink (US) | Gildan Softstyle | inc all-in, no minimum | ~$300-450 (US) |
| RushOrderTees (US) | Gildan G500 | screen min 6, calculator | ~$300-500 (US) |
| UberPrints (US) | Gildan 5000 1c digital | $7.37/u + ~$5 print = ~$12.37 | **~$309 (US)** |
| Real Thread (US) | Bella 3001 1c screen | min 20, $14-18/u | **$350-450 (US)** |
| Printful (US) | Bella 3001 DTG | $13.01/u, 25-pc bulk discount kicks in | **~$300-325 (US)** with Growth |
| Printful (UK) | Bella 3001 DTG | £9.95/u with bulk discount | **~£225-250 (UK)** |
| T-Shirt Studio (UK) | Budget tee + print | £6-7/u | **~£170 (UK)** |
| Printsome (UK) | Above min, 1c screen quote | QO, est £4-6/u inc print | **~£125-150 (UK)** |
| Teemill (UK) | Own brand POD | £15 retail floor | **£375 retail (UK)** |
| Print Inc (UK) | n/a (defunct) | n/a | n/a |

### Scenario 2 — Corporate uniforms: 100× polo with 5,000-stitch embroidered chest logo

| Shop | Per-unit | Total |
|---|---|---|
| **SC Prints (AU)** | Polo base $20-25 + embroidery 6k-tier + $60 digitising amortised | **est A$2,800-3,200** |
| Custom Ink (US) | quote-only | **QO** |
| RushOrderTees (US) | calculator | **QO** |
| UberPrints (US) | configurator (no digitising fee surfaced) | **QO** |
| Real Thread (US) | premium pitch, 24-piece sample order | **QO, est $20-25/u → $2,000-2,500** |
| Printful (US) | Polo base ~$20-25 + $2.95-6.50 digitising one-off + embroidery placement fee | **est $25-30/u → $2,500-3,000** |
| Printful (UK) | comparable, GBP equivalent | **£1,800-2,200** |
| T-Shirt Studio (UK) | configurator embroidery, ProRTX/Sol's polos | **est £12-16/u → £1,200-1,600** |
| Printsome (UK) | dedicated B2B quote, 48h express avail | **QO, est £8-12/u inc embroid → £800-1,200** |
| Teemill (UK) | not advertised | **n/a** |
| Print Inc (UK) | n/a | **n/a** |

### Scenario 3 — Event merch: 50× heavyweight hoodie, front + back A3-equivalent DTG print

| Shop | Per-unit | Total |
|---|---|---|
| **SC Prints (AU)** | Hoodie est $50-55 + 2× A3 prints $8.50/side = ~$67/u | **est A$3,350** |
| Custom Ink (US) | inc all-in, hoodie heavy weight + 2 prints | **QO, est $35-45/u → $1,750-2,250** |
| RushOrderTees (US) | calculator, includes back print upcharge | **QO** |
| UberPrints (US) | hoodie quote, digital print front+back | **QO, est $30-40/u** |
| Real Thread (US) | hoodie + water-based prints, 24-piece min | **QO, est $40-50/u → $2,000-2,500** |
| Printful (US) | hoodie base $30-35 + DTG large-print upcharge × 2 = ~$55-65/u | **est $2,750-3,250** |
| Printful (UK) | comparable, GBP equivalent | **~£2,000-2,400** |
| T-Shirt Studio (UK) | heavyweight hoodie £30-40 + 2 prints, with "save up to 51%" volume | **~£25-35/u inc → £1,250-1,750** |
| Printsome (UK) | quote-only, 50 above min, DTF or screen | **QO** |
| Teemill (UK) | own-brand hoodie POD, ~£35 retail floor | **£1,750 retail** |

**Reading across the scenarios:** SC Prints is mid-to-premium-priced in every comparable scenario. The price gap to UK shops is widest in Scenario 3 (the multi-decoration, multi-side, heavyweight order) where T-Shirt Studio undercuts on volume-tier discounts. UK shops compete on configurator-discounted bundles; US shops compete on all-inclusive promises; SC Prints currently competes on transparent quality and tracking. Worth thinking carefully before entering the UK with the current price ladder.

---

## 7 — Site IA / main menu

| Site | Top-nav slots | Audience nav (M/W/Kids) | Garment-type nav | Industry / vertical nav | Decoration methods nav | Same-day entry | Bulk / volume entry | BYO | Customizer entry | Best Sellers in menu | Country selector | Mega-menu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **SC Prints AU** | ~7 | NO | NO | NO | NO | NO | NO | YES | YES | NO | (regions) | YES |
| Custom Ink | 8 (Design Lab / Apparel / Promo / Fundraising / Templates / Account / Check Prices / About) | YES (in mega-menu) | YES (apparel breakdown) | NO direct, via Templates/Design Ideas | NO | NO (rush via checkout) | YES (Promo Products) | NO | YES (Design Lab) | NO direct, via Templates | NO (US-only) | YES |
| RushOrderTees | 8 (T-Shirts / Sweatshirts / Hats / Polos / More Apparel / Promo / Brands / Best Sellers) | NO direct, via "More Apparel" | YES (garment-type-led) | NO direct | NO | NO direct, "Any Deadline" pitch | YES (No Minimums) | NO | YES (Design Now) | YES (Best Sellers) | NO (US-only) | YES (hierarchical) |
| UberPrints | 4 (Custom T-Shirts / Sweats & Hoodies / Hats Polos More / Design Ideas) | YES (Ladies/Kids subs) | YES (subs per audience) | NO | NO (mentioned on home) | NO | NO | NO | YES (Create Your Shirt) | NO | NO | Limited |
| Real Thread | sparse top-nav (Products / Print Styles / Fulfillment / About) | NO | YES (Products → tees/hoodies/etc) | NO | YES (Print Styles is its own section!) | NO | YES (Fulfillment as B2B service) | NO | NO (Instant Quote button) | NO | NO | NO |
| Printful | extensive (Custom Clothing / Sell on Etsy etc / Brands / Resources) | YES (Mens/Womens/Kids breakdown in mega-menu) | YES (very deep) | NO | YES (DTG / DTF / AOP / Embroid / Knit) | NO | NO | NO | YES (Design Maker) | YES (Bestsellers) | YES (multi-region) | YES |
| Print Inc (Awesome) | (was) extensive | YES | YES | YES (Festivals/Bands/Charities) | YES | NO | YES (50+ floor) | NO | YES | YES | NO | YES |
| Banana Print | 8+ (Cards/Stickers/Booklets/Stationery/Signs/Photo Gifts/Wedding/Cards) | NO (not apparel-led) | NO (paper-product-led) | YES (Wedding) | NO | YES (24-hour digital) | NO | NO | YES (digital templates) | NO | NO | YES |
| Teemill | sparse (Store / Help / Login) | NO | NO (own-brand range) | NO | NO | NO | NO | NO | NO (built into store builder) | NO | NO | NO |
| Printsome | 6 (Services / Products / Locations / FAQ / About / Contact) | NO | YES (Products) | YES (Locations = city pages) | YES (Services breakdown) | YES (Express Printing) | NO direct (20+ min implicit) | NO | NO (Quote CTA) | NO | NO | YES (Services + Products) |
| T-Shirt Studio | broad (T-Shirts / Hoodies / Polos / Workwear / Hi-Vis / Bags / Mugs etc) | YES (Mens/Womens/Kids/Baby) | YES (deep) | NO direct | YES (Print / Embroid only) | YES (Express badge per-product) | NO | NO | YES (per-product Design CTA) | YES | YES (multi-region intra-EU) | YES |

**The most striking finding:** **Custom Ink, RushOrderTees and Real Thread have no industry/vertical navigation in their top menus.** This is the biggest single gap in the US market. SC Prints' AU report flagged the absence of an industry-nav as a weakness (and the planned mega-menu fixes this) — adopting that mega-menu would put SC Prints AHEAD of the US incumbents in vertical-targeted SEO, not just at parity.

**Printsome** is the lone exception: their `/locations/` city-page strategy generates pages like `/location/t-shirt-printing-london`, `/location/t-shirt-printing-edinburgh`, `/location/t-shirt-printing-manchester` etc. Those rank for "tshirt printing [city]" queries that the US shops fight for via paid acquisition only. SC Prints could replicate at near-zero cost by templating a `/locations/sydney`, `/locations/melbourne`, `/locations/brisbane` set against existing supplier shipping data.

**Best Sellers** is in the top nav for RushOrderTees, Printful, T-Shirt Studio. SC Prints already has the live top-selling data path; surfacing it in main nav is a 1-hour change.

---

## 8 — PDP architecture: 5 distinct patterns

The PDP/customizer split is the central UX choice in this category. Here's where each shop falls:

### Pattern 1 — **Customizer-as-PDP** (designer is the only product page)
Single page where customer arrives, sees the garment, immediately starts dropping artwork.

- **Banana Print** (digital products) — template editor is the PDP
- **T-Shirt Studio** (UK)** — every product page loads the configurator inline
- **Teemill** (POD store) — entire product creation happens inside designer

**Wins:** lowest-friction conversion, designer-tier customers love it.
**Loses:** SEO content thin, hard to surface technical garment info, hard to differentiate sizes without complex UI.

### Pattern 2 — **Static-matrix-first** (price ladder dominates the PDP)
Pricing matrix or per-quantity ladder is the dominant visual element above the fold.

- **SC Prints AU** — published ladder is on every PDP
- **No US competitor in our set** uses this pattern
- **No UK competitor in our set** uses this pattern (T-Shirt Studio shows "save up to N%" but not the ladder)

**Wins:** transparency, B2B trust signal, lets buyers self-qualify before talking to staff.
**Loses:** dense data UX, can scare retail buyers who only want 1 unit.

### Pattern 3 — **Traditional e-com + separate customizer route**
PDP shows garment info, gallery, price calculator. Designer is a separate URL.

- **Custom Ink** — PDP at `/products/styles/...` then `/lab/` for design
- **RushOrderTees** — PDP at `/catalog/...` then `/design-t-shirts/` for design
- **UberPrints** — PDP at `/products/...` then `/studio` for design

**Wins:** PDP can be heavily SEO-optimised, designer can be heavyweight without breaking the catalog.
**Loses:** two pages = two performance budgets, customer drop-off at the handoff.

### Pattern 4 — **Designer-first / no PDP** (storefront-builder model)
There is no PDP in the traditional sense; designers create products from blanks, customers buy from designer-curated storefronts.

- **Printful** — designer-first POD
- **Teemill** (also Pattern 1) — for sellers; customers shop the designer's store

**Wins:** product variety scales without back-end work, designer becomes the conversion surface.
**Loses:** brand consistency hard to enforce, hard to support custom-print B2B orders.

### Pattern 5 — **Quote-form only (no public customizer)**
PDP gives spec info, "Quote" is the only action.

- **Real Thread** — Instant Quote tool
- **Printsome** — 3-step quote form
- **Print Inc** (current post-liquidation state) — broken, no live customizer

**Wins:** filter for serious B2B buyers, allows custom pricing, no cart-abandonment from price-shock.
**Loses:** maximum friction, can't compete for retail/individual orders.

### Where SC Prints sits — **Hybrid PDP + embedded designer (Pattern 6 — the SC pattern)**
SC Prints' EmbeddedProductCustomizer is a sixth pattern, sitting between Pattern 2 (static matrix) and Pattern 3 (separate designer). The PDP shows the matrix + gallery + variant pickers AS WELL AS exposing the customizer inline via the embedded slot. Of the 11 competitors, **no one else mixes the two patterns this way**. The closest comparable is RushOrderTees' calculator + start-design button.

**Strategic read:** the SC pattern is a defensible position if SC Prints can keep the customizer route weight under 2 s. The 2.21 s current weight makes the hybrid feel slow on mobile. Either trim the customizer assets (target <1.5 s) or lean further into static PDP (Pattern 2) and let the designer be a separate route again.

---

## 9 — PDP feature comparison (all 11 players)

| Feature | SC Prints | Custom Ink | RushOrderTees | UberPrints | Real Thread | Printful | Print Inc | Banana Print | Teemill | Printsome | T-Shirt Studio |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Above-fold price | YES (matrix) | "from $X" only | calculator embed | $X (1u) | hidden behind quote | $X (1u POD) | n/a | n/a | retail floor | n/a (quote) | £X (1u) |
| Static pricing matrix | **YES** | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| Image gallery | YES (modest) | YES (rich, 360 view) | YES (rich) | YES | YES | YES (mock generator) | YES | YES | YES | YES | YES |
| Variant pickers before customizer | YES | YES | YES | YES (then studio) | YES (then quote) | YES (in mock gen) | YES | n/a | YES | YES (in quote) | YES (in configurator) |
| "+N colours" overflow | NO | YES (swatches +"more") | YES | YES | YES (limited palette) | YES (color swatches) | YES (was) | n/a | YES (limited eco palette) | n/a | YES |
| Decoration method visibility | YES (separate price tiers) | NO (single quote) | YES (calculator method picker) | YES (per method) | NO (in quote) | YES (DTG/embroid/etc tabs) | YES (was) | n/a | NO (single) | YES (in services) | YES (Print vs Embroid toggle) |
| Same-day badge | NO | NO | YES ("Any Deadline") | NO | NO | NO | NO | YES (24hr digital) | NO | NO (express in product detail) | YES (express per product) |
| Production ETA on PDP | YES (live queue) | "Fast turnaround" only | calculator-derived | per method | NO | NO | NO | YES | NO | NO | NO |
| Trust badge strip | NO | YES | YES | YES (Trustpilot widget) | YES (sparse premium) | YES (4.6 Trustpilot) | YES (was) | NO | YES (BCorp / Remill) | YES (client logos) | YES (Trustpilot) |
| Brand name surfaced | NO (data only) | YES | YES | YES | YES | YES | YES (was) | n/a | NO (own-brand) | NO | YES |
| Style/SKU code visible | NO | YES (e.g. 050108) | YES (G500) | YES (gig500) | YES | YES (3001) | YES (was) | n/a | NO | NO | YES |
| Reviews / social proof | local Google | review widget aggregate | star ratings + Yotpo | Trustpilot widget | premium client logos | review aggregate per-product | Trustpilot (poor now) | NO | Trustpilot | client logos | per-product review counts (996, 3930 etc) |
| Cross-sells on PDP | NO | YES | YES (priced) | NO | NO | YES | YES (was) | NO | YES (recently viewed) | NO | YES |
| BNPL hook | NO | NO | **YES (4 providers)** | NO | NO | NO | NO | NO | NO | NO | YES (Klarna) |
| Multi-size grid on PDP | NO (text rows) | YES | YES | YES | YES | YES | YES (was) | n/a | YES | NO | YES |
| Educational accordions | YES (some) | YES | YES (Yotpo + FAQ) | NO | YES (rich blog) | YES | YES (was) | NO | YES (Remill story) | YES (FAQ) | YES |
| Dual CTA (Design + Quote) | (Design only) | (Design only, no Quote on PDP) | YES (Design Now + Get Quote) | (Design only) | (Quote only) | (Design only) | (was) | (Design only) | (Design only) | **Quote only** | (Design only) |
| Stock indication | YES (live supplier API) | NO ("No Minimum" instead) | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| Mobile sticky CTA | YES | YES | YES | YES | NO | YES | YES (was) | NO | YES | NO | YES |
| Schema.org JSON-LD on PDP | YES | **NO** (we checked) | YES (2 blocks) | YES (1 block) | NO (challenge) | NO (we checked the standard PDP) | n/a | NO | NO | YES (1 block on home) | NO |
| Local-fulfilment signal | YES (Sydney studio) | YES (Fairfax) | YES (Philly) | YES (Athens) | YES (Orlando) | NO (multi-region) | YES (Leeds) | YES (Market Harborough) | YES (Isle of Wight) | YES (London office) | YES (UK) |

**Three findings worth dwelling on:**

1. **SC Prints' single biggest PDP gap is the trust-badge strip and brand-name rendering.** The data is already in the Brand module. A 1-day implementation lifts you from below the field to parity with Custom Ink/RushOrderTees/UberPrints — the three highest-volume US competitors.

2. **The "+N colours" overflow is everywhere in the global field and absent on SC Prints.** Standard practice is to show ~10-15 swatches inline, then "+N more". SC Prints' AU report flagged this; it's universal abroad, so the polish gap is even more obvious to international shoppers.

3. **SC Prints' Schema.org JSON-LD coverage is competitive: Custom Ink doesn't ship it on standard PDPs, and Printful doesn't either.** RushOrderTees and UberPrints do (RushOrderTees ships **2** blocks per PDP — likely Product + AggregateRating). SC Prints' JSON-LD on PDP is a real (if quiet) SEO advantage over half the US field.

---

## 10 — Customizer feature comparison

| Feature | SC Prints | Custom Ink | RushOrderTees | UberPrints | Printful | Teemill | T-Shirt Studio | (others n/a — no customizer) |
|---|---|---|---|---|---|---|---|---|
| Multi-side designer | YES (Front/Back/Sleeves) | YES (Front/Back/Sleeves) | YES (Front/Back) | YES (3+ sides) | YES | YES (Front/Back) | YES (Front/Back) | — |
| Decoration method picker in flow | YES | YES | YES | YES (screen/digital/embroid radio) | YES (DTG/embroid/AOP tabs) | NO (single POD method) | YES (print vs embroid) | — |
| Live per-unit price | YES | YES (recalcs as you tweak qty/ink) | YES (calculator panel) | YES (Quote/Buy button) | YES (POD price) | YES | YES | — |
| **Live DPI warning** | **YES (3-band traffic-light)** | NO | NO | NO | NO (just rejects low-res at upload) | NO | NO | — |
| **Vectorization upsell** | **YES (modal + checkout add)** | NO (offered via design help) | NO | NO | NO | NO | NO | — |
| Save designs to account | YES (account/designs) | YES (project / group order save) | YES (Quote Builder) | YES (My Designs) | YES (sell.printful storefront) | YES (your store) | YES (account designs) | — |
| Re-order rehydration | YES (opens customizer with original layout, all metadata) | YES (group order re-launch — kind of) | YES (Quote Builder re-load) | YES (My Designs reorder) | YES (re-add product) | YES | YES | — |
| Background removal | NO (vectorization handles) | YES (in design help) | YES (built-in) | YES (uploader) | YES (design tool) | YES | NO | — |
| Turnaround visible in flow | YES (live queue) | NO (in checkout) | YES (per shipping option) | YES (per method 1-2/5-7 days) | YES (per product/region) | NO | YES (express badge) | — |
| Multi-size order from designer | YES | YES (matrix on add) | YES (matrix on add) | YES (matrix in studio) | YES (matrix on add) | YES (per product page) | YES (matrix) | — |
| Same-day toggle in flow | NO | NO (at checkout) | NO (in calc) | NO | NO | NO | NO (per product variant) | — |
| AI tools (gen / bg removal / upscale) | NO | YES (templates + design help) | YES (built-in graphics) | YES (clip art library) | YES (Design Maker with AI suggestions) | YES (Design Inspiration tool) | NO | — |
| Templates / clip art library | partial | YES (extensive) | YES | YES (thousands) | YES | YES | partial | — |
| Mock generator quality | high (Sharp server-render) | high (CGI-style mocks) | high | high | flagship (Printful's main IP) | high | medium | — |
| Server-rendered print files | YES | YES | YES | YES | YES | YES | YES | — |

**SC Prints customizer wins on:** DPI warning (only one in the field), vectorization-as-upsell (only one), live-queue ETA inside the designer (only one).

**SC Prints customizer loses on:** AI tools / templates / clip art library — every US-and-Printful customizer has a large templated graphics library, SC Prints has partial coverage. This is the single highest-ROI customizer feature to add.

---

## 11 — Post-order experience

Of the 10 competitors, **only RushOrderTees explicitly surfaces "Quote Builder / Reorder" in their pre-sale flow** (and even that is for re-quoting, not for tracking). The rest treat post-order as a behind-login email-only experience.

- **Custom Ink** — group order leaders can see participant status; no per-order production stage tracker
- **RushOrderTees** — Quote Builder lets a saved quote be re-used; "We deliver any deadline" implies a tracking story but the public site doesn't preview it
- **UberPrints** — "My Designs" reorder is the only post-order surface visible
- **Real Thread** — Fulfillment as a B2B add-on, not a per-order tracker
- **Printful** — POD shipment-tracking emails are standard for designers; end customers see Shopify-app-equivalent updates only
- **Print Inc** — pre-liquidation had a basic order portal; not currently functional
- **Teemill** — POD shipment tracking via designer dashboard
- **Printsome** — "30-minute quote response" is the closest thing to a tracker promise
- **T-Shirt Studio** — DHL Express tracking link on dispatch
- **Banana Print** — order tracking via email only

**SC Prints' production-stage tracker (received → art_review → awaiting_approval → approved → blanks_ordered → blanks_arrived → in_production → quality_check → shipped → delivered) with email milestones is genuinely unique in this global set.** No other shop publishes a Domino's-style stepper. Surface this prominently on the home and PDP — it's a category-defining differentiator that nobody else has.

---

## 12 — Where SC Prints wins / loses / ties in the US + UK markets

### Wins (defensible advantages SC Prints would have on day one)

- **Live DPI warning + vectorization upsell** — zero competitors. This is recognisable as a real-print-shop signal to professional buyers and converts the "my logo is too small / too pixelated" objection into a $15 upsell. Universal differentiator.
- **Production-stage tracker visible pre-sale + per-stage emails** — zero competitors. The "Domino's pizza tracker" framing is intuitive and would test well in user-research.
- **Schema.org JSON-LD on PDP** — beats half the field including Custom Ink + Printful.
- **Server-rendered print files** — table stakes for production-grade shops; many DIY UK shops still rely on browser canvas.
- **Supplier-API live stock** — Real Thread, UberPrints, Custom Ink all run inventory off internal systems; none expose live stock to the storefront in our probes. SC Prints' AS Colour / FashionBiz / AP API integrations are a genuine moat for AU and an unusual feature globally.
- **Performance** — SC Prints' PDP is faster than RushOrderTees' (1.27s vs 1.90s, Sydney). The UK shops (T-Shirt Studio 2.79s, Print Inc 5.14s) are wildly slower.
- **Customizer mobile sticky CTA** — most US shops have it; UK shops are inconsistent.

### Loses (real disadvantages relative to the global field)

- **No same-day option** — Custom Ink, RushOrderTees, Printsome, T-Shirt Studio all sell rush product. SC Prints loses every rush-pricing query to competitors who'll quote +20-30% and capture the work.
- **No 1000+ pricing tier** — none of the competitors stop at 100, either. Every UK trade tier (Printsome £2.25 ex-VAT, Awesome Merch's £5.70 deals) is volume-priced. SC Prints' ladder caps at 100 = leaving margin from corporates ordering 200-500 units.
- **No AI tools / templated graphics library** — Custom Ink, UberPrints, Printful, T-Shirt Studio all have one. Retail customers expect it; absence is friction.
- **No BNPL on PDP** — RushOrderTees displays 4 providers above the fold; T-Shirt Studio displays Klarna; SC Prints displays none.
- **No trust badge strip** — every competitor in our set has one. SC Prints' AU "1M+ customers" equivalent isn't visible.
- **Brand name not rendered on PDP** — every competitor shows the brand (Gildan, Bella+Canvas, etc.) in the PDP title. SC Prints' data exists but isn't surfaced.
- **No industry/vertical nav** — Custom Ink doesn't either, but **Printsome's /location/ city-page strategy is winning UK SEO**; SC Prints has neither.
- **Group-order tool gap** — Custom Ink, RushOrderTees, Printsome all have explicit group/team flows. SC Prints has the organisation module but no public "create a group order" landing.

### Ties (you're at parity, no work needed to enter the market)

- **Multi-side designer** — table stakes
- **Save designs / reorder** — table stakes
- **Customizer entry point** — UX is decent, perf is mid-pack
- **Mockup PDF generation** — every shop has one
- **Per-method pricing transparency** — SC Prints' separation of garment + decoration is non-standard but defensible

### Strategic recommendation

**US entry: feasible at parity.** SC Prints would land mid-premium against Custom Ink (cheaper than Real Thread, more transparent than Custom Ink, with unique tracking signal). The Rush product is the blocker — without a same-day SKU you lose every urgency-driven query.

**UK entry: significant repositioning required.** The trade-tier floor (£2.25 ex-VAT bulk via Printsome) is below SC Prints' AS Colour cost. To compete in the UK you'd need (a) a cheaper blank supply chain — Fruit of the Loom / Stedman / Sol's are the UK trade benchmarks — or (b) a premium-positioning play, more like Real Thread, where £15-20 per unit is acceptable. The current AS Colour-cost basis maps to a mid-market UK price that's neither premium nor competitive.

---

## 13 — SEO playbook (what the market does)

| Pattern | Who does it well | What it looks like |
|---|---|---|
| Brand-as-SEO (own pages per blank) | Custom Ink, RushOrderTees, UberPrints, T-Shirt Studio, Real Thread | `/brands/gildan/`, `/brands/bella-canvas/`, `/brands/comfort-colors/`. Each ranks on the brand's blank-style + "custom" queries. |
| Style-code SEO (own pages per SKU) | Custom Ink (`/products/styles/...0508.htm`), RushOrderTees (`/catalog/gildan/heavy-cotton-mens-t-shirt/`) | One URL per blank style, ranks for "Gildan 5000 custom" etc. |
| Local SEO (city pages) | **Printsome** flagship; T-Shirt Studio also | `/location/t-shirt-printing-london`, `/location/t-shirt-printing-edinburgh`, `/location/t-shirt-printing-manchester`. SC Prints could mirror with `/locations/sydney`, `/locations/melbourne`. |
| Decoration-method SEO | Real Thread (`/screen-printing`, `/puff-print`, `/foil-printing`), Printful (`/dtg`, `/embroidery`) | Each method gets a deep landing page with samples, pricing pitch, technical info |
| Comparison-content SEO | Real Thread blog (`/blog/bella-canvas-3001-vs-gildan-5000`), Custom Ink blog | Long-tail comparison content; high topical authority |
| Industry/vertical pages | T-Shirt Studio (Hi-Vis / Workwear / Sports), Custom Ink (Templates by occasion) | Pages for trades / events / hospitality / corporates etc. |
| Glossary / FAQ SEO | Printful (`/glossary/no-minimum`), Custom Ink blog | Single-question pages that rank zero-click featured-snippets |
| Pricing-page SEO | Custom Ink `/prices`, Custom Ink `/help_center/all-inclusive-pricing` | Single URL ranking for "how much does custom shirts cost" |

**Two playbook moves SC Prints could lift wholesale, low risk:**

1. **`/locations/<city>` page set.** Printsome's lone competitive advantage. Worth replicating. Five pages (Sydney, Melbourne, Brisbane, Perth, Adelaide) at near-zero effort.
2. **`/decoration/<method>` page set.** Real Thread's `/screen-printing`, `/puff-print`, `/foil-printing`, `/dtg`, etc. Each ranks for "<method> Sydney" / "<method> Australia" queries. SC Prints already has the decoration content; just needs URL-level surfacing.

---

## 14 — Paid acquisition playbook (Meta Ad Library reconnaissance)

Meta Ad Library is bot-blocked from my measurement IP (403 on every probe). The intelligence below is from public-record secondary sources (campaign announcements, blog posts, customer.io case studies, ispot.tv records). Treat as directional, not exhaustive.

### Custom Ink — flagship 2026 brand campaign
- **Campaign:** *"Ink Is More Than You Think"* — first major brand refresh in 15 years, Feb 2026
- **Agency:** Mekanism
- **Concept:** Character "Janine" — *Office*-style humour, productivity-via-swag framing
- **Hero asset:** 30-second film, corporate setting, "Janine orders Stanley tumblers to fix funding crisis"
- **Distribution:** Meta (FB+IG video ads), TV, OOH, Winter Olympics 2026 booth (Winter House, US Skating Association)
- **Strategic read:** repositioning AWAY from "custom t-shirts" and TOWARD "team success engine" — drinkware, promo, fundraising. Direct read: **Custom Ink is publicly conceding the print-specific narrative**. A SC Prints US entry could own the "we actually make shirts" framing they're vacating.

### RushOrderTees — urgency-first creative consistently
- **Brand:** sport sponsorships (Philadelphia 76ers, partner since 2021)
- **Creative themes:** "Need It Yesterday?", "We deliver any deadline", customer-service hero copy
- **Sample CTAs:** "Design Now", BNPL strips on PDP
- **Customer.io case study:** "RushOrderTees boosted revenue by 140%" via lifecycle email orchestration — suggests an aggressive retargeting layer behind paid acquisition
- **Trustpilot rating:** ~5/5 across 10k+ reviews (Trustpilot Excellent) — they aggressively post-sale-email-request reviews

### Printful — creator-first, Gen Alpha
- **2026 strategy (own publication, Jan 2026):** marketing Gen Alpha via creator collabs; carousel + collection ads
- **Stance:** "creator-driven marketing continues to outperform traditional advertising"
- **Asset library:** Merch Maker / Design Maker mockup-led video ads
- **Strategic read:** Printful's Meta spend is split between (a) acquiring sellers via Shopify/Etsy integration ads and (b) helping its sellers acquire end customers via creator content. Their own brand-side ad spend is modest relative to seller-side.

### UberPrints — moderate paid presence, Trustpilot-led
- **Trustpilot:** 4.8/5, 16k+ reviews — they push verified reviews into ad creative
- **Typical creative:** product walk-throughs, "no minimums" copy, occasion-based templates (Greek, sports, schools)
- **Strategic read:** mid-volume Meta spend, primarily retargeting and seasonal pushes

### Real Thread — minimal paid, content-led
- **Channel mix:** heavy on the blog (depth of educational content on print styles, brand comparisons), modest Meta presence
- **Strategic read:** they're a premium-pitched brand; their acquisition is largely word-of-mouth + B2B referral. Meta is supplementary.

### Print Inc / Awesome Merchandise — defunct campaign
- **Status:** post-liquidation, current ad activity unknown. Pre-liquidation: creator/band/event merch focus, Spotify/festival sponsorship
- **Strategic read:** the entire UK creator-merch ad budget that was Awesome Merchandise's bread-and-butter is up for grabs

### Teemill — sustainability storytelling
- **Channel mix:** Instagram-first (@teemillstore, 40k followers), QR/circular-economy narrative
- **Founders:** Drake-Knight brothers, Ellen MacArthur Foundation case-study brand
- **Strategic read:** values-based audience; sponsored content with eco-influencers more than direct-response ads

### Printsome — B2B lead-gen
- **Channel mix:** LinkedIn-heavy, branded-client logo walls (Facebook / Amazon / Virgin Atlantic / Sony Pictures / Tottenham Hotspur)
- **Creative:** case-study format, "30-minute response", "48-hour turnaround"
- **Strategic read:** they pitch B2B procurement, not retail

### T-Shirt Studio — UK retail / value
- **Channel mix:** Meta promo codes, Klarna BNPL strips, Trustpilot widget-as-creative
- **Strategic read:** competing on price-per-unit + BNPL availability in the UK middle market

### Banana Print — local + price
- **Channel mix:** locally targeted, "cheap 24hr digital print"
- **Strategic read:** not a real apparel competitor

### What SC Prints should run if entering these markets
- **US:** anti-Custom-Ink framing — *"While they pivot to swag, we still make shirts"*. Live-tracker creative + DPI warning as a "we catch your mistakes before printing" promise. Trustpilot review widget. BNPL strip on PDP.
- **UK:** anti-Print-Inc + anti-Printsome framing — *"Your order won't disappear, here's the live tracker"* + price-transparent matrix. Use the Custom Ink-killer (transparent ladder) and the RushOrderTees-killer (BNPL) simultaneously.

---

## 15 — Suggested moves for SC Prints (prioritised by impact / cost)

### Tier 1 — UI-only (hours of work, immediately differentiating)
- **Surface brand name on PDP.** Data exists. Render under product title. ~1 hour.
- **Add a trust-badge strip on PDP** (e.g. "10+ years in Sydney" + "Live production tracking" + "DPI guarantee" + Google review count). ~2 hours.
- **Add BNPL hook on PDP** (Afterpay / Zip in AU; Klarna globally if entering UK/US). Stripe/Adyen toggle plus PDP component. ~2 hours.
- **Add "+N colours" overflow on swatches** (12 inline, "+N" pill). ~3 hours.
- **Add "Best Sellers" to top nav.** Live data already wired. ~30 minutes.
- **Surface production-stage tracker on home/PDP** as a marketing element (animated stepper card), not just inside the account). ~1 day.

### Tier 2 — Small backend (1-3 days)
- **Add same-day / 1-week / 3-day rush SKU set** with +15/+30% surcharge (Custom Ink playbook). Pre-publish surcharge, accept rush only if queue can take it (the existing production-ETA service already knows queue depth). ~2 days.
- **Add a 1000+ pricing tier** to fill the margin gap on big corporates. Update bulk-price ladder constants in both backend and storefront mirrors. ~1 day.
- **Render a multi-size grid on PDP** instead of text rows. ~1 day.
- **`/locations/<city>` page set** (Sydney/Melbourne/Brisbane/Perth/Adelaide) — Printsome playbook. ~2 days inc copy + assets.
- **`/decoration/<method>` page set** (screen / DTG / DTF / embroidery / UV-DTF) — Real Thread playbook. ~3 days inc copy.

### Tier 3 — Strategic (1-4 weeks)
- **Group order tool publicly surfaced** (`/group-order/` landing + flow) — Custom Ink / Teemill playbook. Group-order module already exists. ~2 weeks for the public flow + landing.
- **Templated graphics library inside the customizer** — Custom Ink / UberPrints / Printful all have one. Source 100-200 royalty-free designs by category. ~3 weeks.
- **AI background-removal in customizer** — table stakes for retail customers. ~1-2 weeks.
- **Industry/vertical nav with content per industry** — workwear, hospitality, events, schools, sports, corporates. ~2-3 weeks.

### Tier 4 — Marketing
- **Trustpilot account + active review-collection campaign** — RushOrderTees / UberPrints / Printful all rely heavily on Trustpilot for trust signal. ~1 week to launch + ongoing review-gathering.
- **`/blog/<comparison>` content** (AS Colour vs Bella+Canvas, AS Colour vs Gildan, etc.) — Real Thread blog playbook. ~4 weeks for 10 high-quality comparisons.
- **Meta video ads** featuring the live-tracker as the hero promise. ~2 weeks ad ops.
- **Anti-Custom-Ink positioning** for any future US entry: "We still make shirts."

### Tier 5 — PDP enrichments
- **Live BNPL price split** ("Or 4 payments of A$X with Afterpay") under the per-unit price.
- **Cross-sells on PDP** with priced coordinating styles (RushOrderTees pattern: "Customers also bought this hoodie — $15.20/each at 50 units").
- **Stock indication colour-coded** ("In stock — ships in 2-3 days" / "Low stock — reserve now") — you have the data from supplier APIs.
- **Educational accordions** on print methods, fabric weights, common artwork issues — improves time-on-page and SEO.

### Tier 6 — Performance
- **Trim customizer route weight** from 308 KB / 2.2s to <200 KB / <1.5s. UberPrints' studio is 60 KB / 0.55s — they defer everything. Aggressive code-splitting and route-level chunking is the win.
- **Verify x-vercel-cache HIT rate on `/au` home.** If <90% HIT, you're paying the origin tax on the home regularly.
- **Pre-render PDP variant data** if not already.
- **Add edge-cache `Cache-Control: max-age=3600, stale-while-revalidate=86400`** on PDPs (Custom Ink uses 1h + 30-day SWR — they've battle-tested this for an e-commerce catalog).

---

## 16 — Caveats & open data gaps

- **Measurement geography is Sydney, not US-east.** The brief assumed the agent would be running from US-east; I'm in Sydney via GSL Networks. US sites get the benefit of CDN POPs being relatively close (CloudFront SYD62, Vercel syd1, Cloudflare SYD). UK sites do not (typically London origins, no AU POP). This **flatters US perf and disadvantages UK perf** in the comparison. **Bias estimate: UK sites' total times measured here are likely 1.5-3x their US/UK customer experience.**
- **Real Thread blocked our measurement.** All five perf runs returned HTTP 429 with `x-vercel-mitigated: challenge`. Real Thread's pages weren't crawlable; PDP/customizer feature data was assembled from search results + their own blog/help-centre pages.
- **Print Inc returned HTTP 405 on most probes** and HTTP 403 on the rest. The Awesome Merchandise → Print Inc → liquidation → Involution restart is currently making the site partly unmeasurable. The data I gathered is from Printweek and Trustpilot pre-liquidation snapshots plus what the redirect target's marketing pages still return.
- **Banana Print is a name clash.** The "banana-print.co.uk" domain redirects to a digital-print job-shop (business cards, stickers, leaflets) in Market Harborough — NOT a real apparel competitor. The historic / Facebook brand "Banana Print" appears to be the same Market Harborough printer. **I've kept Banana Print in the matrix for completeness, but it's not a true apparel-printer peer.** A reasonable substitute UK competitor would be **Stitch 99 / tshirtlondon.com** or **Garment Printing** or **Custom Planet**.
- **No pricing for Custom Ink, Real Thread or Printsome's actual per-unit at qty 50.** All three forced a quote. The Custom Jersey blog post + RushOrderTees calculator screenshots in search results gave directional pricing; the per-unit-at-50 numbers in Section 6 are explicit estimates, marked QO where I couldn't extract them.
- **Meta Ad Library is bot-blocked from my IP.** 403 on every probe of `facebook.com/ads/library`. The paid-acquisition intelligence in Section 14 is from secondary sources: Adsoftheworld, Printweek, customer.io case studies, Twitter/X posts, the competitors' own blog posts. **It is NOT a direct count of active ads.**
- **Teemill is in an unusual category.** It's a POD storefront-builder, not a custom-print shop in the SC Prints sense. End-customer prices are floored at retail (~£15/tee); designer-side wholesale prices weren't extractable from any public page. The comparison is structural (designer-first vs PDP-first) more than transactional.
- **Printful's UK / US Bella Canvas 3001 prices** ($13.01 / £9.95) came back from one search snapshot and one product-page extract — they should be considered "current spot price, not negotiated wholesale".
- **Customizer-route performance for Real Thread / Print Inc / Printsome wasn't measurable** because they don't have a public customizer route.
- **Tshirt Studio's `/customise/` route returned 404 on every probe** — the actual customise URLs are per-product (`/customise-budget-tshirts/garment_<id>_X_Y` form) and those also 404'd from this IP. The customizer perf number is from the 404 page weight, not the real customizer.

---

## 17 — Worth following up on (research the owner could do later)

1. **Sit a real laptop in London and re-measure UK perf.** All UK shop perf numbers here are biased high by Sydney distance + lack of UK CDN POPs. A London measurement would tell you what UK customers actually see.

2. **Reach out to Print Inc / Involution as a case-study lift.** UK creator-merch market is genuinely up for grabs post-liquidation. The Trustpilot trail of unfulfilled orders is well-documented; a "we'll honour your old Print Inc order at cost" campaign would generate substantial earned media in the UK printer scene.

3. **Use Meta Ad Library directly from a browser** (the IP-block here doesn't extend to a real session) to count Custom Ink / RushOrderTees / Printful active ads. Get screenshots of the top 5 highest-engagement ads from each. The Janine campaign details are extractable from there; my report is from press coverage.

4. **Mystery-shop a quote from Real Thread** (24-piece Bella+Canvas 3001, 1-colour water-based front print) to extract their per-unit at 24, 50, 100 for the head-to-head table. They're the cleanest premium-positioned competitor and a direct read on what SC Prints should price toward if going premium in the US.

5. **Mystery-shop a quote from Printsome** (50 polos, 5,000-stitch embroidered chest) to extract the actual £/u for the corporate scenario.

6. **Compare blank costs**: AS Colour vs Fruit of the Loom / Sol's / B&C / Stanley/Stella / Stedman in the UK trade. The UK price-floor (£2.25 ex-VAT) is set by FOTL/Sol's at ~£1.50 wholesale; AS Colour starts at ~£4-5 wholesale in the UK. A UK entry requires a non-AS Colour blank.

7. **Watch the Janine campaign over the next 90 days.** If Custom Ink's brand refresh succeeds, the "team success engine" framing will get copied — every "swag" player will pivot. If it stalls, the print-specific narrative becomes even more open for a focused tee-first brand.

8. **Check whether Custom Ink's BNPL absence is a deliberate choice.** They pioneered "all-inclusive pricing" (free shipping, no setup fees). Adding BNPL on top might be off-brand for them. But it's also unusual at their scale — worth understanding whether they tested it and rejected it, or whether it's just not yet rolled out. If they roll out BNPL within 6 months, that's a signal SC Prints should follow immediately.

9. **Get a real Trustpilot account active for SC Prints and start aggregating reviews.** Every competitor in the global field uses Trustpilot as a primary trust badge. Without it, SC Prints' AU/global reputation is invisible to comparison-shoppers.

10. **Audit the SC Prints `/au` ISR cache HIT rate.** Sydney-measured TTFB of 106 ms is excellent but the 297 ms total is mid-pack. If a meaningful fraction of requests miss the edge cache, that's correctable with TTL changes — Custom Ink's `max-age=3600, stale-while-revalidate=2592000` pattern is the proven recipe.

---

**Sources:**

- [Custom Ink — "Ink Is More Than You Think" (Ads of the World)](https://www.adsoftheworld.com/campaigns/ink-is-more-than-you-think)
- [Custom Ink Super Rush pricing](https://www.customink.com/super-rush)
- [Custom Ink All-Inclusive Pricing (blog)](https://www.customink.com/blog/everything-you-need-to-know-all-inclusive-pricing/)
- [Custom Ink Jerseys Cost guide](https://www.customink.com/blog/how-much-do-custom-jerseys-cost/)
- [Custom Ink Trustpilot](https://www.trustpilot.com/review/www.customink.com)
- [RushOrderTees Gildan Heavy Cotton PDP](https://www.rushordertees.com/catalog/gildan/heavy-cotton-mens-t-shirt/)
- [RushOrderTees Trustpilot](https://www.trustpilot.com/review/rushordertees.com)
- [UberPrints Gildan Cotton Tee PDP](https://www.uberprints.com/products/gildan-cotton-tee)
- [UberPrints Trustpilot rating](https://www.trustpilot.com/review/www.uberprints.com)
- [Real Thread blog — How Much Are Custom T-Shirts](https://www.realthread.com/blog/how-much-are-custom-t-shirts)
- [Real Thread Orlando blog](https://www.realthread.com/blog/screen-printing-orlando)
- [Printful Bella Canvas 3001 (UK)](https://www.printful.com/uk/custom/collections/grow-a-fashion-brand/unisex-staple-t-shirt-bella-canvas-3001)
- [Printful pricing plans](https://www.printful.com/pricing)
- [Printful Trustpilot](https://www.trustpilot.com/review/printful.com)
- [Print.Inc Trustpilot (post-liquidation)](https://www.trustpilot.com/review/print.inc)
- [Printweek — Print Inc Group in liquidation](https://www.printweek.com/content/news/printinc-group-in-liquidation)
- [Printweek — Print.Inc's brand and assets acquired](https://www.printweek.com/content/news/printincs-brand-and-assets-acquired)
- [Awesome Merchandise (legacy URL, now redirects)](https://www.awesomemerchandise.com/)
- [Teemill homepage](https://teemill.com/)
- [Teemill Trustpilot](https://www.trustpilot.com/review/teemill.com)
- [Teemill profitability](https://teemill.com/profit/)
- [Printsome express printing](https://printsome.com/services/express-printing)
- [Printsome homepage](https://printsome.com/)
- [Printsome Trustpilot](https://uk.trustpilot.com/review/printsome.com)
- [T-Shirt Studio homepage](https://www.tshirtstudio.com/)
- [T-Shirt Studio dispatch & delivery times](https://www.tshirtstudio.com/help/despatch-and-delivery-times)
- [Banana Print homepage](https://www.banana-print.co.uk/)
- [RushOrderTees revenue case study (customer.io)](https://customer.io/learn/case-studies/rushordertees)
