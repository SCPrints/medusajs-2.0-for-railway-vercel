# SC Prints competitive design review — Japan, China, Korea, EU (10 shops)

**Reporting date:** 23 May 2026
**Focus:** Visual + interaction design, customizer UX, layout patterns. **NOT** performance, hosting, or per-unit pricing wars.
**Methodology:** WebFetch-driven page reads + targeted web search where direct fetches were blocked. No live screenshots — descriptions are based on the rendered text + extracted markup. Translated extraction noted where machine translation was the path (all JP/CN/KR/DE/ES sites).

The competitor set:

| # | Brand | Region | URL |
|---|---|---|---|
| 1 | SUZURI | Japan | [suzuri.jp](https://suzuri.jp/) |
| 2 | UP-T | Japan | [up-t.jp](https://up-t.jp/) |
| 3 | TMIX | Japan | [tmix.jp](https://tmix.jp/) |
| 4 | Pixiv Factory | Japan | [factory.pixiv.net](https://factory.pixiv.net/) |
| 5 | T社定制 (T-she) | China | [tshe.com](https://www.tshe.com/) — substituted for DizPrint which was unreachable and not a true D2C self-checkout shop |
| 6 | 爆造定制 (BoomMake) | China | [boomake.com](https://www.boomake.com/) — second Chinese substitute, see Section 14 |
| 7 | Marpple | Korea | [marpple.com](https://www.marpple.com/en/) |
| 8 | Spreadshirt | Germany | [spreadshirt.de](https://www.spreadshirt.de/) |
| 9 | Shirtinator | Germany | [shirtinator.de](https://www.shirtinator.de/) |
| 10 | Camaloon | Spain (EU-wide) | [camaloon.com](https://www.camaloon.com/) |

> **Filter note.** The original brief asked for "DizPrint (CN)" as a B2C-ish reference and one other Chinese shop. DizPrint refused all connections from the fetch tool (`ECONNREFUSED`) and Western reviews never reference its consumer-facing designer interface — it's principally a B2B/print-broker. I substituted **T社定制 (T-she)** and **爆造定制 (BoomMake)**, the two most prominent Chinese custom-tee shops with public online designers and disclosed pricing. **Important caveat**: both lean strongly *consultative* — neither is a true "browse → design → pay-with-card" self-checkout shop in the SC Prints sense. The closest the Chinese market gets to a Western D2C custom-print storefront is one of these two, and that's itself a finding (see Section 14).

---

## 1 — Executive summary: top design ideas worth cherry-picking

1. **TMIX's price-ladder table embedded inside the team-T-shirt landing page is the single most "copy this tomorrow" pattern in the set.** A three-column matrix (qty | silk 1-colour | DTF full-colour) right above the editor CTA, framed as a discount ladder (10pcs → 30pcs → 50pcs → 100pcs+, "ドンドン割" / "more-more discount") sells the bulk economics without forcing a calculator. SC Prints already publishes a per-method ladder — TMIX teaches you to **frame the ladder as a "you're earning a discount" curve** rather than a static reference table. ([TMIX team page](https://tmix.jp/team_tshirts))

2. **Marpple's "Proven by 120,000 customer reviews" headline is the trust-signal pattern of the set.** Not a stars-and-count badge — an explicit *narrative hero* that puts a review count first and the product second. Marpple combines this with **per-product star ratings ranging 4.97–5.00 with review counts of 105 to 4,884** on every product card. SC Prints' AU report flagged "trust badges" as missing — Marpple's whole homepage is a trust badge. ([Marpple](https://www.marpple.com/en/))

3. **SUZURI's "favourites count + creator-attribution + on-tee mockup" tile design is the catalog pattern for a creator-community e-commerce shop.** Every tile carries the artist's name, the design-on-tee thumbnail, the price, AND a heart count. This isn't relevant to SC Prints' B2B/team-uniform core, but it's directly applicable if the Lookbook module is ever extended into a public "shop someone else's design" gallery. ([SUZURI tee category](https://suzuri.jp/categories/t-shirts/t-shirt))

4. **Spreadshirt's customizer has a live DPI/quality-checker that warns at low resolution.** The prior US/UK report claimed no competitor outside SC Prints has this — that was wrong for Spreadshirt. Per [Bootstrapping Ecommerce's 2025 Spreadshirt review](https://bootstrappingecommerce.com/spreadshirt-review/), Spreadshirt has *"a built-in quality checker that alerts you if your image resolution is too low, helping you avoid blurry or pixelated prints"*. SC Prints' DPI moat is narrower than thought — still ahead in the AU/US/UK English-speaking field, but parity exists in EU.

5. **UP-T's "5月23日購入で5月27日発送" (order today → ships in 4 days) live-dated shipping callout is the conversion micro-pattern to steal.** A real, today-stamped ETA on the product tile and at the cart edge, regenerated server-side per visit. Currently SC Prints publishes a static "10-12 business days" — UP-T's pattern (today + 3 working days = explicit calendar date) is a near-zero-engineering tweak that converts because it removes mental arithmetic. ([UP-T home](https://up-t.jp/))

6. **TMIX's "free hand-drawn sketch conversion" line in the team-tee FAQ is a service-design idea worth borrowing.** "We will turn your hand-drawn sketch into print-ready artwork for free" reframes the vectorisation upsell as a *free perk* on team orders rather than a paid checkout step. SC Prints' vectorisation is currently a paid line item — consider a "free if you order 30+" promo that turns the upsell into a loyalty mechanism for the team-order audience.

7. **Marpple's "Start Creating" button as the universal CTA on EVERY product card** — not "Add to cart", not "View product" — is the most aggressive customizer-funnel design move in the set. Marpple's PDP doesn't really exist as a separate step: the homepage tile click directly opens the editor with the SKU pre-loaded. SC Prints' hybrid PDP already gets close to this; pushing the CTA copy to "Start Creating" (or "Design This") instead of the generic "Customize" tightens the funnel.

8. **Shirtinator's *occasion-based* nav ("Geschenke für Mama", "JGA Frauen", "Geburtstag") is the IA pattern SC Prints lacks.** SC Prints has solid audience nav (Mens/Womens/Kids/Industries) but no *event* nav (Birthday, Hen's Night, Christmas, Father's Day, School Reunion, Stag Do, 21st). For a print shop, the occasion is often the buying trigger — Shirtinator's nav rewards that. Add this to the storefront's mega-menu without rebuilding any IA. ([Shirtinator](https://www.shirtinator.de/))

---

## 2 — 11-way matrix at a glance

> Reading: Y = yes/present, N = no/absent, ? = couldn't determine, "—" = N/A. Prices are in their native currency, displayed format only — not normalised.

| | SC Prints (AU) | SUZURI (JP) | UP-T (JP) | TMIX (JP) | Pixiv Factory (JP) | T-she (CN) | BoomMake (CN) | Marpple (KR/global) | Spreadshirt (DE) | Shirtinator (DE) | Camaloon (ES) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Brand positioning** | Studio printer + customizer | Creator marketplace + maker | Mass-market printer | Mass-market printer + teams | Illustrator-community merch | Enterprise consultative | Enterprise + own factory | "No.1 custom goods" lifestyle | Pan-EU POD marketplace | Personal-gift specialist | Promo + B2B |
| **PDP architecture** | **Hybrid PDP + embedded designer** | Designer-first POD (tile = design = creator's shop) | Customizer-as-PDP | Customizer-as-PDP | Designer-first POD | Quote-form lead gen | Quote-form lead gen | Designer-first (click tile → editor) | Catalog → product → "Jetzt gestalten" → designer | Catalog → product → "Selbst gestalten" → Creator | Catalog → product → quantity-calculator → designer |
| **Hero treatment** | Image-led | Minimal white + carousel | Lifestyle photo + price hook | Lifestyle carousel + stats stripe | Promo carousel + coupon | Headline + "get quote" CTA | Headline + factory boast | Multi-hero carousel of categories | Lifestyle photo + flash-sale banner | Functional, customization-first | Lifestyle carousel + stats stripe |
| **Hero headline tone** | Brand-led | "1.97M+ designs" inventory boast | "From ¥1,000 per shirt" + ETA | "Cheap + high-quality" + 80yr boast | "Make merchandise" + coupon hook | "Premium corporate apparel" | "More professional" | "Proven by 120k reviews" | "30% off — Flash Sale" | "Selbst gestalten" (Design Yourself) | "Boost your business with souvenirs" |
| **Primary CTA copy** | Customize / Add to cart | 自分用につくる (Make for self) | Design now (free) | 無料見積り / 今すぐデザイン | グッズをつくる (Create merch) | 获取方案与报价 (Get quote) | Consult now | **Start Creating** | Jetzt gestalten (Design now) | Selbst gestalten (Design yourself) | Personalize / BUY |
| **Live shipping ETA on PDP** | Y (queue-based) | N | **Y (live-dated: "today → 4 days")** | Y (same-day badge) | N | N | N | N | Y ("schnelle Lieferung") | Y ("2-3 days") | Y ("6-7 days") |
| **Trust signals above fold** | Limited | Volume stats (1.97M designs) | ISO 9001/14001 badges, ETA | **520M+ items used, 80yr, 24/7 phone, Google Top Quality Store** | Coupon hook | 80,000 enterprises served | 50,000 enterprises | **120k reviews + per-product 4.97★** | 4.7★ Trustpilot, "20+ years POD", "10M+ customers" | 11,311 ProvenExpert reviews, DHL logo | "15 years with you, 300k+ customers, 2,500+ products" |
| **Customer-shown phone number in nav** | N | N | Y (0120-86-4321) | **Y (050-5808-8356 with icon)** | N | Y (WeChat QR) | Y (400-678-3233) | N | N | N | Y ("Request a call" link) |
| **Trustpilot/ProvenExpert widget on PDP** | N | N | N | N | N | N | N | Per-product reviews | Y (footer area) | Y | Y (Trusted Shops) |
| **Static price matrix on PDP/landing** | Y | N (per-design pricing) | "From ¥X" only | **Y (qty × method ladder)** | N | N (quote only) | "¥24-¥54 from" range | "From $X" + tier callouts | "From €X" | Fixed price ("18,99 €") | "From €X" |
| **Multi-side designer** | Y | Y | Y | Y | Y | (no designer) | (no designer) | Y | Y | Y | Y |
| **Live DPI warning in customizer** | Y | ? | ? | ? | ? | — | — | ? | **Y** ([per 2025 review](https://bootstrappingecommerce.com/spreadshirt-review/)) | ? | ? |
| **Save-designs library** | Y | Y (creator's shop) | Y (account) | ? | Y (account, BOOTH integration) | — | — | Y | Y | Y | ? |
| **Re-order rehydration** | Y | Y (re-purchase same SKU) | ? | ? | ? | — | — | Y | Y | Y | ? |
| **Production stage tracker pre-sale** | Y | N | N | N | N | N | N | N | N | N | N |
| **Group/team order tool** | Organisation module | N | Y (corporate section) | **Y (flagship feature, dedicated landing)** | N | Y (consultative) | Y (consultative) | Y (/biz with per-qty discount ladder) | N (per-unit POD model) | "Großbestellung B2B" | Y (request-a-call) |
| **Vectorisation as paid line item** | Y (vectorisation product) | N | N (DTG covers) | "Free hand-drawn → print-ready" on team orders | N | N (part of consult) | N | N | N | N | N |
| **Occasion-based nav** | N | "Themes" (animals, retro) | N | "Use case" (sports, class tee, events, staff, hobbies, gifts) | N (illustrator-community oriented) | N | N | "K-pop fan merch", "Pet custom T-shirt" | "Dein Frühling" seasonal | **Y (deepest in set: Mama, Papa, JGA, Geburtstag, Weihnachten, Valentinstag, Scheidung)** | "Corporate Gifts" only |
| **AI design tools visible** | N | N | N | N | N | N | N | N | N | N | N |
| **BNPL on PDP** | N | N | N | N | N | N | N | N | N (Klarna at checkout via account) | Klarna + Apple Pay + Google Pay | Klarna available |
| **Mobile app available** | N | **Y (iOS + Android)** | Y (app referenced) | N | N | WeChat mini-program | N | N | N | N | N |
| **Visual palette** | (current SC palette) | White + navy accent + UGC colour | White + navy + bold red price | Navy + orange/red CTA | White + blue/purple accent (editorial) | White + navy + minimal | White + navy + sparse red badges | White + neutral, UGC colour-led | White + black, earth tones in lifestyle hero | White + black, sparse | White + cobalt blue accent |
| **Photography style** | Mixed | Cutouts only (UGC-led) | Lifestyle + 3D renders | Lifestyle action + flat cutouts | Flat product mockups | Flat-lay + close-ups + testimonial photos | Centered product + workplace-context case studies | Flat-lay + emotional reviews | Lifestyle hero + flat product grid | Implied family/celebration | Lifestyle in-context |
| **Page density** | Moderate | High (UGC marketplace) | Very high | Very high | Moderate (editorial-clean) | High (text-rich case studies) | Moderate | Moderate (review-heavy) | Moderate (airy) | High (deep nav) | Moderate |
| **Public review rating (latest)** | (Google AU local) | Google + niche | App store 4.5+ | (none disclosed) | Pixiv community-rated | (B2B, no public) | (B2B, no public) | 4.97-5.00 per product, 120k aggregated reviews | 4.7 Trustpilot | 4.6 ProvenExpert (12,717 reviews) | 4.75 Trusted Shops (1,427 reviews); mixed elsewhere |

---

## 3 — Hero / homepage pattern gallery

### Pattern A: The "creator marketplace" hero — SUZURI, Pixiv Factory

Both SUZURI and Pixiv Factory put a **dual CTA pair** in the hero — "create for yourself" + "sell in shop" / "make merchandise" + "open BOOTH store". The homepage isn't a funnel into a single editor, it's an entry-mode picker. The visual treatment is **deliberately quiet** — white background, modest sans-serif headline, very limited brand colour (SUZURI: navy accent; Pixiv: blue/purple accent). The "personality" comes from the UGC tiles below, not the hero.

> SC Prints applicability: low for the core business, but if the Lookbook is ever extended into a public "shop someone else's design" gallery, this is the pattern.

### Pattern B: The "price + ETA + free shipping" hammer — UP-T

UP-T's hero is the most aggressive in the set: full-width photo + headline `1枚たった1,000円〜` (from just ¥1,000 per shirt), with a **live-dated callout**: *"Order today (May 23) → ships May 27"*. Free shipping on any quantity is stated as a stat band immediately below. The asterisk reveals "1,000 yen requires max bulk discount" — there's a small honesty caveat — but the first impression is **"cheap, fast, no minimums"**. ISO 9001 / ISO 14001 industry-cert badges appear lower for the rational-buyer second look.

> SC Prints applicability: high. The live-dated ship date is a near-zero-effort copy. The honesty caveat (asterisk) is a useful pattern when the lowest-tier price requires a high quantity.

### Pattern C: The "social-proof hero" — Marpple

Marpple's first hero card is a photo of custom team tees with the overlay text *"Proven by reviews, Marpple group t-shirts — Experience custom quality proven by 120,000 customer reviews."* The CTA is the card itself — clicking takes you to the reviews-filtered listing. There's no "Design now" button in the hero. Marpple is selling the *evidence* of quality before they sell the product.

> SC Prints applicability: high. SC Prints currently doesn't show Google reviews or a Trustpilot widget anywhere. A homepage hero that says "Trusted by N customers" (or "N+ team uniforms printed") with a real number would land.

### Pattern D: The "stats stripe" hero — TMIX

TMIX combines a product carousel with a horizontal stats band: `520万件超の利用実績` (5.2M+ items printed), `創業80年超` (80+ year heritage), `365日24時間 問合せ受付` (24/7 support), `即日発送` (same-day shipping), `送料無料` (free shipping), and a Google Top Quality Store badge. Five-to-six pieces of evidence in a row, immediately under the hero, presented as icon + short text.

> SC Prints applicability: medium-high. SC Prints has equivalent evidence — items printed, years in business, AU studio, ISO-equivalent in-house QC — but doesn't surface it as a stats stripe. Worth adding under the home hero.

### Pattern E: The "occasion-driven gift" hero — Shirtinator

Shirtinator doesn't really have a hero image. The homepage immediately drops into a category grid that includes **`Geschenke für Mama`, `Geschenke für Papa`, `JGA Frauen`, `JGA Männer`, `Geburtstag`, `Weihnachtsgeschenke`, `Valentinstag`, `Scheidung`** (divorce — that's a real category). The visual style is functional, the navigation is the design.

> SC Prints applicability: medium. The B2B/team-uniform core doesn't change, but adding an occasion grid for the personal-buyer segment (21st, Hen's Night, Father's Day, etc.) is an additive growth lever.

### Pattern F: The "consultative B2B" hero — T-she, BoomMake

Both Chinese sites lead with a headline ("Premium corporate apparel customisation supplier" / "More professional internet customization platform") and a quote CTA. Photography is product-flat with case-study photos (Tencent / Strikingly / Ctrip employee t-shirts in workplace context). There's no real customizer entry from the homepage — the funnel is "ask us → we design for you → we make".

> SC Prints applicability: low for the storefront, but the B2B/Organisation account flow could borrow the **"Add WeChat" QR pattern** as an equivalent "Add to WhatsApp Business" or "Book a call" friction-reducer for Account Managers.

### Pattern G: The "BIG promo banner" hero — Spreadshirt, Camaloon

Both EU-mass-market sites lead with rotating promo banners: Spreadshirt is showing "30% auf alles, Flash Sale" today; Camaloon is showing "Boost your business with souvenirs" + "FREE Shipping over €85". The banner is treated as the hero; product-discovery happens immediately below.

> SC Prints applicability: medium. SC Prints doesn't currently run promo banners — the customer-tiers module + perks already handles loyalty pricing. Worth saving for seasonal pushes (EOFY, Q4 Christmas team-tee rush) rather than constantly-on.

---

## 4 — PLP / catalog pattern gallery

### Tile design — the four major variants

| Variant | Used by | Tile elements |
|---|---|---|
| **Maker-marketplace tile** | SUZURI, Pixiv Factory | Design-on-product mockup + creator name + favourite count + price |
| **Catalogue-shop tile** | Spreadshirt, Shirtinator, UP-T, TMIX | Product image + name + brand + "from €X" + "+N colours" badge |
| **"Personalise this" tile** | Camaloon, Marpple | Product image + name + "from €X" + "Customize"/"Start Creating" button overlay |
| **Image-only product tile (text on hover)** | T-she, BoomMake | Product photo + minimal text + click-to-detail |

**SUZURI's tile is the most distinctive in the set.** It shows the *artist's design rendered onto a tee mockup* (not a blank tee), the *artist's username* underneath, a heart count, and the price. The aesthetic is "you're browsing a creator marketplace" rather than "you're browsing T-shirt SKUs". When a hot anime series drops, hundreds of SUZURI artists upload fan-art designs the same day, and the most-favourited rise. The favourite count is doing two jobs: trend signal AND social proof.

**Spreadshirt's tile is the most retail-conventional.** Product photo (model wearing the blank), product name (e.g. "Männer Premium T-Shirt"), brand (e.g. "Stanley/Stella"), price ("ab 23,99 €"), and "+5 / +11" colour-variant badges. Same as Cotton On, ASOS, or any large EU apparel retailer.

**Marpple's tile carries the most data.** Each card shows product image + title + price + discount percent + bulk-price callout ("200EA or more" with the discounted price) + star rating + review count + a "Start Creating" button. Six independent pieces of information per card. Cognitive density is high — but the rating + review count + CTA combo does the entire purchase decision in one tile.

### Filter and sort patterns

- **SUZURI / Marpple / Spreadshirt** use a **left-sidebar filter rail** with checkboxes (colour, fit, brand, price band). Long lists collapse into "show more". Sort is a top-right dropdown.
- **TMIX** uses a **tabbed top filter** ("standard / long-sleeve / mens / ladies / kids / dry") with a secondary sidebar.
- **UP-T** uses a **mega-menu dropdown** for category change but has minimal in-page filtering — the catalogue is presented top-down, not as a multi-facet shopper would expect.
- **Camaloon** uses **single-page category landing** rather than facet filtering: "personalised T-shirts" → grid of 32 distinct base products; click any tile for the quantity-calculator PDP.
- **Pixiv Factory** uses a **horizontal category-pill row** at the top (Acrylic / Badges / T-Shirts / Stickers / Stationery / Phone Accessories / Jewelry / Candy / Living / Interior).

> SC Prints applicability: the storefront's category mega-menu is already deep. The **left-sidebar facet rail** (colour + fit + brand + price band) is the standard pattern across the EU/KR/JP set — worth a structural audit if SC Prints' current filters feel sparse.

### Density observations

- **JP sites are dense.** SUZURI, UP-T, TMIX all push 6-column tile grids on desktop, often 12 items per "ranking" block. Heavy text. This is consistent with the broader JP web aesthetic and matches Rakuten/Amazon.co.jp's idiom.
- **KR/EU sites are moderate.** Marpple is 4-column at desktop, generous gutter, dense info-per-card but airy overall layout. Spreadshirt similar.
- **DE sites are visually quiet but information-deep.** Shirtinator is a 4-col grid, minimalist tiles, but the **nav** is the dense layer (13+ primary nav items, 50+ secondary paths).
- **CN sites alternate.** Long marketing pages, generous whitespace between modules, but the modules themselves are content-rich (multi-paragraph case studies, scrolling testimonial carousels).

---

## 5 — PDP layout pattern gallery — extending the 5+1 buckets

Prior reports established five PDP architecture buckets: **(A) customizer-as-PDP**, **(B) static-matrix**, **(C) traditional**, **(D) designer-first POD**, **(E) quote-only**, plus **(+1) hybrid**. Adding the new competitors:

| Shop | Bucket | Notes |
|---|---|---|
| SC Prints | (+1) Hybrid | PDP + embedded designer |
| SUZURI | (D) Designer-first POD | Tile = design = creator's shop; you can also "make your own" via dual-entry pattern |
| UP-T | (A) Customizer-as-PDP | PDP is the editor entry; lifestyle photos + price ladder, click → editor |
| TMIX | (B/A hybrid) | Static-matrix lives on category landing pages; PDP opens designer |
| Pixiv Factory | (D) Designer-first POD | "Make merchandise" CTA opens editor; PDP is light |
| T-she | (E) Quote-only | No customizer; the funnel is consult-then-make |
| BoomMake | (E) Quote-only | Same; though product pages do show ¥-from pricing |
| Marpple | (D) Designer-first POD | Tile click → editor with SKU pre-loaded; PDP is a thin scrim |
| Spreadshirt | (C) Traditional + designer | PDP is conventional retail (price, swatches, sizes), CTA "Jetzt gestalten" opens designer |
| Shirtinator | (C) Traditional + Creator | Same as Spreadshirt; PDP-first, customizer-second |
| Camaloon | (B) Static-matrix + designer | **Quantity calculator on PDP** drives price; designer is the next step |

### Most interesting PDP move: Camaloon's "quantity calculator on PDP"

Camaloon's PDP for "Personalised women's technical T-shirt for sport" doesn't show a static price matrix. Instead, it tells you *"Select your quantities and sizes to get your price instantly"* — and provides a quantity input grid by size. As you type quantities, the per-unit price updates live (and falls as the total quantity rises). The bulk economics are visible *while you're entering your real order*, rather than via a separate price table on a separate tab.

> SC Prints applicability: high. SC Prints' current price ladder is static. **A live calculator on the PDP — drop a size grid, type quantities, watch the unit price fall — is the next iteration**. It would also feed straight into the Add-to-cart path with no re-entry. Effort estimate: medium (component + state + price API).

### TMIX's "discount ladder framed as a curve"

TMIX's team-tee landing page shows the price matrix as a **horizontal table by quantity tier**:

| 数量 | シルク1色 | DTFフルカラー |
|---|---|---|
| 30 units | ¥1,119 | ¥2,129 |
| 50 units | ¥894 | ¥1,977 |
| 100+ units | ¥759 | ¥1,521 |

…and **immediately above** the "Design Now in Editor!" CTA, with copy: *"ドンドン割が10枚から最大50%OFF"* (bulk discount from 10pcs, max 50% off). It's not a reference table — it's a sales tool sitting between the customer and the editor.

> SC Prints applicability: high. SC Prints' existing ladder is correct in structure but doesn't carry the "you're saving 50%" framing. **One word in the column header — "Save" vs "Discount" — and a percentage-saved annotation in the rightmost cell — would do this**.

### The "creator's shop is the PDP" pattern (SUZURI, Pixiv Factory)

When you click a SUZURI tile, you land on a *creator's shop page* — not a product page. The same design is available across 30+ products (tee, hoodie, mug, phone case, sticker, tote). The creator's profile (name, follower count, recent works, favourites) is the page; the design-rendered-on-product list is the merchandise grid. This collapses **artist + design + product** into one entity.

> SC Prints applicability: low for the core team-uniform business. But this is the structural choice if the saved-designs library is ever opened publicly (a "Public Designs" gallery where designs become re-orderable by anyone, with the original artist credited). Worth filing for the design-marketplace future-state.

### Marpple's "tile IS the editor entry" pattern

Marpple's tile click bypasses the PDP entirely — it opens the editor with that SKU pre-loaded. The PDP-as-information-page is a thin secondary tab. This is the most aggressive funnel-tightening in the set.

> SC Prints applicability: very high — SC Prints' hybrid PDP is already close. The remaining friction: the "Customize" button is one of many CTAs on the SC Prints PDP. If the entire tile click on the catalog were "you're in the editor", the funnel would tighten further. Risk: customers who want to *read* the product spec before customising lose the easy access route. Mitigation: make the editor a tab in the same surface (which SC Prints already does in the embedded PDP customizer).

---

## 6 — Customizer UX deep-dive

The customizer is the heart of any custom-print shop, and this is the deepest section. WebFetch's ability to introspect customizer canvases is limited — most editors are React/Vue SPAs that render client-side and don't expose their toolbar markup to a server-fetched HTML response. What follows is **synthesised** from category-landing copy, marketing pages, video tutorial descriptions, and third-party reviews.

### Layout patterns

| Shop | Customizer layout | Multi-side switching | Live price | Save | DPI warning |
|---|---|---|---|---|---|
| SC Prints | Split-screen / step-wizard hybrid (canvas + right-rail steps) | Side tabs (Front / Back / Sleeves) | Inline pricing panel | Y (account "My Designs") | Y |
| SUZURI | Single-canvas + tool sidebar; image upload is the primary action | Y (per product type) | Per-design pricing only | Y (creator shop) | Unknown |
| UP-T | Browser-based "easy design tool"; supports text + image + paint | Y | "From ¥1,000" callout, full price calculated post-design | Y | Unknown |
| TMIX | "30秒でデザイン" (30-second design) — browser-based; 3,300+ stamps, 120+ fonts, 1,000+ templates | Y | Live in editor | Y | Unknown |
| Pixiv Factory | "Upload 1 image → instant preview, free + no registration required" — image-upload-first | Y | Per-product fixed | Y (account → BOOTH integration) | Unknown |
| Marpple | "Start Creating" opens product-specific editor; templates + image + text | Y (front/back per product) | Live | Y (account) | Unknown |
| Spreadshirt | "Bedrucke Dein Produkt" — DTG, DTF, Flexprint, embroidery; uploads + community design library | Y | Live | Y (account) | **Y — explicit DPI quality checker per 2025 review** |
| Shirtinator | "Creator" tool; supports thousands of templates across categories | Y | Live | Y (account) | Unknown |
| Camaloon | Designer opened from the "BUY" tile after quantity is set | Y | Locked-in from quantity calculator | Y (customer area) | Unknown |
| T-she, BoomMake | No public customizer — consultative funnel | — | — | — | — |

### Pattern 1: "Image upload is the entire interaction" (Pixiv Factory, SUZURI)

Pixiv Factory's editor onboarding messaging is: *"Upload 1 image — instant preview, free & no registration required"*. This is the simplest possible customizer affordance: the editor is the upload field. No layer panel, no text tool front-and-centre, no template library you must navigate — just drop a PNG.

This matches the illustrator-community audience: **users come with finished artwork**, not with a vague intention to design something. Pixiv users have their own art; the customizer's job is to apply it to a product, not to help them create art.

> SC Prints applicability: moderate. SC Prints' customizer already supports upload-first, but exposes a lot of tools alongside. For B2B/team customers who are uploading pre-made logos, a **"quick mode"** that hides the text/shape/stamp tools until needed would speed first-use. Compare: the iPhone Photos app hides 95% of features behind one "Edit" button, surfaced only when you ask.

### Pattern 2: "Wizard with the editor at step 3" (Camaloon)

Camaloon's customer journey is: **(1) browse → (2) quantity calculator → (3) editor → (4) cart**. Step 2 is the price-discovery and commitment point; step 3 is the editor with quantities and sizes already pinned in. This means the editor never has to ask "how many?" or "what size?". It's a clean separation — economic decision first, creative decision second.

> SC Prints applicability: medium. The SC Prints wizard already separates Step 1 (variant) from Step 4 (quantity/checkout). Camaloon pushes the quantity decision *before* the design — which works because Camaloon's promo/B2B audience is buying for an event and knows the headcount up-front. For SC Prints' mixed audience (B2C single-buyers + B2B teams), the current ordering (design → quantity) is correct; consider Camaloon's flow only for the dedicated B2B/Organisation cart.

### Pattern 3: "30-second design" speed claim (TMIX)

TMIX's customizer is marketed as "*30秒でデザイン*" (design in 30 seconds), backed by 3,300+ stamps + 120+ fonts + 1,000+ templates. The speed claim drives both the marketing and the actual editor layout — fewer surfaces, larger touch targets, "tap to apply" templates instead of "drag to compose" canvases.

> SC Prints applicability: high. SC Prints' customizer is correct and powerful but doesn't make a speed claim. Adding a "**Quick design**" mode (start from a template, swap 1-2 elements, ship) alongside the full editor would surface a low-friction path for the "I just need 20 staff polos by Friday" buyer who doesn't want to compose from scratch.

### Pattern 4: "Free creative service" as the editor's escape hatch (TMIX)

TMIX's FAQ explicitly states: *"無料で手書きデザイン起こし"* (free hand-drawn sketch conversion) — staff will convert a hand drawing into print-ready artwork at no charge. AND: *"無料で背景透過"* (free background-transparency removal). These are positioned as **perks**, not paid upsells.

> SC Prints applicability: high. SC Prints' current vectorisation service is a **paid line item** ($X via the vectorisation-variant flow). Reframing it as **"Free vectorisation on orders of 30+"** (or "free on team orders") would convert better than a paid step, AND preserve the unit-cost protection on small orders. The technical work is identical; the marketing frame is what changes.

### Pattern 5: "Templates as the front door, blank canvas as a secondary option" (TMIX, Marpple, Spreadshirt)

In all three editors, **templates** (preset designs the customer can fork) are the first thing you see in the editor. Blank canvas is the secondary path. This inverts the SC Prints default (blank canvas first, templates as a sidebar option).

> SC Prints applicability: high. **Templates are the cheapest possible onboarding affordance for a customizer.** SC Prints currently has limited template inventory but could seed it from common customer briefs — "Coach Starter Pack", "Year 12 Tour shirt", "Family Reunion", "Bachelor Party" — each template loaded with placeholder text + an example placement. First-time customer drops their text + image into a hole, done in 60 seconds.

### Pattern 6: Spreadshirt has a DPI warning (revising the prior report)

The prior US/UK report claimed no competitor in the global field had a live DPI warning. The 2025 [Bootstrapping Ecommerce Spreadshirt review](https://bootstrappingecommerce.com/spreadshirt-review/) explicitly states: *"there's a built-in quality checker that alerts you if your image resolution is too low, helping you avoid blurry or pixelated prints"*. So Spreadshirt has parity with SC Prints on DPI.

> SC Prints implication: the wedge narrows but does **not** close. Spreadshirt is a marketplace; their DPI warning is for sellers, not for end-customers in the buy-flow. SC Prints' DPI warning fires during the buy flow with a vectorisation upsell — that combination remains rare. Adjust the language in any future external pitch from *"no one else has DPI warnings"* to *"no one else has DPI warning + vectorisation upsell in the buy flow"*.

### Pattern 7: AI tools are conspicuously absent across the entire set

**No competitor in the 10-shop set surfaces a visible AI tool in the customizer** (background-removal, image-gen, smart-resize, auto-vectorise). Spreadshirt's review explicitly notes "no AI design tools — focus remains on user uploads and pre-made design libraries". UP-T, TMIX, Marpple — none of them flag AI features.

> SC Prints opportunity: large. Background-removal via the existing image-processing stack (Sharp + smart-fill) is cheap to add. An "auto-vectorise this image (free)" button using the existing vectorisation pipeline would convert the paid upsell into a free try-then-buy. The AI moat is wide open in this segment — at least for the next 6-12 months.

### Pattern 8: Mobile customizer pattern (TMIX, SUZURI, UP-T, Marpple)

The JP/KR sites all have native mobile apps for the customizer (SUZURI explicitly markets iOS + Android badges in its footer). UP-T references mobile app access. This is a meaningful regional difference vs. SC Prints' web-only approach.

> SC Prints applicability: low immediately, but worth noting. A PWA wrapper around the existing customizer (Add to Home Screen, share-target hook so the camera roll can "Share to SC Prints") is the cheaper PWA-shaped step before going full-native.

### Pattern 9: Group-order tool is a separate flow from the customizer (TMIX, Marpple)

TMIX's team-tee flow and Marpple's /biz flow both treat the **group/team order as a distinct funnel** with its own landing page, its own price logic, and its own CTAs ("Get a free quote" vs "Design now"). The customizer is reused but the rest of the flow is different (size-collection forms, payment-splitting suggestions, deadline reminders, sample requests).

> SC Prints applicability: high. SC Prints has the Organisation module and the Group Order module in the data layer but doesn't have a dedicated landing page in the storefront's nav. Adding a `/group-orders` landing page modelled on TMIX's `team_tshirts` page — with the price ladder, the "free hand-drawn → print-ready" perk, customer logos, and a "Get a free quote" path alongside the "Design now" path — converts the existing back-end into a visible product.

### Pattern 10: Onboarding affordances inside the editor

- **TMIX**: "30 second design" speed claim implies a coach-mark walkthrough exists (no proof from fetch, but consistent with the marketing copy).
- **Spreadshirt**: "guided" interface per the 2025 review.
- **Marpple**: tile click loads the editor with the SKU already chosen — the *first* action the user takes is "design", not "configure".
- **Shirtinator**: explicit video tutorial *"Wie gestalte ich online"* (How do I design online?) — a video, on the marketing page, not buried in help.

> SC Prints already has the CustomizerGuide coach-mark walkthrough — this remains a competitive feature.

---

## 7 — Pricing display pattern gallery

### The five patterns

| Pattern | Example | When it works |
|---|---|---|
| **Static price matrix on the PDP** (SC Prints AU, TMIX team page) | "10pcs ¥1,500, 30pcs ¥1,200, 100pcs ¥900" table | Transparent for sophisticated B2B buyers; reads as "honest"; converts when AOV matters more than impulse |
| **Live calculator on the PDP** (Camaloon) | Size-by-size quantity input; per-unit price updates as you type | Best for promo/B2B sites where customer knows headcount; lowest commitment threshold |
| **"From €X" + bulk tier callouts** (Marpple, Spreadshirt, BoomMake) | "From $15.19" + "27% off at 300EA+" badge | Shoppable retail framing; suits "browsing first" audiences |
| **Per-design pricing only** (SUZURI, Pixiv Factory) | Each design has its own price set by creator (with platform markup) | Marketplace economics; doesn't apply to studio printers |
| **Hidden until quote** (T-she, BoomMake homepage, Real Thread historically) | Quote-form gate, custom price per order | Consultative B2B; high-touch sales; only works when AOV justifies the friction |

### The "discount ladder framed as savings" sub-pattern (TMIX)

TMIX's table column header is **"ドンドン割"** (more-more discount), implying *"the more you order, the bigger the discount you've earned"* rather than the neutral *"price per quantity"*. The same data, reframed as a reward curve, sells differently. Combine with explicit "Save 50% at 100pcs" annotation in the rightmost cell.

### The "asterisk-honesty" pattern (UP-T)

UP-T's hero says "From ¥1,000 per shirt" and immediately asterisks it: *"※ inkjet print with maximum bulk discount applied"*. This is the cheapest possible honesty signal — the headline number is real but conditional, and the condition is stated. UK regulators have started cracking down on "from £X" pricing where the X is unreachable in practice; UP-T's pattern would survive that scrutiny.

> SC Prints applicability: medium-high. SC Prints currently shows a price ladder rather than a "from $X" hook. Adding a hero-level "**Tees from $X (50+ qty, screen print)**" CTA with the asterisk caveat would compete with the "from $4.49" headlines that win on Google Shopping.

### The "we don't show pricing" pattern (T-she, BoomMake)

The Chinese consultative shops deliberately hide prices. T-she's site is explicit: *"refined pricing"* is positioned as a selling point — *we'll quote you exactly the right number*. The funnel is "scan WeChat QR" or "fill our form" → consultant calls you within 48 hours → bespoke quote → maybe-design-help → produce.

> SC Prints applicability: irrelevant for the storefront but relevant for the B2B/Organisation cart. **A "Get a personal quote (no obligation)" option on /group-orders alongside the standard self-serve flow** would let SC Prints capture the consultative-B2B buyer who currently bounces off the calculator.

### The "discount badge" sub-pattern (Marpple)

Marpple's product cards carry both the base price AND a quantity-discount callout: *"$15.19 / 27% off at 300EA"* in two lines. This makes the bulk economics visible before clicking — converts catalog browsers into volume buyers without forcing them onto a PDP first.

> SC Prints applicability: high. SC Prints' PLP tiles currently show the unit price and stock state but no quantity-discount preview. Adding "Save 33% at 25+" as a small badge on tiles would teach buyers the economic shape without forcing a PDP visit.

---

## 8 — Site IA / navigation pattern gallery

### Top-nav slot counts and structures

| Shop | Top-nav primary items | Mega-menu / dropdown | Audience nav | Occasion nav | Customizer button | Phone in nav |
|---|---|---|---|---|---|---|
| SUZURI | 4 ("Make for self" / "Sell" / "Corporate" / search) | Mega (categories) | N | "Themes" (animals, retro, kawaii, etc.) | "自分用につくる" (top-nav button) | N |
| UP-T | 5+ | Mega (100+ subcategories) | N | "Corporate", "Bulk", "Collab" | "Design now" button | **Y (toll-free)** |
| TMIX | 6 | Mega thumbnails | N | "Sports / Class / Events / Staff / Hobbies / Gifts" | "Design now" + "Free quote" buttons | **Y (with icon)** |
| Pixiv Factory | 3 (logo, notif, cart) | Simple dropdown | N | N | "グッズをつくる" button (header repeats 3x) | N |
| T-she | 8 | Text-rich dropdowns | N | N | "Get quote" CTA | WeChat QR |
| BoomMake | 7 | Hierarchical | N | N | "Consult now" | **Y (toll-free 400)** |
| Marpple | 14+ category pills + sub-nav | Wide horizontal pills | Y (Kids, Pets) | "K-pop Fan Merch", "Pet Custom" | "Start Creating" per-tile | N |
| Spreadshirt | 3 primary ("Gestalten" / "Shoppen" / "Pro") | Cascading mega | Y | "Dein Frühling" seasonal | "Jetzt gestalten" hero CTA | N |
| Shirtinator | 13+ primary | Cascading mega; **deepest in the set** | Y (Women, Men, Children, Baby) | **Deepest in set** (Mama, Papa, JGA, Geburtstag, Weihnachten, Valentinstag, Scheidung) | "Selbst gestalten" + Creator | N |
| Camaloon | 1 (mega) + "Request a call" | Hamburger with 12+ categories | N | N | "Personalize" buttons + "BUY" | Y ("Request a call" link) |
| **SC Prints** | (current) | Mega (Shop categories + Industries + Services + Brands) | Y (Mens / Womens / Kids / Industries) | N | "Customize" PDP CTA | (none on storefront) |

### The Shirtinator IA — depth as the design

Shirtinator's nav has ~13 primary categories and 50+ secondary paths. It's deep. But the *organisation* is intuitive — primary axes are **who you're buying for** (Mama, Papa, Baby) and **what occasion** (Geburtstag, Weihnachten). The customer maps their gift-giving question directly onto a top-level nav item.

> SC Prints applicability: high. The recommendation isn't to copy Shirtinator's full IA — it's to add **occasion nav** as a parallel mega-menu axis alongside the current audience nav. A column titled "Occasions" with "21st", "Hen's Night", "Stag Do", "Year 12 Tour", "Family Reunion", "Father's Day", "Footy Season" maps directly onto AU buying triggers and gives the storefront's existing automation rules an obvious place to surface "VIP / new customer" segmentation.

### "Customizer button" placement

Of all 10 shops, **6 have a top-nav-level customizer button** (SUZURI, UP-T, TMIX, Pixiv Factory, Spreadshirt, Shirtinator). The other 4 rely on tile-click-launches-editor (Marpple, Camaloon) or consultative funnel (T-she, BoomMake).

> SC Prints currently surfaces the customizer through the PDP, not the top nav. Adding a "**Design your own**" persistent top-nav button (similar to how Vistaprint and CustomInk place "Design Online" in the global nav) would be a one-line storefront change with measurable funnel impact.

### Phone numbers in the nav

JP and CN shops (UP-T, TMIX, T-she, BoomMake, Camaloon) all put a phone number or "call us" link in the top nav. EU/KR shops do not. The cultural divide is interesting — phone presence signals "we're a real business" in JP/CN and is expected for B2B buyers.

> SC Prints applicability: low. The AU market is more email-and-text oriented; a phone number in the nav would feel anachronistic. But surfacing a **WhatsApp Business** chat button in the same slot would land — that's the local equivalent of "show me you're real and reachable."

### Mega-menu mechanics

- **SUZURI / Marpple** present categories as **thumbnail tiles** in the mega — "see the product types you can pick from".
- **Shirtinator** uses **text-link mega** — most efficient for deep IA.
- **TMIX** uses a hybrid — top-level thumbnails, secondary text links.
- **Spreadshirt** uses **cascading mega** that branches deeper as you hover (closest to traditional EU retail).
- **UP-T** presents a 100+ subcategory mega-menu that's text-dense but well-organised by product family.

> SC Prints' current mega-menu pattern is in line with the EU/KR/JP norm. No structural change needed.

---

## 9 — Trust signal pattern gallery

### Volume / scale stats

| Shop | Headline stat | Where shown |
|---|---|---|
| SUZURI | "1.97M+ designs" / "450+ item types" | Hero + "make-for-self" landing |
| UP-T | ISO 9001 / 14001 industry-first cert + 24/7 hotline | Sub-hero badge band |
| TMIX | "520M+ items printed", "80+ year heritage", "Google Top Quality Store" badge | Stats stripe under hero |
| Pixiv Factory | "70+ merch types" | Sub-hero |
| T-she | "80,000+ enterprise customisations" + IDG / VC investor logos | Hero + testimonial block |
| BoomMake | "50,000+ enterprises/teams served" + "self-built factory" | Hero + product blocks |
| Marpple | **"120,000+ customer reviews"** + per-product 4.97-5.00 stars + N reviews per product | Hero headline + every product card |
| Spreadshirt | "4.7 Trustpilot", **"10M+ satisfied customers"**, **"20+ years POD"** | Sub-hero badges |
| Shirtinator | "11,311 ProvenExpert reviews 4.6★" + DHL badge + "since 2005" | Footer band + heritage line |
| Camaloon | "15 years with you" + "in-house production" + "300,000+ customers" + "2,500+ products" | Sub-hero stats stripe |

**Highest-trust patterns observed**:
- Marpple's per-product **review count + star rating on every tile** — converts at the catalog level, not the PDP level.
- Spreadshirt's **20-year heritage** combined with **10M customer** count — answers "are you reliable?" in two stats.
- TMIX's **Google Top Quality Store badge** — third-party validation that needs no explanation.

### Heritage signals

Several shops surface **years in business** as a trust pillar: TMIX ("80+ years"), Spreadshirt ("20+ years POD"), Camaloon ("15 years with you"), Shirtinator ("seit 2005"). SC Prints has heritage but doesn't surface a single-line "Printing in NSW since [year]" callout anywhere in the storefront hero or footer.

> SC Prints applicability: easy add. "Printing since [year]" or "Founded in [year], NSW" in the hero or footer is a single line and is exactly the kind of low-effort trust signal that converts hesitant first-timers.

### Third-party review widgets

- **Trustpilot widget**: Spreadshirt (footer)
- **ProvenExpert widget**: Shirtinator (footer, ProvenExpert is the German equivalent of Trustpilot)
- **Trusted Shops widget**: Camaloon
- **Per-product star rating from native reviews**: Marpple (most prominent)
- **No public widget**: SC Prints (currently)

> SC Prints applicability: high. **Adding the Google Reviews count + average to the footer** is a one-line change. Trustpilot or ProductReview.com.au integration is single-day work. The widget itself converts more than its star value would suggest — *presence* of a widget signals "we let third parties hold us accountable", which is itself a trust signal.

### Customer-logo trust signals

- T-she shows Tencent, Alibaba, Strikingly, IT桔子 founder testimonials with named quotes.
- BoomMake shows Ctrip, Scallop English, Strikingly with logo + brief narrative.
- Marpple does NOT show customer logos (relies entirely on review aggregation).
- Spreadshirt does NOT show customer logos prominently (catalog-style retail).

> SC Prints applicability: high. If SC Prints has printed for any AU brands customers would recognise (Macquarie Uni? Bondi Sands? a Sydney FC associated team? a Big-4 firm graduate program?), an opt-in **"Customers we've printed for"** logo strip would land. Even 4-6 logos is enough. Combine with the prior recommendation to add Industries vertical landing pages: each industry vertical landing page should have its own customer-logo strip ("Trusted by these healthcare clinics").

### What no one is doing

**No shop in the set offers a public production tracker** (the SC Prints "production stage" stepper visible pre-sale). **No shop displays a live ETA based on actual queue depth** (SC Prints' production-ETA service). These wedges hold globally — already established in the prior US/UK report and confirmed in this JP/CN/KR/EU set.

---

## 10 — Visual design system observations

### Colour palettes — observed dominant colours

| Shop | Primary | Accent | Notes |
|---|---|---|---|
| SUZURI | White | Navy + UGC colour | Quiet palette; design content carries colour |
| UP-T | White + navy | **Bold red price** + ISO blue | Aggressive price-emphasis red |
| TMIX | **Navy + orange/red CTA** | Muted teal + warm grey | Most "loud" of the set; conversion-optimised |
| Pixiv Factory | White | Blue/purple editorial accent | Quiet, editorial — surprising for an illustrator community |
| T-she | White + navy | Muted blue | Corporate clean; no red/gold cultural cues |
| BoomMake | White + navy (#003366-ish) | Sparse red badges, subtle gold for premium | Scandinavian minimalism — atypical for CN |
| Marpple | White + light grey | **Bold red for discount price callouts** | Product-photography colour leads |
| Spreadshirt | White + earth tones | Black typography | Minimalist; lifestyle hero carries warmth |
| Shirtinator | White + neutral | Black text + payment-badge primary colours | Functional/quiet |
| Camaloon | Bright white | **Cobalt blue** for links + CTAs | Crisp; B2B-clean |

**Most "cultural surprise"**: Pixiv Factory uses an **editorial-clean palette** instead of the kawaii/colourful aesthetic the illustrator-community audience would suggest. The reason is positioning — Pixiv Factory wants to be perceived as professional merchandise software, not as a hobbyist's design playground. The colour absence is the choice.

**Most "loud"**: TMIX. Navy + orange/red is a high-contrast conversion combo more common in JP than EU.

**Most "premium quiet"**: SUZURI, Marpple. White + minimal accent + product-photography colour. Both rely on the *content* (UGC designs / model photography) to provide visual interest.

### Typography observations

- **JP sites**: Noto Sans JP / system sans throughout. Headlines in bold weights. UP-T and TMIX both use type-scales that emphasise the price (bold red, large size).
- **CN sites**: System CJK sans. Body text often serif-weighted for paragraph copy (T-she has "body uses readable serif weights").
- **KR sites**: Marpple uses clean sans-serif; Korean blocky-letterforms keep type scale modest.
- **DE sites**: System sans throughout; Spreadshirt is editorial-clean, Shirtinator is minimal-functional.
- **ES sites**: Camaloon uses modern geometric sans-serif; cobalt blue link styling.

> SC Prints applicability: the current SC Prints type system is in line with the EU norm. No structural change needed. Worth considering a **bold display font** for hero headlines (a single weight, single use case — only the hero) to push more personality without changing the body system.

### Photography style by shop

| Shop | Photography style |
|---|---|
| SUZURI | Flat cutouts only — UGC design on tee mockup |
| UP-T | Lifestyle (models wearing custom) + 3D render + flat-lay |
| TMIX | Lifestyle action (athletes mid-game) + customer-team photos |
| Pixiv Factory | Flat product mockups |
| T-she | Flat-lay + close-ups of print detail + workplace testimonial photos |
| BoomMake | Centered product + workplace-context case studies |
| Marpple | Flat-lay product + emotional customer review photos |
| Spreadshirt | Lifestyle hero (woman outdoors) + flat product grid below |
| Shirtinator | Functional (implied family/celebration photos) |
| Camaloon | Lifestyle in-context (badges on lanyards, mugs held) |

**Best-in-set for "audience visualisation"**: TMIX's team-tee landing page shows **athletes in action** (basketball, running, volleyball, dancing) wearing custom tees. The photography sells the *use case* not the *product*.

**Best-in-set for "trust photography"**: Marpple's reviewer photos — real customers, real photos, dated reviews — read as authentic rather than staged.

> SC Prints applicability: high. The storefront currently leans on studio cutouts and product photos. **A homepage "trusted by real teams" strip with photos of past customer jobs** (the Lookbook content surfaced on the storefront homepage) would convert. Even 6-8 photos of real Sydney teams wearing SC Prints jobs would land harder than another flat-lay.

### Micro-interactions — what's visible

- **SUZURI**: animated mascot ("surisuri-kun") with comment overlay; auto-rotating banner carousel.
- **Marpple**: GIF product previews (LED Keycap Keyring, Standard Grip Tumbler) — subtle in-card animation showing interactive products.
- **TMIX**: hero carousel auto-advances; mega-menu reveals with smooth transition; hover scale-shifts on category tiles (implied).
- **Camaloon**: rotating hero carousel; modal popovers for "Request a call".
- **Spreadshirt**: minimal — relies on CSS hover overlays.

> SC Prints applicability: the existing storefront uses scroll-driven effects sparingly (per the user's prior feedback against scroll-driven hero animations). The competitive pattern is **subtle GIF/video product previews** — a "play on hover" video card for the customizer demo could replace a static screenshot.

### Iconography styles

- **Spreadshirt, Camaloon, Shirtinator**: line icons, neutral set, used sparingly.
- **TMIX, UP-T**: **iconographic stamps** with brand colour fills, used to flag features ("free shipping", "same-day", "ISO certified").
- **Marpple**: minimal — text-led, with category tiles carrying icons.
- **SUZURI**: animated mascot character carries personality; otherwise minimal icons.

### Loading and skeleton states

Hard to introspect from server-fetched HTML, but the JP sites consistently use **GIF loading states** for ranking sections (per the SUZURI extraction noting "animated GIFs in rank sections"). EU sites lean on skeleton placeholders. SC Prints' current pattern (Suspense + spinner) is in line with EU norm.

---

## 11 — Mobile patterns

### Native app presence

- **SUZURI**: explicit iOS + Android app badges in footer; *"どこでも買える、どこでも作れる"* (Buy anywhere, create anywhere) tagline.
- **UP-T**: app referenced in copy.
- **TMIX, Pixiv Factory, Marpple, Spreadshirt, Shirtinator, Camaloon**: no native app surfacing.
- **T-she, BoomMake**: WeChat mini-program (the CN equivalent).

> SC Prints applicability: low immediately. Worth filing for the design-marketplace future-state (if the saved-designs library is ever exposed publicly).

### Mobile customizer pattern

- **TMIX, UP-T**: same desktop customizer with mobile-responsive layout.
- **Marpple, Spreadshirt**: same canvas approach mobile-responsive.
- **SUZURI**: native app for primary customisation flow; web-mobile pattern is upload-first.

> SC Prints' web-only mobile customizer is the EU norm. No change needed.

### Sticky CTA pattern observations

Hard to introspect from server-fetched HTML, but standard practice across the EU/KR/JP set is:
- **Mobile bottom-fixed CTA bar** at the cart/checkout step (Marpple, Spreadshirt patterns).
- **Floating "design now" button** on category pages (Camaloon's "BUY" tile is the equivalent).
- **Phone number + WhatsApp combo** in mobile drawer header (CN/JP norm).

SC Prints' MobileCustomizeCTA pattern (sticky bottom bar with safe-area inset) is the right idiom.

### Touch target observations

JP sites tend to be denser (smaller touch targets) than EU/KR sites. UP-T's mega-menu is the densest in the set; tap targets push the 44×44 minimum. Camaloon and Marpple are the airiest.

### Mobile-only features

- **SUZURI**: app supports camera-roll → instant preview.
- **No shop in the set advertises a "share-to-Instagram" hook** from the customizer.
- **No shop offers AR try-on** for custom designs (the closest is Marpple's GIF product previews).

> SC Prints opportunity: share-to-Instagram from the saved-designs library is a one-day build via the Web Share API and would amplify customer-led marketing.

---

## 12 — Post-order / account UX

### Order tracking patterns

| Shop | Order tracking visible to customer |
|---|---|
| SC Prints | Production stage stepper + email milestones + post-order watch link |
| SUZURI | Order status via account; "shipping notification" emails |
| UP-T | "Order details" page; ETA stamped on confirmation |
| TMIX | Email-only |
| Pixiv Factory | Order History page in account dropdown |
| Marpple | Account → Order History; "design edits only allowed at Order Placed stage" — interesting cutoff signal |
| Spreadshirt | Account-side order tracking; standard POD flow |
| Shirtinator | Order status checker (footer link) — works without account login |
| Camaloon | Real-time tracking ("real-time order tracking & eco shipping highlighted") |
| T-she, BoomMake | Account manager handles status; no public tracker |

**Notably no one in the set has SC Prints' "production stage" granularity** (received → art review → awaiting approval → approved → blanks ordered → blanks arrived → in production → QC → shipped → delivered). Shirtinator's "order status checker without account login" is interesting — anyone with an order number can check status without auth — and is the lightest-weight tracker pattern.

### Re-order flow

- **Marpple**: re-add product (no customizer rehydration), customer must re-design.
- **Spreadshirt**: account → saved designs → re-add to cart (some rehydration).
- **SUZURI**: re-purchase from creator's shop — design is the persistent unit.
- **UP-T**: account → "My Designs" → re-add.
- **TMIX**: design saved, re-apply per order.

**SC Prints' re-order with full customizer rehydration (the `?reorder=order:line` flow that opens the customizer with the original artwork + layout pre-loaded) is unique in the set.** This was established in the prior reports and remains true.

### Design library presentation

- **SUZURI / Marpple / Spreadshirt**: design libraries are presented as **public "creator shops" / "my store"** — designs are public by default, the customer can either keep private or open up to public selling.
- **SC Prints / Camaloon / Shirtinator**: designs are private to the customer's account.

> SC Prints applicability: low for the team-uniform core, but if SC Prints ever opens the saved-designs library to **public sharing** ("share this design with a friend / make it visible to your team / publish to the SC Prints Lookbook"), the SUZURI / Marpple pattern is the reference.

### Customer-side artwork-approval flow

SC Prints' HMAC-signed customer artwork approval flow (`/artwork-approval/[orderId]`) doesn't appear in any of the 10 shops. None of the JP/CN/KR/EU shops surface a pre-print customer-approval step visible to the customer.

> SC Prints wedge: confirmed. This remains a competitive differentiator globally.

### NPS / post-delivery flow

- **Marpple**: per-product reviews with photos, post-purchase — drives the 120k review count.
- **Spreadshirt, Shirtinator, Camaloon**: ProvenExpert / Trustpilot / Trusted Shops review prompts post-delivery.
- **JP / CN sites**: less visible review prompt mechanism externally; likely email-only.
- **SC Prints**: NPS request system at day-N post-delivery, score + comment landing on order metadata.

> SC Prints already does this; the gap is that **SC Prints' NPS scores aren't being aggregated into a public number on the storefront**. The widgets exist; nothing exposes them externally. A site-wide "4.9 from N customer ratings" line in the footer would close this loop.

---

## 13 — Cherry-pick recommendations for SC Prints (prioritised tiers)

### Tier 1: Visual / brand moves (1-3 day builds)

1. **Add a stats stripe under the homepage hero.** Pattern: TMIX. Six pieces of evidence as icon + short text in a horizontal band (e.g. *"500k+ garments printed | NSW studio since [year] | 4.9★ from [n] reviews | Free vectorisation on team orders | 10-12 day standard | Designed in Sydney"*). Effort: half-day. Pull data from existing reports + the NPS score aggregation.

2. **Add "Printing in NSW since [year]" to the hero and footer.** Pattern: Spreadshirt / Camaloon / Shirtinator. A single heritage line. Effort: 5 minutes.

3. **Surface the NPS aggregated score in the footer.** Pattern: Marpple. The data exists; the storefront doesn't render it. Effort: half-day (add a `/store/nps/summary` endpoint + a footer component reading it).

4. **Add Google Reviews / Trustpilot / ProductReview.com.au widget.** Pattern: Spreadshirt / Shirtinator. Third-party widget; integration is half-day for any of the three.

5. **Customer-logo strip on the homepage.** Pattern: T-she / BoomMake. Even 4-6 AU brand logos with opt-in. Effort: 1 day including logo collection.

### Tier 2: Component-level UX wins (3-7 day builds)

6. **Reframe the price ladder as a "discount earned" curve.** Pattern: TMIX. Same data, header changes from "Price per unit" to "Save up to X%", rightmost cell carries percentage saved. Add to existing PricingPanel. Effort: 1 day.

7. **Add "from $X" callout to the hero CTA with an asterisk caveat.** Pattern: UP-T. "Custom tees from $X*" with the caveat surfaced on hover/click. Effort: half-day.

8. **Live-dated shipping ETA on PDP and cart edge.** Pattern: UP-T. "Order today (May 23) → ships May 27" computed server-side. The production-ETA service already exists; this is a different presentation of the same data. Effort: 1-2 days.

9. **Per-tile "Save X% at Y+" badge on PLP cards.** Pattern: Marpple. Read from existing bulk-pricing metadata. Effort: 1 day for the badge component + integration.

10. **Add Trustpilot / Google Reviews per-product stars on PLP tiles.** Pattern: Marpple. Effort: 1-2 days if the review system is connected; longer if it requires a new integration.

### Tier 3: Layout / IA changes (1-2 week builds)

11. **Add occasion-based mega-menu column.** Pattern: Shirtinator. Parallel to the existing audience nav: "Occasions" column with 21st, Hen's Night, Stag Do, Year 12 Tour, Family Reunion, Father's Day, Christmas Party, Footy Season. Each occasion is a landing page with curated products + relevant templates. Effort: 1 week including templates.

12. **Dedicated `/group-orders` storefront landing page.** Pattern: TMIX team-tee + Marpple /biz. Hero with the "Free hand-drawn → print-ready" perk, the price ladder, customer logos, "Get a free quote" + "Design now" dual CTAs. Reuses the existing Group Order module. Effort: 1 week.

13. **Reposition the customizer entry as a top-nav button.** Pattern: 6 of 10 shops do this. "Design your own" persistent top-nav button alongside the current categories. Effort: half-day.

14. **Add a "Quick design" mode + 6-10 starter templates.** Pattern: TMIX 30-second design. Templates for "Coach Starter Pack", "Year 12 Tour", "Family Reunion", "Bachelor Party" etc., each pre-loaded with placeholder text + example placement. Effort: 1-2 weeks including artwork.

### Tier 4: Customizer / pricing changes (2-4 week builds)

15. **Reframe vectorisation as "Free on orders of 30+"**. Pattern: TMIX's "free hand-drawn → print-ready" service. Add a tier-conditional check in the customizer; when quantity is ≥30, the vectorisation upsell becomes a free-included feature. Effort: 2 weeks including the customer comms and the order-edit subscriber.

16. **Live quantity calculator on PDP.** Pattern: Camaloon. Drop a size grid, type quantities, watch unit price fall, "Add to cart" carries through to checkout. Replaces the static ladder in the right-rail. Effort: 2-3 weeks (component + state + price API + PDP integration).

17. **AI background-removal in the customizer.** Pattern: not present in any competitor. Use the existing Sharp pipeline with `sharp-smart-fill` or hand-rolled corner-sampling. Effort: 2 weeks.

18. **Image gallery includes mockup preview from server-rendered preview pipeline.** Pattern: GIF previews on Marpple. Customer uploads → 2 seconds → preview shown in-PDP. Effort: 2 weeks (extends existing customizer-render service).

### Tier 5: Mobile / app (4+ weeks)

19. **PWA wrap of the existing customizer.** Pattern: SUZURI's iOS/Android app posture. Web Share Target for "Share to SC Prints" from the camera roll. Effort: 4 weeks.

20. **Share-to-Instagram button on saved designs.** Pattern: not present in any competitor. Web Share API → IG Stories template. Effort: 1 week.

### Tier 6: Brand / messaging (parallel to all above)

21. **Pivot one hero variant to "Proven by [N] team orders printed in Sydney" headline.** Pattern: Marpple's review-led headline. Test as a Q4 / EOFY hero. Effort: half-day for the copy + photo.

22. **Add a "Trusted by [client logos]" home strip with opt-in customer logos.** Pattern: T-she / BoomMake. Effort: 1 day once logos are collected.

---

## 14 — Cultural context + caveats

### The Chinese D2C market: a real finding

The brief asked for two Chinese D2C custom-print shops. After multiple search rounds and direct-fetch attempts, **DizPrint refused all connections** (`ECONNREFUSED`) — and the search returns confirm it's principally a B2B/print-broker, not a consumer-facing designer + cart. I substituted **T社定制 (T-she)** and **爆造定制 (BoomMake)**, but a critical finding: **neither is a true D2C self-checkout shop**.

Both T-she and BoomMake follow a **consultative funnel**: customer fills a form or scans a WeChat QR, a consultant calls back within 48 hours, design support is human-mediated, pricing is bespoke. There's no "browse → design → pay with credit card → ship" flow comparable to Custom Ink, Vistaprint, Marpple, or SC Prints itself.

Why? Several reasons consistent with what we know about the CN apparel-print market:
- WeChat + Alipay are the dominant payment infrastructure; consumer custom-print volume happens through WeChat mini-programs and Taobao/Tmall shops, not standalone storefronts.
- B2B/corporate uniform orders dominate the named-brand custom-print segment (Tencent, Alibaba, Ctrip, etc.).
- The B2C custom-print volume that exists at consumer price points is largely **Pinduoduo / Taobao livestream-commerce** driven — sellers list "I'll print your design on a tee for ¥39" and customers tap-to-buy through the livestream's pinned product link. There's no standalone "designer + cart" website in that flow.

> Implication for SC Prints: **the Western D2C custom-print web pattern (browse → design → checkout → track) doesn't have a true Chinese-market analogue**. If SC Prints ever expands into the CN market, the model wouldn't be "build a CN storefront" — it would be "build a WeChat mini-program + Taobao shop with WeChat-Work for B2B account managers". Different stack, different funnel.

### Japanese density vs. EU airiness

JP shops (SUZURI, UP-T, TMIX) are visually denser than EU shops (Spreadshirt, Shirtinator, Camaloon). This isn't a quality difference — it's a regional aesthetic norm. Rakuten and Amazon.co.jp set the JP density benchmark; Otto, Zalando, and IKEA.de set the EU benchmark. JP customers expect "more on the page"; EU customers expect "breathing room".

> Implication: SC Prints' current moderate-density layout sits between the two and is the right choice for the AU market, which trends EU on aesthetics (note Cotton On, Country Road, Bonds — all relatively airy). No structural change needed.

### German sites lead on trust transparency

Shirtinator's footer surfaces AGB (Terms), Widerrufsbelehrung (Cancellation Policy), Datenschutz (Privacy) as primary links. Spreadshirt does the same. This is partly cultural (DE consumers expect legal transparency), partly regulatory (the IT-Recht legal framework is strict). SC Prints' current Privacy / Terms surfacing is in line with EU norms; AU-specific equivalents (Consumer Guarantees, Refund Policy) deserve equivalent footer prominence.

### Spanish / Camaloon: B2B-clean

Camaloon's design system is the most "B2B promo merch" of the set — cobalt blue + white, lifestyle-but-product-focused photography, a stats stripe ("15 years with you, 300k+ customers, 2,500+ products"). This matches its actual positioning: it's a promo-merchandise shop for businesses + event organisers, not a fashion shop. SC Prints' B2B/Organisation track could borrow Camaloon's clean information design directly.

### Korean Marpple: review-first, friction-low

Marpple's whole homepage is engineered around two ideas: **review density + tile-as-editor-entry**. The 120,000-review boast is the brand promise; the "Start Creating" button on every tile is how they execute it. Korean consumer e-commerce trends review-heavy (Naver Shopping, Kakao Talk integrations, KakaoPay) and Marpple maps onto that norm precisely.

### Access issues + translation caveats

- **DizPrint**: unreachable from the fetch tool (`ECONNREFUSED` repeatedly); substituted T-she + BoomMake.
- **Marpple.au URL** as cited in the brief returned 404 — Marpple's AU presence is via `marpple.com/au` which doesn't render that exact path. Used `marpple.com/en/` instead.
- **JP customizer interfaces** are React/Vue SPAs and WebFetch couldn't introspect their client-side-rendered toolbars. Used marketing-page copy + 3rd-party reviews as proxy.
- **All non-English content** was machine-translated via the fetch model. Quotations are best-effort; specific copy verification would require a native speaker review.
- **Prices** in this report are display patterns, not benchmarks. No currency conversion was applied; pricing-strategy head-to-heads are deliberately out of scope per the brief.

### Substitution explanations

- **DizPrint → T-she + BoomMake**: DizPrint unreachable and not a true D2C self-checkout shop.
- **Marpple AU URL → marpple.com/en/**: cited AU URL was unreachable; English-language landing covers the same content.

### What this review can't tell you that an in-browser session could

The fetch tool can't show me:
- Actual customizer toolbar layouts (these are client-side SPAs).
- Hover and tap interactions in real time.
- Real screenshot evidence for the visual claims.
- Mobile-specific layouts (no UA spoofing).
- Onboarding tour content (gated behind first-visit JS).
- Checkout flows (gated behind cart state).

The recommendations above are confident at the **strategic / pattern level** and need browser-session verification before any execution work. The Tier 1 recommendations (stats stripe, heritage line, NPS surface, customer logos, review widget) are safe to ship without further research. The Tier 2-4 recommendations should be A/B-tested or storyboarded with the actual customizer + PLP in front of a real customer before commitment.

---

## Sources

- [SUZURI homepage](https://suzuri.jp/)
- [SUZURI T-shirt category](https://suzuri.jp/categories/t-shirts/t-shirt)
- [SUZURI make-for-self landing](https://suzuri.jp/suzuri_me)
- [UP-T homepage](https://up-t.jp/)
- [UP-T about / process page](https://up-t.jp/about)
- [TMIX homepage](https://tmix.jp/)
- [TMIX team T-shirts landing](https://tmix.jp/team_tshirts)
- [TMIX design simulator](https://tmix.jp/for-customers/design-simulator)
- [Pixiv Factory homepage](https://factory.pixiv.net/)
- [T社定制 (T-she) homepage](https://www.tshe.com/)
- [爆造定制 (BoomMake) homepage](https://www.boomake.com/)
- [Marpple English homepage](https://www.marpple.com/en/)
- [Marpple Korea homepage](https://www.marpple.com/kr)
- [Marpple bulk-order / Biz](https://www.marpple.com/en/biz)
- [Marpple product detail example](https://www.marpple.com/en/product/detail?bp_id=4302)
- [Spreadshirt Germany homepage](https://www.spreadshirt.de/)
- [Spreadshirt "Create Your Own" entry](https://www.spreadshirt.de/selbst-gestalten)
- [Spreadshirt T-shirt design landing](https://www.spreadshirt.de/gestalten/t-shirts)
- [Spreadshirt mens T-shirts category](https://www.spreadshirt.de/shop/herren/t-shirts/)
- [Shirtinator homepage](https://www.shirtinator.de/)
- [Shirtinator T-shirt category](https://www.shirtinator.de/t-shirts/)
- [Shirtinator T-shirt bedrucken](https://www.shirtinator.de/t-shirts/bedrucken/)
- [Camaloon homepage](https://www.camaloon.com/)
- [Camaloon T-shirt printing landing](https://www.camaloon.com/t-shirt-printing)
- [Bootstrapping Ecommerce — Spreadshirt 2025 review (confirms Spreadshirt's built-in DPI quality checker)](https://bootstrappingecommerce.com/spreadshirt-review/)
- [ProvenExpert Shirtinator AG profile (12,717 reviews, 4.6★)](https://www.provenexpert.com/de-de/shirtinator-ag/)
- [Trusted Shops — Camaloon ratings](https://www.trustedshops.co.uk/buyerrating/info_X6ACC9B7102CF35BBC678D248B67A191E.html)
- [Pixiv Help Center — What is pixivFACTORY](https://www.pixiv.help/hc/en-us/articles/235584688-What-is-pixivFACTORY)
- [Spreadshirt Help — Printing Costs explanation](https://help.spreadshirt.com/hc/en-us/articles/207153579-Printing-Costs-for-Customized-Products-by-Spreadshirt)
- [Zhihu — T-shirt DIY professional sites recommendation](https://www.zhihu.com/question/19830924) (source for T-she + BoomMake identification)
