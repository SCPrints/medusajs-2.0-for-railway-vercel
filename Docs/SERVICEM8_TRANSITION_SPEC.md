# ServiceM8 → Medusa transition — scope for Phases 2–5

Status: Phase 1 (invoicing) SHIPPED 2026-08-04 — balance due + bank details on
the tax invoice PDF, `POST /admin/orders/:id/record-payment` for offline
EFT/cash, payment-state panel on the tax-invoice widget. `SCP_BANK_*` secrets
set on Fly.

Sizing: **S** = under half a day, **M** = about a day, **L** = multi-day.
Everything below is backend-only unless noted (deploys = `fly deploy`, no
storefront push needed).

---

## Phase 2 — staff-created jobs (the daily driver)

The gap: a job currently only exists via web checkout, POS, or a customer
clicking a quote-accept link. Staff can't turn a phone call or an accepted
quote into an order themselves.

### 2.1 Quote → order conversion (staff-side, no customer checkout) — **M**

The two halves already exist; this is a marriage, not a build:

- **Line mapping** — the customer accept route
  ([backend/src/api/store/quotes/[id]/accept/route.ts](../backend/src/api/store/quotes/[id]/accept/route.ts))
  already maps quote lines to cart lines honouring the quoted `unit_price`,
  carrying `customizerDesign`, stamping `quote_locked_price`.
- **Order creation** — `checkoutPOSSession`
  ([backend/src/services/pos-checkout/checkout.ts](../backend/src/services/pos-checkout/checkout.ts))
  already builds staff-side orders: `createOrderWorkflow(is_draft_order)` →
  `convertDraftOrderWorkflow` → optional mark-paid. Handles unit-price
  overrides and customizer lines.

Work items:
1. `convertQuoteToOrder` service — quote lines → order lines using the accept
   route's mapping + the POS checkout's workflow recipe. **No payment step**:
   the order lands unpaid, which is exactly what Phase 1 was built for
   (invoice with balance due + bank details goes out; EFT lands; staff click
   "Record payment received").
2. `POST /admin/quotes/:id/convert-to-order` — guards: quote not already
   converted (`metadata.order_id` idempotency, same as the Phase 11
   subscriber), has a customer + address.
3. "Convert to order" button on the quote Kanban
   ([backend/src/admin/routes/quotes/page.tsx](../backend/src/admin/routes/quotes/page.tsx)),
   shown for `accepted` (and optionally `quoted`) statuses.
4. Stamp `production_stage = received` + the quote↔order correlation metadata
   so the existing Phase 11 subscribers and tracker just work.

Risks: address/tax — reuse the POS studio-address fallback so GST computes;
the quote's shipping cost (if quoted) needs a manual shipping line or the
weight-based option attached explicitly.

### 2.2 Payment terms on customer / organisation — **S**

- `payment_terms_days` on `customer.metadata` and `organisation.metadata`
  (scalar attribute, same pattern as `deposit_*` — no migration needed).
- Small input on the existing customer tax-exempt / tags widget and the org
  admin page.
- On staff order creation (2.1) auto-stamp `metadata.balance_due_at =
  created_at + terms` when the payer has terms. The invoice PDF and the
  Phase 1 widget already read `balance_due_at` — zero changes downstream.

### 2.3 Draft-order smoke test (verification, not code) — **S**

Create one real staff order on prod via 2.1 covering: inc-GST pricing, a
customizer line, production stages, invoice PDF, record-payment. This is the
gate for trusting the pipeline with real jobs.

---

## Phase 3 — money visibility

### 3.1 Aged receivables report — **M**

- Route `GET /admin/reports/receivables`: walk non-cancelled orders, sum
  `payment_collections.payments.amount` per order (exact pattern already in
  [payment-mix](../backend/src/api/admin/reports/payment-mix/route.ts) and
  `loadReceiptOrder`), balance = total − paid, bucket by age against
  `balance_due_at` (current / 1–30 / 31–60 / 60+).
- One table component on the Reports page (repo has ~60 to copy from) with
  CSV export via the existing [csv-export helper](../backend/src/admin/lib/csv-export.ts).
- Skip a materialised view until order volume demands it.

### 3.2 Accounting export — **S**

CSV of invoices + payments for a date range (invoice # = order display_id,
date, customer, ex-GST, GST, total, payments received with method +
reference). Feeds the existing spreadsheet bookkeeping; a Xero integration is
explicitly out of scope until volume justifies it.

### 3.3 Overdue-invoice chase — **S–M** (defer until 3.1 proves needed)

Daily cron in the stale-orders mould: orders with balance > 0 past
`balance_due_at` → task for the order owner + optional reminder email.
Env-gated `INVOICE_OVERDUE_ALERTS_ENABLED` like every other send cron.

---

## Phase 4 — parity extras (build ONLY what the Phase 0 audit demands)

Phase 0 = list every ServiceM8 feature actually touched in the last 90 days +
every automation that fires unattended. Owner: Sean. Blocks the go/no-go on
each item below.

| Item | Size | Notes |
| --- | --- | --- |
| Set `deadline_at` from admin | **S** | Input on the production-stage widget; the calendar ([production-calendar](../backend/src/api/admin/production-calendar/route.ts)) already renders it — today nothing writes it. |
| SMS notifications | **M** | No integration exists at all. Cheapest: one `sendSms()` lib fn against a simple HTTP provider, called from the stage-changed subscriber behind `SMS_ENABLED`. Only if the audit says SMS matters. |
| Time tracking / job costing | **L** | Full module + UI. Strong skip candidate — only if ServiceM8 timers are genuinely in daily use. |
| Recurring jobs | **M** | Only if the audit finds any. |

---

## Phase 5 — data migration + cutover

| Item | Size | Notes |
| --- | --- | --- |
| ServiceM8 full export | **S** | Do this FIRST and archive it — access dies with the subscription. Clients, jobs, invoices, attachments. |
| Clients → customers import | **M** | One-shot script in `src/scripts/` (importer conventions apply), dedupe on email, org creation for businesses/schools. `DRY_RUN=1` first. |
| Historical jobs | **skip** | Keep the read-only archive; do not import years of job history into the order table. |
| Parallel run | — | 2–4 weeks: new jobs in Medusa, ServiceM8 read-only. Cut off after one full month's invoicing goes out clean. |
| In-flight jobs at cutover | — | Finish them in ServiceM8; start new ones in Medusa. Never migrate half-done jobs. |
| Staff guide | **S** | "Run a job start to finish" walkthrough added to Docs/STAFF_GUIDE.md + `/app/help`. |

---

## Recommended order

1. **2.1 + 2.2** (one deploy) — staff can create real jobs and bill on terms.
2. **2.3** smoke test on prod.
3. **3.1 + 3.2** (one deploy) — who owes what, and the accountant feed.
4. Phase 0 audit results → pick Phase 4 items.
5. Phase 5 export + import + parallel run → cancel ServiceM8.

Total build effort to "can cancel ServiceM8": roughly 4–6 working days of
implementation across items 1–3 + the parallel-run calendar time.

## Open questions (answers change scope)

1. Does anything in ServiceM8 send SMS today? (drives Phase 4 SMS)
2. Are timers/labour costing used at all? (drives Phase 4 time tracking)
3. Do any recurring/scheduled jobs exist in ServiceM8?
4. Does the accountant want anything beyond a CSV? (Xero would move 3.2 from S to L)
