# Admin workflow consolidation — one job, one page, one next action

**Date:** 2026-10-21 · **Status:** proposal, nothing built · **Tracker item:** 7-6
**Trigger:** Dean's job (Q-4GY0KD74V2 → order #114). He accepted on 16 Oct, emailed his address and asked how to pay, chased twice, and nothing in the admin flagged it for five days.

---

## 1. What the admin looks like to staff today

| Surface | Count | What staff do there |
| --- | --- | --- |
| Custom sidebar entries | **26** (+ Medusa's own 7) | Hunt for the right page |
| Order detail widgets | **29** across 4 zones (13 main, 13 side, 3 header) | Scroll and hunt; every widget is the same size regardless of importance |
| Places one customer's job can live | **5** — contact submission, quote (Kanban drawer), job pricer (separate 1,800-line page), cart (customer card / open carts), order | Reassemble the story by hand |
| Pages that say "what should I do next" | **0** | Remember it |
| Customer emails visible in the admin | **0** | Live in Outlook; the system only sees signed-link clicks (approve, accept, request changes) |

The "who needs attention" surfaces that exist: Studio (5 buckets: VIP dormant, first timers, idle quotes, low NPS, snoozes), My tasks (mostly auto-created on failures), the stale badge (business-day limits per stage), the production board (6 stage tabs). None of them has a bucket for **"the customer is waiting on us"** or **"accepted but no order"**, which is exactly where Dean sat.

### Why Dean fell through

1. Quote accepted → (old flow) a cart, no order. No surface lists "accepted, no order".
2. Address + "how do I pay" arrived by email. The inbound-email webhook ([api/hooks/inbound-email](../backend/src/api/hooks/inbound-email/route.ts)) and per-order reply-to alias ([lib/order-inbox-alias.ts](../backend/src/lib/order-inbox-alias.ts)) exist in code but `ORDER_INBOX_DOMAIN` is unset and no MX / Resend inbound route is configured, so replies never reach the timeline. The alias also only covers orders, not quotes.
3. Even if a human opened his quote, the drawer shows line items, mood board, timeline. No "customer waiting 5 days", no "Convert to order" as the obvious next step, no address prompt (tracker 5-20).

The fix is not another widget. It is (a) one object staff think in, (b) one page per object, (c) one button on that page that is always the right next step, and (d) customer emails landing inside the system.

---

## 2. The model: a **Job**

A job is the whole thread for one piece of work: enquiry → quote → order → production → delivered. It is **not a new table**. We already correlate the pieces (`quote.metadata.order_id`, `order.metadata.quote_id`, `cart.metadata.quote_id`, `cart.metadata.requested_quote_id`, tasks anchored by `quote_id` / `order_id`). A job is a **read model** built from them:

```
getJob(idOrPublicId) → {
  id,                       // order id if one exists, else quote id
  customer, contact,        // name, email, phone, company, address (first found: order → quote → customer)
  phase,                    // enquiry | quoted | accepted | paid | artwork | blanks | production | shipped | delivered | lost
  quote?, cart?, order?,    // the underlying rows
  tracks,                   // artwork / blanks / production stages (existing)
  money,                    // quoted total, order total, paid, outstanding, payment links
  waiting_on: "us" | "customer" | "supplier" | null, since,
  next_action,              // see §3
  activity[],               // unified: quote events, stage history, comments, inbound emails, tasks, audit
  tasks[], flags[]          // stale, failed email, low DPI, needs address …
}
```

One route: `GET /admin/jobs/:id`. One pure function for `phase` + `waiting_on` + `next_action`, unit-tested like the stage planner. `ponytail:` no job entity; promote to a table only if something needs to be *written* on a job that doesn't belong to the quote or the order.

---

## 3. Next action per state

This is the table 7-6 asked for. The job page shows exactly one primary button; everything else is secondary.

| Phase + condition | `waiting_on` | Primary button | Does |
| --- | --- | --- | --- |
| Enquiry (contact / BYO / cart quote request / quote `new`) | us | **Price it** | Opens the pricer *inside* the job page |
| Quoted, no reply, < 2 business days | customer | *(none, shows "sent 1 day ago")* | — |
| Quoted, no reply, ≥ 2 bd | customer | **Nudge** | Templated follow-up email, logged |
| Customer replied (inbound email / changes requested on design) | us | **Reply / Revise** | Opens reply composer or pricer |
| Accepted, no order | us | **Convert to order** | Prompts for delivery address (5-20), creates the order, emails invoice + payment link |
| Order unpaid (or deposit unpaid) | customer | **Send payment link** / **Resend** | Existing payment-link feature |
| Paid, artwork `pending` / `in_review` | us | **Send proof** | Moves artwork → awaiting_approval (existing email) |
| Proof sent ≥ 2 bd | customer | **Remind** | Existing proof-reminder cron does it automatically once `PROOF_REMINDERS_ENABLED` is on |
| Changes requested | us | **Revise proof** | Opens "Create revised proof" (existing) |
| Approved, blanks not ordered | us | **Order blanks** | Dropship button for the right supplier, or mark ordered |
| Blanks ordered | supplier | **Mark arrived** | — |
| Approved + arrived + paid | us | **Start production** | Existing gate applies |
| In production | us | **QC done** → **Shipped** | Fulfilment bridge fires |
| Shipped | — | *(auto)* | — |
| Delivered | — | *(auto NPS)* | — |

Rule: **any inbound customer email flips `waiting_on` to `us`** regardless of phase, and the job rises to the top of Today.

---

## 4. Three screens (replacing ~12)

### A. Today — the landing page
One list, sorted by urgency, each row: customer · job title · phase chip · waiting-on badge with elapsed time · **next-action button inline**. Sections, in order:

1. **Customer waiting on us** (replied, accepted-no-order, changes requested, paid-no-progress)
2. **Ready to move** (approved + arrived + paid; QC done; blanks to order)
3. **Waiting on customer** (quote sent, proof sent, payment link sent) — with Nudge
4. **Due this week / overdue** (production_due_date)
5. **Problems** (stale, failed proof email, low-DPI flag, address missing)

Absorbs: Studio tab, My tasks (tasks become rows), stale badges, "Received" tab of the board. Dean's job would have been row 1 from 16 Oct.

### B. Job page — `/app/jobs/:id`
Works for a quote id, order id, or public id. Layout:

- **Header:** customer + contact (click-to-email, click-to-call), company, delivery address (or red "Missing"), owner, money strip (quoted / order total / paid / outstanding).
- **Phase strip:** Enquiry → Quoted → Accepted → Paid → Artwork → Blanks → Production → Shipped → Delivered, with the current step lit and dates under each.
- **Next action** button (from §3), plus a small "Log a call / email" for anything that happened off-system.
- **Tabs** (the 29 widgets, regrouped — same components, moved, not rewritten):

  | Tab | Today's widgets it absorbs |
  | --- | --- |
  | Overview | lines + prices (order items or quote lines / pricer breakdown), applied perks, shipping decision, deposit & payment links, email invoice |
  | Artwork | customizer downloads, print details, DTF gang sheet, screen colour check, vectorization flag, mockup PDF, approval status + resend proof |
  | Production | production stage (3 tracks), print recipes, line print notes, production photos, rejects, packing check |
  | Delivery | fulfilment context, AS Colour / Aussie Pacific / bottle-shop dropship, AusPost parcels, Drive folder |
  | Activity | timeline, comments + audit, quote events, **inbound emails**, tasks, watchers, NPS |

- On the Medusa **order detail** page, the same component mounts as the single widget in `order.details.before`; the 29 individual widget registrations are removed. Medusa's own order card (items, payments, fulfilment) stays below it.
- From the **quote Kanban**, a card click opens `/app/jobs/:quoteId` instead of the 1,700-line drawer. The pricer renders inside the Overview tab (it already persists to `quote.metadata.job_pricer`), so `/app/quote-pricer` stops being a destination.

### C. Board — `/app/production` (kept, widened)
Same page, two toggles: **Sales** (Enquiry · Quoted · Accepted) and **Production** (the existing six). Cards use the same row component as Today (phase, waiting-on, next action). Replaces the separate quotes Kanban.

---

## 5. Customer communication inside the system

Highest-leverage single change. All code exists; it is a configuration + small extension job.

1. **Resend Inbound Routing** for `jobs.scprints.com.au` (or `inbox.`) → `POST https://api.scprints.com.au/hooks/inbound-email` with `x-inbound-secret`. Set `ORDER_INBOX_DOMAIN` + `INBOUND_EMAIL_SECRET` on Fly.
2. Extend the alias to quotes: `inbox+qt<short>@…` and let the webhook post to a `quote_event` (`type: "message"`). ~30 lines.
3. Put the per-job alias as **Reply-To on every customer email** (quote sent, proof, invoice, payment link, stage emails). Replies then land on the job's Activity tab and flip `waiting_on = us`.
4. Staff-side **Reply** on the job page sends from `orders@scprints.com.au` with the alias as Reply-To and logs the outbound. Plain textarea, no rich editor. `ponytail:` no threading UI; the Activity tab is the thread.
5. Fallback for anything that still happens in Outlook: **Log email / Log call** button (paste or one line).

Enquiries that arrive as plain emails to `info@` (like Dean's first message) still start in Outlook. Forwarding them to `inbox+new@…` creates the enquiry row; or staff click **New job** on Today and paste. Good enough; a full shared inbox is out of scope.

---

## 6. Sidebar: 26 entries → 8

Medusa's `defineRouteConfig` supports `nested`, so this is grouping, not rebuilding.

| Group | Contains | Fate of today's entries |
| --- | --- | --- |
| **Today** | Today list | replaces Studio tab, My tasks |
| **Jobs** | Board · Quotes · Orders (Medusa) · Enquiries | Enquiries = Contact submissions + Open carts merged; Job pricer removed from the sidebar (lives in the job page) |
| **Sell** | POS · New order | — |
| **Customers** | Customers (Medusa) · Organisations | — |
| **Catalog** | Product data · Brands · Print profiles · Shop categories · Bundles · Bottle shops | — |
| **Storefront** | Studio & Lookbook · Home sections | — |
| **Supply** | Dropship (AS Colour · Aussie Pacific · Bottle shop as tabs) | 3 entries → 1 |
| **Reports** | Reports | — |
| **Settings** | Automation rules · Owner rotation · Email suppressions · Help | — |

---

## 7. Phasing — each step ships on its own and is useful alone

| Phase | What | Effort | Would it have caught Dean? |
| --- | --- | --- | --- |
| **0. Plumbing (no new UI)** | Wire inbound email (§5.1–3); `PROOF_REMINDERS_ENABLED=true`; add "accepted, no order ≥ 1 bd" and "customer waiting" to the stale scan so they create tasks + badge; address prompt on convert (5-20) | 1–2 days | **Yes** — a task and a badge by 17 Oct |
| **1. Job read model + Job page** | `GET /admin/jobs/:id`; `next_action` function + tests; job page with tabs mounting the existing widgets; single widget on order detail; quote card → job page | 1 week | Yes — one page shows "waiting on us 5 days, Convert to order" |
| **2. Today** | Today list from the same read model; replaces Studio tab + My tasks; first sidebar item | 3 days | Yes — row 1 |
| **3. Sidebar + merges** | `nested` groups; Enquiries tab (contact + carts); Dropship tabs; retire Job pricer + quotes Kanban drawer as routes | 2–3 days | — (comfort) |
| **4. Delete** | One accept flow instead of two (7-3); quotes page 1,744 → thin; remove dead widget registrations; update STAFF_GUIDE "Common tasks" table to the new paths | 2 days | — (maintenance) |

Not in scope, on purpose: a Job table, a shared inbox product, in-app notifications centre, mobile app, rewriting any widget's internals. `ponytail:` each is only worth it once the read model proves what staff actually need.

---

## 8. How we know it worked

- **Clicks to answer "where is this job up to and what do I do next":** today ≈ 6–10 across 2–3 pages; target 1 (Today row) or 2 (open job).
- **Unnoticed customer wait:** today unbounded (Dean: 5 days); target flagged on Today within 1 business day, task created automatically.
- **Sidebar entries staff must know:** 26 → 8 groups.
- **Order detail scroll:** 29 stacked widgets → 1 panel with 5 tabs.
- Ask staff after two weeks: "Is there anywhere you still go that isn't Today, the job page, or the board?" The answer should be POS and Reports.

## 9. Phase 0 — shipped 2026-10-21 (commit 31df8fc3), and the switches

Code is live on master (Vercel) and Fly. What it does with no config change: the admin "Convert to order" button asks for the delivery address (or pick-up); the customer accept page collects one; proof change requests (order and quote) create a task for the owner and email staff; the 08:00 UTC sweep flags any quote accepted ≥ 1 business day ago with no order. Replies still go to `SUPPORT_REPLY_TO_EMAIL` until the inbox domain is set.

To turn customer replies on (one-off, ~15 minutes, all in dashboards):

1. **Resend → Domains → Add domain** `jobs.scprints.com.au`, region Sydney isn't offered so pick the default; tick **Receiving**. Add the records it shows at Cloudflare: the MX for `jobs` (receiving) plus the SPF/DKIM TXT rows. Wait for "Verified".
2. **Resend → Webhooks → Add**: URL `https://api.scprints.com.au/hooks/resend`, events **email.received**, **email.bounced**, **email.complained** (opened/clicked optional). Copy the signing secret (`whsec_…`). One webhook only: the route verifies against a single secret.
3. **Fly secrets** (each `fly secrets set` restarts the backend once; set them in one command):
   ```bash
   fly secrets set --app sc-prints-backend ORDER_INBOX_DOMAIN=jobs.scprints.com.au RESEND_WEBHOOK_SECRET=whsec_… PROOF_REMINDERS_ENABLED=true
   ```
   `RESEND_WEBHOOK_SECRET` was never set, so bounce/complaint suppression also starts working with this. `INBOUND_EMAIL_SECRET` is only for a non-Resend provider; leave it.
4. **Test**: open any order in admin, "Email invoice" to yourself, reply to it. Within a minute the reply is on the order's Comments & audit, a task "Reply to the customer — #N" is in /app/tasks, and `info@` gets a "Customer replied" email.

Also worth flipping now: `STALE_ORDER_ALERTS_ENABLED=true` (the first run creates one task per currently stuck order; today that's a handful).

## 10. Phase 1 — shipped 2026-10-21

- `GET /admin/jobs/:id` (any id: order, quote, `Q-…`, order number) returns the read model in [backend/src/lib/job-view.ts](../backend/src/lib/job-view.ts); the next-action rule is [backend/src/lib/job-state.ts](../backend/src/lib/job-state.ts) (pure, unit-tested). `POST /admin/jobs/:id/reply` emails the customer or logs a note.
- The Job panel ([backend/src/admin/components/job/job-panel.tsx](../backend/src/admin/components/job/job-panel.tsx)) is the one widget on the Medusa order page and the page at `/app/jobs/:id`. The 27 order widgets now live in `components/job/widgets/` and render inside the tabs.
- From the quote Kanban: "Open job" on each card and in the drawer. The drawer stays for editing lines and the Studio popup (Phase 4 slims it).
- Not in Phase 1: Nudge is a reply box with no template yet; order_blanks / revise_proof switch to the right tab rather than acting; quote-side Artwork tab is a status + link to the drawer.

## 11. Phase 2 — shipped 2026-10-21

- `/app/today` ([backend/src/admin/routes/today/page.tsx](../backend/src/admin/routes/today/page.tsx)) lists every unfinished job in three sections from `GET /admin/jobs` (section rules in [backend/src/lib/job-today.ts](../backend/src/lib/job-today.ts), tested). One-click next actions run from the row; the rest open the job.
- The first visit to the bare `/app/orders` in a browser tab goes to `/app/today`, since Medusa has no landing-page setting.
- Studio tab and My tasks are still there for now; Phase 3 removes the Studio tab and nests My tasks.

## 12. Decisions needed from Sean

1. Approve Phase 0 now (config + two small code changes; nothing visual changes).
2. Approve Phase 1–2 as the build (the job page and Today). Phases 3–4 follow once staff have used them.
3. Inbound domain: `jobs.scprints.com.au` vs reusing `scprints.com.au` with a plus-address (needs an MX change on the main domain, which also affects Microsoft 365 mail routing — the subdomain avoids that risk).
