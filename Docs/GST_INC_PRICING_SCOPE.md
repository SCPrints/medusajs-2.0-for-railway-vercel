# Ex-GST → Inc-GST Pricing: Scope & Decision Document

**Date:** 2026-07-31 · **Status:** EXECUTED — HOLD, cutover 2026-08-01 (preference flipped via admin UI; labels + shipping shipped same day) · **Evidence:** full-codebase sweep (3 parallel investigations, file:line refs throughout)

Drivers: (a) ACL s48 component pricing — consumer-facing prices must show the GST-inclusive total; (b) Google Merchant Center requires AU feed prices inc-GST and crawls the PDP to verify. Confirm (a) with the accountant before executing.

---

## 0. Executive summary

**Pricing model, clarified (per Sean, 2026-07-31).** The ladder is `cost × 1.10 × 1.5`: suppliers quote a trade price ex-GST and add GST on the invoice, so the `1.10` converts the quoted cost into the **cash SC Prints actually pays**; the `1.5` is margin on that cash cost. The output is an **ex-GST retail price**, and Medusa correctly adds 10% sales GST at checkout. There is no double-charging. (The code comments previously described this as a "GST-inclusive" sell price — misleading enough that a full review misread it; comments now corrected in `bulk-price-ladder.ts` and `customer-tiers.ts`.)

**The decision is therefore the plain commercial one.** "Hold the displayed number" = the current sticker becomes the inc-GST price → customers pay ~9.09% less, revenue −1/11. "Gross up ×1.1" = sticker rises 10%, customer pays the same as today, revenue unchanged.

*Aside for the accountant conversation:* because SC Prints claims input tax credits, the supplier GST inside the ladder (the ×1.10) comes back on the BAS — so effective margin on ex-GST cost is 65% at the 100+ floor, not the nominal 50% on cash. No action needed; it's relevant headroom when weighing HOLD.

**Recommended implementation either way: flip Medusa to tax-inclusive pricing (region price preference), not a display-layer patch.** The display-layer alternative was scoped and scored out: ~33 storefront render surfaces, 10 components with their own ad-hoc formatters, duplicated label builders, per-line rounding drift against checkout and against the Google feed, and a permanent "remember to ×1.1" tax on every future surface.

**Effort differs enormously by the §1 decision:**
- **HOLD:** near-zero data migration. No amount is rewritten anywhere — the flag flips, the meaning of every stored number changes from ex to inc, and every generator keeps producing the same numbers. Work = region flag + labels + a handful of provider/edge surfaces + verification. Rollback = flip the flag back.
- **GROSS-UP:** full migration. Formula constants change, every generator re-runs, one-off ×1.1 scripts for non-generated stores, in-flight quotes need migration. Rollback needs snapshots.

**Also found: live money bugs that exist regardless of this decision** — see §9. The worst: tax-exempt customers are *charged* GST but *invoiced* as if they weren't, and today's PDP headline price carries no GST label at all (arguably a worse ACL position than the tiles' "ex GST").

---

## 1. The pricing decision (yours, not code's)

| | HOLD displayed number | GROSS UP ×1.1 |
|---|---|---|
| Customer pays | ~9.09% less than today | same as today |
| Sticker | unchanged | +10% |
| Revenue | −1/11 (≈ −9.09%) | unchanged |
| Migration size | minimal (flag + labels) | full (see §8) |
| Rollback | flag flip | snapshot restore |

- **Cost of holding:** last-30-days revenue ÷ 11. Pull from `/app/reports` → Sales overview. Put the dollar figure in this doc before deciding.
- **Scope of the decision includes shipping and decoration**: under HOLD, the $11/$15/$20/$32/$55 shipping ladder and the DTF/embroidery/screen rate cards also become inc-GST (customer pays less on those too). If shipping margin can't absorb that, bump [shipping-rate.ts](../backend/src/lib/shipping-rate.ts) bands independently — they're deliberate code-reviewed numbers.
- **Rounding under gross-up:** new price = old × 1.1 rounded to cent ($15.29 → $16.82; $49.95 → $54.95 — the .95 endings survive ×1.1 fine). If a full price-list review is wanted, the product CSV export already emits every tier column.
- **Held-at-old-number exceptions** (loss leaders, price-matched items): handled per-product by editing that variant's prices after migration; no mechanism needed.
- **Sign-off:** Sean, against the CSV export, before cutover.

---

## 2. Where amounts actually live (§2 of the question list)

### A. Medusa price engine (the "real" prices)
| Store | Notes |
|---|---|
| Variant price-set rows (~62k) | 5 qty bands per variant, major units, AUD. Written by all importers via `tierMinorToPriceSetRows` |
| 8 tier PriceLists (`type: override`) | **Regenerated nightly 06:00 UTC** from `cost_price_ex_gst_minor × multiplier` ([regenerate-tier-price-lists.ts:243](../backend/src/scripts/regenerate-tier-price-lists.ts)). Any amount migration is silently undone within 24h unless the formula moves with it |
| Region/tax config | Tax-exclusive, 10% auto ([setup-au-gst.ts](../backend/src/scripts/setup-au-gst.ts)). **No `price_preference` is set anywhere in the repo** — the inc-GST flag has never been touched |

### B. Parallel/derived stores (NOT covered by a price-row migration)
| Store | Why it matters |
|---|---|
| `variant.metadata.bulk_pricing.tiers[]` | **A parallel price store that the cart actually charges from** — `recompute-scp-cart-pricing` and `scp-resolve-garment-unit-price` read it *in preference to* price rows. Major units. Written by every importer + spreadsheet sync |
| `variant.metadata.cost_price_ex_gst_minor` | Canonical cost input — **never changes** under either option (costs stay ex-GST) |
| `product.metadata.listing_summary.{cheapest_amount, hundred_plus_amount}` | Cached tile prices ([listing-summary.ts:32-34](../backend/src/lib/listing-summary.ts)) |
| Meilisearch `min_price_aud` | Cents, ex-GST, computed from `bulk_pricing.tiers[0]` in [medusa-config.js](../backend/medusa-config.js) — needs reindex after any change. NOTE: its field-priority is *inverted* vs listing-summary's (metadata-first vs calculated-first) despite a comment claiming they mirror |
| `org_inventory.unit_price` (cents) | **Charged directly** on org orders — real prices living outside price tables |

### C. Rate cards in code (edit under GROSS-UP; relabel under HOLD)
- [shipping-rate.ts:27-36](../backend/src/lib/shipping-rate.ts) — $11/$15/$20/$32/$55 + $3/kg, documented ex-GST
- [scp-dtf-print-pricing.ts:47-56](../backend/src/lib/scp-dtf-print-pricing.ts) + storefront mirror — print surcharge matrix
- [embroidery-pricing.ts:25-38](../backend/src/lib/embroidery-pricing.ts) + storefront mirror — stitch matrix + $60 digitizing
- Decoration estimator constants (dtf/screen/uvdtf/uv method files) — the only surfaces already showing an inc-GST breakdown, via `splitGst()`
- Chatbot prompt — numbers auto-follow the constants; **two hardcoded prose lines** say "quote prices ex-GST" ([system-prompt.ts:65,103](../storefront/src/lib/chatbot/system-prompt.ts))
- Sync-check scripts exist for the mirrored rate cards (`check-dtf-pricing-sync`, `check-embroidery-pricing-sync`) — run after edits

### D. In-flight / soft stores
| Store | Behaviour across cutover |
|---|---|
| Open cart lines | Hold `unit_price` at rest; **any touch triggers cart-wide reprice**. Untouched carts charge old basis until edited |
| Quote `line_items` JSON (major units, jsonb) | Accepted lines land with `quote_locked_price: true` — **immune to recompute forever**. Under GROSS-UP, open quotes must be migrated ×1.1 or honoured at a loss. Under HOLD, a pre-flip quote honoured as inc is *generous by exactly the GST* — acceptable, arguably correct |
| POS parked sessions | `unit_price_cents`, 4h TTL — cutover timing makes this moot |
| Open Stripe payment links | Hold their amount until paid — list open links before cutover |
| `abandoned_cart_followups.cart_total` + snapshot | Feeds the reminder email's rendered dollar figure — queued reminders go stale (accept; they're estimates) |
| Group orders / browser saved carts | **Store no amounts — reprice naturally.** Safe |
| Draft orders | None exist as a model; org/fulfillment "drafts" create real orders from org-inventory prices |

### E. Documents in the wild
- Product import/export CSV: `Variant Price AUD` + five `TIER_*_PRICE` columns + `Variant Bulk Pricing JSON`. Importer accepts aliases including literally `"sell price inc gst"` and `"sell price ex gst"` **mapped to the same field with no conversion** ([spreadsheet-sync-import.ts:270-308](../backend/src/admin/lib/spreadsheet-sync-import.ts)). Any staff spreadsheet in circulation is on the old basis.
- Orders export CSV: six total columns (historical actuals — fine).

### F. Answered directly
- **Free-shipping dollar threshold: does not exist.** Free shipping is tag-based only (`FREE_SHIPPING_TAGS`). Question dropped.
- **Sale/customer-group price lists beyond the 8 tier lists:** none created by code. Check admin UI for any staff-created ones (2-minute task).

---

## 3. Storefront (§3)

- **`calculated_amount_with_tax` / `is_calculated_price_tax_inclusive`: zero hits in storefront/src.** The storefront reads only `calculated_price.calculated_amount`. The flag exists in exactly 3 backend fulfillment providers: scp-shipping hardcodes `false`, ShipStation derives it, AusPost hardcodes `true`.
- **Hardcoded GST math:** one deliberate module ([decoration/lib/gst.ts](../storefront/src/modules/decoration/lib/gst.ts), `GST_RATE = 0.1` + `splitGst()`) — everything else is the backend ladder's baked-in ×1.1.
- **Catalog amount resolution is tight:** one resolver ([resolve-display-minor.ts](../storefront/src/lib/util/resolve-display-minor.ts)) → `getProductPrice` → ~9 leaf surfaces. Cart/order totals are separate: 14 leaf components read Medusa totals fields directly. Plus **10 components bypass the shared formatter entirely** (own `Intl.NumberFormat` or `$${x.toFixed(2)}`): org account pages ×4, quote-accept form, bottle customizer, customizer template raws, embroidery price table + estimator, decoration price-summary.
- **Labels to change:** "ex GST" is hand-built in **two duplicated tile-string builders** ([listing-card-price-text.ts:150,212](../storefront/src/lib/util/listing-card-price-text.ts) AND [product-listing-card-data.ts:217-225](../storefront/src/modules/products/lib/product-listing-card-data.ts) — change both or tiles disagree), checkout shipping options ×2, order shipping details. **The PDP headline price has NO GST label at all today** — inconsistent with tiles and the sharpest current ACL exposure. Cart says "GST"; order summary says "Taxes"; mini-cart says "excl. taxes" — three labels for the same thing.
- **Checkout GST line: already exists** ([cart-totals.tsx:87-92](../storefront/src/modules/common/components/cart-totals/index.tsx), labelled "GST" for AUD) with correct ex-tax subtotal/shipping fields.
- **Emails: no template anywhere renders GST or tax_total.** order-placed prints ex-GST per-line prices and an inc-GST grand total **with no label distinguishing them** — the mismatch is already customer-visible.
- **Invoices: the PDF and HTML tax invoices are ATO-compliant** (GST line, ABN, inclusive-total statement, embedded-GST fallback of ÷11 for legacy orders). **The POS email receipt is NOT** — see §9.
- **Caches to purge after cutover:** Meilisearch reindex (`reindex-meilisearch.ts`), storefront cache (`POST /api/revalidate-products`), Vercel redeploy, listing_summary refresh (verify its writer during implementation), Merchant Center re-fetch.

---

## 4. Promotions (§4)

- **No backend code creates or configures promotions** — they are pure admin data. POS passes `promo_codes` through to the workflow, nothing more.
- **Action (manual, ~2 min):** list active promotions in admin. Percentage promos are basis-neutral. Fixed-dollar promos change meaning: today "$20 off" applies to ex amounts (customer saves $22 of what they pay); post-flip it applies to inc amounts (saves exactly $20). Direction is revenue-favourable; review any printed/scheduled material quoting a fixed-dollar code.
- Under Medusa's promotion model, check each fixed-amount promo's tax-inclusive setting in admin after the flip as part of §7 verification.

## 5. In-flight and historical data (§5)

- **Historical orders: frozen.** Totals are stored on the order; invoice/receipt renderers read stored fields with an explicit fallback chain and an embedded-GST (÷11) branch for legacy orders. Nothing recomputes old orders against current settings.
- **Carts:** old-basis until touched, then a single edit reprices the *whole* cart (see §2D). Expect a brief window of mixed carts; the direction of surprise depends on the §1 decision (HOLD: totals drop on edit — pleasant; GROSS-UP: totals jump — support-ticket risk, worth a banner for a week).
- **Quotes:** the one genuinely sharp edge (§2D). Under GROSS-UP, write a one-off migration for open (`new`/`quoted`) quotes' `line_items` JSON, or accept honouring them at ex-GST as quoted.
- **Refunds on pre-switch orders:** computed against captured payment amounts — unaffected.
- **Abandoned-cart emails already queued:** stale totals; accept (labelled "estimated").

## 6. Operational (§6)

- **Staff price entry becomes inc-GST** everywhere (admin price edits, POS overrides, quote line prices, spreadsheet price columns). Written note goes in: CLAUDE.md, the admin Help page (which currently documents the ex-GST × multiplier convention in 7 places), and the import template header row.
- **Wholesale/trade ex-GST display:** not needed for compliance. If wanted later: a secondary "($X ex GST)" line gated on logged-in tier/org membership — the tier + org infrastructure exists ([§ B2B findings](#b2b)). Tax invoices already show the ex-GST subtotal + GST line, which is what B2B actually needs.
- <a name="b2b"></a>**B2B capture status (asked during scoping):** checkout addresses already capture Company (native field, both shipping + billing + address book). Signup captures nothing; `customer.company_name` is written only by the anonymiser (to null). Org fields `abn` / `tax_exempt` / `default_pricing_tier` are **stored-and-displayed only — zero runtime pricing/tax readers**. No new capture is needed for this change; wiring org fields up is a separate project.

## 7. Verification checklist (§7)

Staging caveat: **there is no staging environment** — verification is local-dev against a restored prod snapshot, then a guarded prod cutover.

1. End-to-end order: `item_subtotal + shipping_subtotal + tax_total = total`; GST = total ÷ 11 (not total × 0.1).
2. Multi-line order: per-line GST sums to order GST (rounding drift check).
3. One each: tier-customer order (price-list path), customizer/SCP line (metadata-ladder path — **charges from `bulk_pricing`, not price rows**), shipping method, fixed-dollar promo.
4. Tax invoice PDF + HTML for a post-flip order: GST line correct, "inc. GST" wording, ABN present.
5. PDP price = tile price = feed price = charged price for one product (all four bases).
6. Meili: search-tile price + price-range filter consistent with PDP after reindex.
7. Google feed: item price matches PDP; Merchant Center re-fetch imports without price-mismatch warnings.
8. Chatbot: prices quoted match new basis (prose lines updated).
9. First 3 live orders checked against Stripe captures.

## 8. Cutover & rollback (§8)

**Under HOLD — DECIDED 2026-07-31 (absorb everywhere, incl. shipping). Built same day; runbook:**

Code shipped in the cutover commit: `set-aud-prices-tax-inclusive.ts` (idempotent, `DRY_RUN=1`, `ROLLBACK=1`), scp-shipping provider `is_calculated_price_tax_inclusive: true`, storefront label sweep (tiles ×2 builders, PDP "inc GST" label added, checkout shipping ×2, order shipping, cart-totals + order-summary + mini-cart inclusive display with informational "Includes GST" row), decoration `splitGst` flipped to extract ÷11, chatbot prose, CLAUDE.md convention. Cart/order totals use derived inclusive figures that are exact in BOTH regimes, so the storefront can deploy before or after the flag with no broken window.

Execution order (quiet hour, ~07:00 AEST):
1. Snapshot: DO managed-Postgres on-demand backup (insurance; no amounts change).
2. `cd backend && fly deploy --app sc-prints-backend` (ships the script + shipping provider flag).
3. `fly ssh console --app sc-prints-backend` → `cd /app/.medusa/server && DRY_RUN=1 npx medusa exec ./src/scripts/set-aud-prices-tax-inclusive.js` → review → re-run without DRY_RUN.
4. `git push origin master` (storefront labels — Vercel deploys).
5. Purge: `POST {storefront}/api/revalidate-products` (Bearer `$REVALIDATE_SECRET`); Meili reindex NOT required (amounts unchanged).
6. Verify per §7: place one real order (PDP $X inc → charged exactly $X; invoice shows GST = total ÷ 11), one tier-customer spot-check, one shipping band ($11 charged $11.00 flat).
7. Merchant Center: Update fetch — feed prices unchanged numerically, now compliant as inc-GST.

Rollback = `ROLLBACK=1 npx medusa exec …` + revert the storefront/backend commits. No data restore needed.

**Under GROSS-UP, additionally:**
1. Change formula constants once, in shared code: ladder output, `applyTierMultiplier` (backend + storefront mirror), rate cards (+ run the two pricing sync-checks).
2. Re-run generators: nightly tier regen (or trigger manually), importers per supplier for price rows + `bulk_pricing` metadata; one-off ×1.1 script for manually-priced products, org-inventory, and open quotes; regenerate `listing_summary`.
3. Fix [backfill-canonical-cost.ts:96](../backend/src/scripts/backfill-canonical-cost.ts) — it reverse-engineers cost as `tier ÷ 1.65` and breaks silently when the ladder changes.
4. Snapshot before/after of every price row + `bulk_pricing` metadata (rollback = restore).
5. The flag and the amounts must land in the same window — any gap is a 10% error in one direction. HOLD has no such window; GROSS-UP's is the deploy + regen duration. Schedule early morning AEST; stop-signal = any §7 check failing on the first live order.

## 9. Bugs found during scoping (independent of this decision)

| # | Bug | Severity |
|---|---|---|
| 1 | **Tax-exempt customers are charged GST but invoiced without it.** The flag is snapshot-only; nothing zeroes tax at checkout — invoice shows "GST (exempt) $0.00" and a total lower than the customer actually paid | **Money mismatch, live.** Fix = either charge correctly (tax-exemption hook) or stop rendering exempt invoices until it does |
| 2 | **POS email receipt is not a valid ATO tax invoice** — reuses order-placed template: no GST line, no ABN | Compliance; fix = send the tax-invoice template/PDF |
| 3 | **PDP headline price has no GST qualifier at all** (tiles say "ex GST", PDP says nothing, checkout adds 10%) | ACL exposure today, superseded by this project |
| 4 | Embroidery panel hand-builds a breakdown with `gst: 0` and labels an ex-GST figure "Total (inc-GST)" ([embroidery-panel.tsx:191-192](../storefront/src/modules/embroidery/components/embroidery-panel.tsx)) | Live mislabel |
| 5 | order-placed email mixes ex-GST line prices with an inc-GST total, unlabelled | Customer confusion |
| 6 | Two CSV generators write **cents** into `Variant Bulk Pricing JSON`; everything else writes dollars into the same column | Migration landmine |
| 7 | Meili `min_price_aud` and `listing_summary` use inverted field priorities despite a comment claiming they mirror | Latent drift |
| 8 | "GST" vs "Taxes" vs "excl. taxes" label inconsistency across cart / order summary / mini-cart | Cosmetic |

## 10. Sequence

1. **Decide §1** (needs the revenue ÷ 11 number) + accountant confirms the ACL reading.
2. Fix bugs #1 and #2 now — they're independent and #1 is a live money mismatch.
3. Audit active promotions + open payment links + open quotes in admin (manual, ~10 min).
4. Implement per §8 path. 5. Verify per §7. 6. Update CLAUDE.md + admin Help copy. 7. Merchant Center re-fetch and free-listings check.
