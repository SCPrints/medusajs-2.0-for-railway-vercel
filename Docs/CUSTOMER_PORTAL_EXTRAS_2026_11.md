# Customer portal extras (Nov 2026)

Follows [CUSTOMER_PORTAL_REORDER_2026_11.md](CUSTOMER_PORTAL_REORDER_2026_11.md). Sean approved all of these on 2026-11-19
("Do them all"). Goal: a portal repeat customers (and a possible Defence contract) understand without being shown, and want to come back to.
Built in three batches; each batch is tested end to end before the next starts.

House rules for every feature: staff-controlled switches default OFF; prices are GST-inclusive; nothing emails a customer unless a
customer or staff action asked for it; cross-customer / cross-organisation access is 404; organisation roles are owner / purchaser / viewer.

## Batch 1 — buying as an organisation

### A. Buying on account (owner: checkout + organisation commerce)
| # | Feature | Shape |
| --- | --- | --- |
| 1 | Pay on account | Staff switch per organisation (`account_terms_enabled`, `account_terms_days` default 30, optional `credit_limit`). Approved orgs get "Pay on account" at checkout; the order is placed unpaid, invoice shows the due date. Backend MUST refuse the no-card payment path for anyone else. |
| 28 | Blanket purchase order | Org-level POs (`number`, `amount`, `expires_at`); an order can draw on one; the account shows what's left. |
| 29 | Accounts-payable contact | `ap_email` on the org: invoices are also emailed there; org page lists invoices as paid / outstanding / overdue. |
| 17 | Cost centres + spending limits | Org cost-centre list; each order tagged with one; optional per-member limit per order and per month (orders over the limit need approval). |
| 2 | Approval before ordering | A purchaser sends a cart for approval; an owner approves (order is placed) or declines with a note. |
| 18 | Draft orders | A saved cart with a name that any owner/purchaser of the org can open and finish. Same table as approvals. |

### B. Quotes and documents (owner: account quotes + documents pages)
| # | Feature | Shape |
| --- | --- | --- |
| 8 | My quotes | `/account/quotes`: the customer's quotes with status, lines, total, Accept and Pay (the existing accept flow), and the proof. |
| 27 | Quote PDF from the cart | "Download a quote" on the cart: a formal PDF (ABN, validity 30 days, lines, GST) saved as a `new` quote so staff can see it. |
| 30 | Price list | Their prices by quantity for the garments they order, downloadable. |
| 9 | Spend report | Per organisation and per customer: spend by month, by cost centre, statement of invoices (CSV + PDF). |
| 22 | Download pack | One zip per order: invoice, proofs, artwork. Plus SC Prints' supplier documents (staff upload them once in admin). |

### C. Team and range (owner: organisation roster + range)
| # | Feature | Shape |
| --- | --- | --- |
| 3 | Named roster | Per-organisation list of people (name, size per garment type, unit, optional number). |
| 12 | Upload a size list | Paste or upload CSV/XLSX of names and sizes into the roster or straight into an order. |
| 34 | Names and numbers | An order can carry the roster (who gets what); printed names/numbers are a request that goes to staff to price. |
| 35 | Packing choices | Per order: bulk, sorted by size, sorted by unit, or individually bagged and labelled (from the roster). |
| 15 | Private store ("Our range") | Designs shared with the organisation = its range. Members see only those, with the artwork already on. |
| 16 | One-screen order form | The range as one table: sizes across, quantities typed in, one "Add all to cart". |
| 25 | Usual garments first | Garments the customer has ordered before lead every garment picker. |

## Batch 2 — the job, after ordering
37 approve proofs in the account (click the mockup to mark a change) · 38 messages on the job (thread ↔ job diary) ·
7 approval link for the boss · 21 "Something wrong?" with photos · 36 size swap · 14 live tracking on account home ·
13 "Approved" badge on designs · 20 stock check on re-order · 19 "delivered by" date + rush option · 24 artwork check on upload

## Batch 3 — the rest
33 uniform allowance · 4 split delivery · 5 held stock (extend the existing organisation inventory portal) · 6 brand kit ·
11 sample first · 10 smarter re-order reminders · 23 invite colleagues · 31 compliance details · 32 two-step login

## Status (21 Nov 2026)

Batch 1 is live (67488f7a). Batches 2 and 3 are built and committed on local `master` (4967bca2 + the batch 3 commit), NOT pushed or deployed.
Checks: backend + admin + storefront `tsc` clean, 1,741 backend + 512 storefront tests, and 116 live route checks on a throwaway database
(46 for batch 2, 70 for batch 3). No page has been looked at in a browser.

**Before deploying batch 3:** set the Fly secret `AUTH_MFA_ENCRYPTION_KEY` (any long random string) or two-step setup errors.
Migrations run in the release command: `Migration20271122100000` (organisation_invite), `Migration20271122200000`–`02`
(organisation_allowance, organisation_allowance_pick, `organisation.brand_kit`). No module-link changes.

### Batch 2 as built
| # | What it does | Where |
| --- | --- | --- |
| 37 | Approve / request changes on the account order page; click the mockup to drop numbered pins (also on the signed page, in a "Point to what needs changing" section). Pins on `order.metadata.artwork_change_pins`; staff see them in the job window's Artwork section. One shared decision function for both routes. | `services/artwork-approval/decide.ts`, `lib/proof-pins.ts`, `me/orders/[id]/proof`, storefront `modules/artwork-approval/components/{pin-board,account-proof}` |
| 7 | "Someone else needs to approve this?" — copy or mailto the same signed link (we send nothing). | `me/orders/[id]/approval-link` |
| 13 | "Approved" badge when a saved design was used on an order whose artwork was approved (lines carry `source_design_id`; no backfill). | `me/designs/route.ts` |
| 38 | Messages thread on the order page (mounted inside `help`). A message is an order comment written as `email:portal:<customer>` so the job diary and the "customer waiting" logic treat it as a customer email, plus `raiseAttention`. The customer sees only their own messages and staff emails to them (`visibleMessages`, spec proves notes never leak). 20 per order per hour. | `lib/job-messages.ts`, `me/orders/[id]/messages` |
| 21 / 36 | "Something wrong?" (photos on our own storage only) and "Swap a size": requests on `order.metadata.customer_requests` that staff decide in the job window (open / approved / declined / resolved + note). Nothing on the order, stock or money changes. Deciding does not email the customer. | `lib/customer-requests.ts`, `services/customer-portal/requests.ts`, `admin/components/job/customer-requests.tsx` |
| 14 | "Orders in progress" (max 5, stepper + tracking link) at the top of the account home. | `account/components/overview` |
| 20 | Stock check before Order again: short lines listed with the closest size in stock; "Add what's available" or "Ask us to re-order". A failed check never blocks. | `lib/reorder-stock.ts`, `me/orders/[id]/order-again/stock` |
| 19 | "Estimated delivery" on the cart summary and checkout review = production ETA + 3–6 business days (the metro promise in the shipping policy). "Need it sooner?" saves `cart.metadata.rush_request` (cleaned server-side, copied to the order, shown in the job header). There is no rush price rule for carts, so no price is shown or charged. | `cart/components/delivery-estimate`, `middlewares/clean-cart-rush-request.ts` |
| 24 | Artwork check badge (print-ready tick or a plain note) on artwork library tiles and the Studio tray; reuses the DPI bands, computed in the browser. | `customizer/lib/artwork-check.ts` |

Left out of batch 2: account proof routes are for the order's own customer only (not other organisation members); "Use the suggestion"
(order-again cannot swap a variant); a problem can be reported on any placed order, not only shipped ones.

### Batch 3 as built
| # | What it does | Where |
| --- | --- | --- |
| — | **Sign-up email confirmation.** New sign-ups are stamped `metadata.email_verification_required = true` by a middleware on `POST /store/customers` and emailed a signed 7-day link. Accounts without the flag (every existing one) count as confirmed. Only confirmed accounts match quotes/orders by email (`findCustomerIdByEmail`, `customerEmailOf`, `ownsQuote`). `POST /store/customers/me` can no longer write `metadata`. Unconfirmed customers can still sign in and buy. | `lib/email-verification.ts`, `middlewares/customer-metadata-guard.ts`, `services/customer-verification/send.ts` |
| 32 | Two-step login = Medusa's built-in MFA (authenticator app + backup codes), customer-controlled, off by default. A password-only token gets 401 on every customer route. No QR code (the card shows the key and a tap-to-open link). | storefront `lib/data/identity.ts`, login component, profile card |
| 23 | Owners invite colleagues by email with a role. `organisation_invite` row (hashed token, 14 days, max 3 sends, 20 pending). Accepting needs a signed-in account with that exact, confirmed email. **The members "add" route now creates an invite instead of adding the person straight away.** | `lib/org-invites.ts`, `…/organisations/[id]/invites`, `me/organisation-invites/[token]` |
| 33 | Uniform allowance: items from the organisation's range × "how many each"; each roster person gets a no-login link to pick sizes (no prices shown); the owner adds everything to ONE organisation cart through the batch 1 range code (idempotent) and pays as usual. | `lib/allowance.ts`, `services/org-allowance/`, `store/allowance/[token]`, storefront `modules/allowance` |
| 4 | Split delivery at organisation checkout: quantities per saved destination, validated server-side, snapshot on `cart.metadata.split_delivery` → order → job window. Postage shown covers one address; staff confirm the rest. | `lib/split-delivery.ts`, `middlewares/clean-cart-split-delivery.ts` |
| 5 | Held stock already had low highlighting and on-hand/reserved figures. Added: "Low" badge, "Top up" (links to Our range), movement history, CSV. | `tab-inventory.tsx`, `stock-extras.tsx` |
| 6 | Brand kit per organisation (colours, fonts, placement notes, official logos) on `organisation.brand_kit`; owner edits, members read; staff see it on the organisation page and from the job window. | `lib/brand-kit.ts` |
| 11 | "Order one sample first" on the cart line: sets the line to 1 at the normal one-off price, `metadata.sample = true`; refused for screen print and embroidered caps; no credit promised. Order page: "Happy with the sample? Order the full run". | `lib/sample-line.ts`, `store/carts/[id]/sample-line` |
| 10 | Re-order reminders (still behind `REORDER_REMINDERS_ENABLED`, still through `shouldSendMarketingEmail`): timed from the customer's own median gap, about the order they repeat most, skipped when they have an open order/cart/quote or nothing re-orderable, max one per 60 days. Email lists last order's garments and one "Order again" button (`?again=1`). | `lib/reorder-reminder-rules.ts`, `services/reorder-reminders/` |
| 31 | Compliance per product (`product.metadata.compliance`) over a brand default (`brand.metadata`): origin, fibre, weight, certifications, care, statement link. Admin widget on the product; brand default + supplier-statement tagging in the brand drawer; "Materials and compliance" on the product page; statements grouped by brand on Documents. | `lib/compliance.ts`, `admin/widgets/product-compliance.tsx` |

Left out of batch 3: Studio sample button (cart line only); `sample_of` link back to the sample order; a Supacolour (min 10) block on samples;
compliance CSV; mailto links for allowance (the roster has no email column); people added to the roster after an allowance is created get no link;
split delivery does not set the order's shipping address; brand-kit swatches in the Studio.

Open decisions for Sean: transit allowance for the delivery window (3–6 business days metro today); price rule for rush and for printed names/numbers;
whether problems should be limited to shipped orders; whether owners may still add an existing customer to an organisation without an invite.

Not built: public team stores (many payers) — [TEAM_STORES_SPEC.md](TEAM_STORES_SPEC.md) still waits on Sean's eight decisions.
Dropped by Sean: QR scan-to-re-order.
