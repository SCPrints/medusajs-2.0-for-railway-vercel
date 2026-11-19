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

Not built: public team stores (many payers) — [TEAM_STORES_SPEC.md](TEAM_STORES_SPEC.md) still waits on Sean's eight decisions.
Dropped by Sean: QR scan-to-re-order.
