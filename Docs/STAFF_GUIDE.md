# SC PRINTS staff guide

A practical "where do I do X?" map of the admin. Written for new starters but useful for anyone catching up on a feature they don't use every day.

This guide pairs with [`BACKEND_FLOW.md`](./BACKEND_FLOW.md) — that one's the technical "how does data move through the system" map. This one's the "what should I click and when?" version.

---

## Your daily home — **Today**

Path: `/app/today` (the first visit to Orders in a new tab lands here too)

Today is one list of every unfinished job — a job is a quote and/or the order it became — sorted longest wait first, in three sections:

| Section | What's in it | What you do |
| --- | --- | --- |
| **Customer waiting on us** | They emailed, accepted a quote, asked for proof changes, or are waiting for a price or a payment link | Press the button on the row: Reply, Convert to order, Revise the proof, Price it, Send payment link |
| **Ready to move** | Proof ready to send, blanks arrived, QC done — or blanks a supplier owes us | Send proof, Start production, QC done, Mark shipped run from the list in one click |
| **Waiting on customer** | Quote, proof or payment link sent and no answer yet | Leave it; Nudge after two business days (the proof reminder emails automatically) |

Flags (stale, placeholder address, unanswered emails) and due dates show as badges on the row. Shipped and delivered jobs are not listed. Click the row to open the **job page**.

### The job page

Path: `/app/jobs/<order id, quote id, Q-… number or order number>` — and the same panel sits at the top of every order in Orders.

- **Header**: customer (click to email or call), owner, quoted / order / paid / owing.
- **Phase strip**: Enquiry → Quoted → Accepted → Paid → Artwork → Blanks → Production → Shipped → Delivered, with the date each was reached.
- **Next action bar**: who the job is waiting on, for how many business days, and the one button to press. Start production asks for a reason if the gate (approved artwork, blanks arrived, deposit paid) isn't met.
- **Tabs**: Overview (lines, payment, delivery address, flags, tasks, owner) · Artwork (downloads, print details, proofs, DPI) · Production (stage tracks, recipes, notes, photos, rejects, packing) · Delivery (fulfilment, dropship, parcels, Drive folder) · Activity (every email in and out, stage change, comment, task, in one thread, plus the reply box).
- **Reply** sends a plain email from `orders@scprints.com.au`; the customer's answer comes back onto the job's Activity and the job jumps to "Customer waiting on us". **Log note / call** records anything that happened off-system.

**Customer emails**: every email the system sends about a job (quote, invoice, proof, stage updates) has a reply-to address that belongs to that job. When the customer replies, it lands on the job, a task is created for the owner and `info@` gets a "Customer replied" email. This needs the Resend receiving domain and Fly secrets described in `Docs/ADMIN_WORKFLOW_CONSOLIDATION_2026_10.md` §9.

---

## Order management

### The order detail page

The job panel (above) sits at the top; Medusa's own order card (items, payments, fulfilment, addresses) is below it. The panels that used to stack down the page now live in the job panel's tabs:

| Panel | Tab | What it does |
| --- | --- | --- |
| **Production stage tracker** | Production | Our multi-track stage system (artwork / blanks / production). The next-action button on the job header moves the common transitions for you. |
| **Deposit & balance / payment links** | Overview | Deposit schedule, Stripe payment links, "Record payment received". |
| **Email invoice**, **Shipping decision**, **Customer perks** | Overview | Re-send the tax invoice; see what shipping was quoted; "Free shipping (waive at fulfilment)" when a VIP / Wholesale tag qualifies. |
| **Customizer downloads / print details / DTF gang sheet / screen colour check** | Artwork | Print files, mockups, revised proofs, sizes and positions in mm, DPI flags. |
| **Print recipes, line print notes, production photos, rejects, packing check** | Production | Operator settings and records. The latest photo auto-appears in the customer's next stage email. |
| **Fulfilment context, AS Colour / Aussie Pacific / bottle-shop dropship, AusPost parcels, Drive folder** | Delivery | Where the blanks come from and where the job ships. |
| **Activity thread, watchers, NPS** | Activity | Every email, stage change, comment and task; extra people to CC; the post-delivery score. |

The red **Stale** badge still shows at the very top when a stage has sat past its limit; it clears when the stage moves.

### Moving an order forward

1. Customer places order → automatically stamps `production_stage = "received"` and starts the artwork + blanks parallel tracks.
2. You advance stages from the production-stage widget. Some transitions email the customer (`awaiting_approval`, `in_production`); see `backend/src/lib/production-stage.ts:STAGES_THAT_EMAIL`.
3. Reply emails from the customer land on the job's Activity (replies go to `inbox+ord<id>@<ORDER_INBOX_DOMAIN>`; quotes use `inbox+qt<id>@…`), create a task for the owner and flag the job "Customer waiting on us".
4. Once `delivered`, the NPS request fires automatically 14 days later (if `NPS_REQUESTS_ENABLED=true`).

### Approving customer artwork

When you advance artwork to `awaiting_approval`, the customer receives an email with a signed approval link. They click → see the proof + production photo → hit Approve → artwork stage auto-advances to `approved` and the production track unblocks.

You'll see the approval recorded on the order timeline + on the artwork track in the production-stage widget.

### Stale-order alerts

If you forget about an order for 3+ days, the system flags it with a red badge and (if `SLACK_PRODUCTION_WEBHOOK_URL` is set) posts a digest to `#production` Slack. Move the stage forward and the flag clears.

---

## Customer management

### The customer detail page

| Widget | What it does |
| --- | --- |
| **Lifetime value** | LTV, order count, AOV, days-since-last + "Suggest VIP tag" button when threshold is crossed |
| **Tags + notes** | Pinnable internal notes and colour-coded labels (VIP, Wholesale, Tricky, etc.) |
| **Tax status** | Flag a customer as tax-exempt (no GST on invoices). Their orders snapshot this flag at placement so invoices stay accurate. |
| **Customer journey** | Unified timeline pulling PostHog page-views + orders + NPS + saved designs + tag changes |

### Snooze notes

Add a note with a snooze date ("call back Tuesday"). It dims until that date, then surfaces in Studio's "Snoozes due" bucket so you don't drop the ball.

### Marketing consent (customer side)

Customers manage their own email/SMS/retargeting consent from their account profile page. The "Marketing emails" toggle gates every automated marketing send (abandoned cart, win-back, NPS request).

---

## Quote pipeline

Path: Orders → **Quotes** (`/app/quotes`). Enquiries that aren't quotes yet (contact form, carts built in the Studio and never checked out) are under Orders → **Enquiries**.

Every BYO inquiry, contact form quote request, or admin-created lead lands here as a "new" quote. Move it through the pipeline:

```
new → quoted → accepted → order (unpaid, invoice + card link emailed)
           ↘ lost / expired
```

**The quote drawer is for building the quote**: lines (pick catalog products, or design them in the Studio popup), the Job pricer for grouped jobs, mood board, assignee, status. Everything about *where the job is* — activity, replies, next action, Convert to order — is on the **job page** ("Open job").

**One way to send it to the customer**: **Email customer…** in the drawer. If every line has a price it sends the quote with the accept-and-pay link; if not, it sends the design-approval link (they approve the mockup or ask for changes, then you price it and send again). **Copy link** gives you the same link the email would carry, for pasting into an Outlook reply.

**Accepting is ordering.** The customer gives their delivery address (or picks pick-up) on the accept page; the order is created at the quoted prices, the tax invoice is emailed, and a card payment link is offered. If a customer accepts but no order appears within a business day, Today flags it and the owner gets a task. Staff can convert from the job page instead ("Convert to order" asks for the address).

**Mood boards:** Inquiries from the BYO form can include up to 5 reference images. They appear as thumbnails at the top of the quote detail.

---

## Organisation accounts

Path: `/app/organisations`

For schools, sports clubs, businesses — anything that groups multiple customers under one shared purchasing identity.

- **Members:** add individual customers with a role (`owner` / `purchaser` / `viewer`).
- **Default pricing tier:** future hook for price-list overrides.
- **Tax-exempt:** flag snapshots to every order placed by org members.
- **Primary contact:** required before placing fulfillment orders — set on the org overview tab.
- **Notes:** internal context for the sales team.

Customers see their memberships at `/account/organisations` on the storefront.

Owners can manage members from the storefront portal (invite by email, change roles, remove) — see *Customer fulfillment service* below.

## Customer fulfillment service (B2B restocks)

A per-organisation inventory + drop-ship workflow for ongoing B2B customers (Lifegrain Cafe is the first one). Replaces the "Uniforms spreadsheet" pattern: each customer gets pre-approved designs, a destination network, an inventory grid keyed on *(design × garment)*, and a self-service customer portal.

### When to use this vs a normal order

- **Fulfillment order** — the customer has locked artwork + locked garment combos that they restock against repeatedly. They want live stock, no customizer, consistent unit pricing.
- **Normal order** — one-off custom job. Customer goes through the storefront customizer / quote flow.

### The three building blocks

Configured inside the org detail page (`/app/organisations` → pick org → tabs).

1. **Designs** — upload a thumbnail (shown to customer) + a print file (staff-only, never exposed via store API). Each design is attached to every fulfillment order line so production sees the right artwork.
2. **Destinations** — the customer's ship-to network (e.g. one row per shop). Address + contact + delivery notes (gate codes, receiving hours). Admin-only management; customers see them read-only on the portal.
3. **Inventory rows** — one row per (design × variant) combo. Carries unit price (cents), unit cost (cents), fulfillment mode, current on_hand + reserved, optional reorder_point + lead_time_days.

### Fulfillment modes

| Mode | Means | On order placement | On shipment |
|---|---|---|---|
| **Held stock** | Pre-printed garments on our racks. Customer sees live `on_hand`. | `quantity_reserved` += qty | Both `on_hand` and `reserved` decrement |
| **Print on demand** | Print only when ordered. Customer sees a "PoD" badge. | Unassigned `print_run` task created | No inventory effect |

### Over-allocation

Customers can order *more* than is on_hand for held_stock rows. The portal warns inline ("we'll print N additional units, +X days"). The Phase 1 subscriber reserves the full qty AND auto-creates a print task for the deficit (priority high, unassigned) so production knows to print more.

### Placing a fulfillment order (admin)

Use when you get an order via email/phone instead of the customer portal.

- `/app/fulfillment/new` — two-step item picker (design tile → size picker), pick destination, hit submit.
- `/app/fulfillment` — list view filtered to `metadata.fulfillment_order=true` orders.
- Refuses to submit if the org has no *primary contact* set.

### Customer portal (Phase 2)

Customers self-serve at `/account/organisations/[id]`. Six tabs, gated by role:

- **Overview** — stats + 5 most recent orders + Place New Order CTA.
- **Designs** — gallery + modal showing SKU coverage. Read-only.
- **Inventory** — full admin-parity grid: on_hand / reserved / available / reorder_point / lead_time. Below-reorder filter highlights what needs restocking.
- **Destinations** — list + modal with full address + delivery notes. Read-only.
- **Orders** — history filtered to this org with the production-stage tracker on each detail page.
- **Members** — owner-only. Invite by email (invitee must already have an SC Prints account), change roles, remove. Last-owner guard prevents lockout.

### Self-cancellation

Purchaser + owner roles can cancel a fulfillment order within 24 hours of placement from the customer portal. After that the button disappears and the customer has to email us. Cancellation auto-releases the held_stock reservation; print-on-demand tasks are NOT auto-cancelled (staff intervention via `/app/tasks`).

### What the subscribers do automatically

- **On order placed** — held_stock lines reserved; PoD lines + over-allocation deficits become unassigned print tasks. Customer gets a "Restock confirmed" email; production gets an internal alert to `FULFILLMENT_NOTIFICATION_EMAIL` (falls back to `ORDER_NOTIFICATION_EMAIL`).
- **On shipment created** — held_stock lines decrement both `on_hand` and `reserved` in one movement. Customer gets the standard order-shipped email.
- **On order cancelled** — held_stock reservations released; `on_hand` untouched.

All three are idempotent — re-fired events don't double-process.

### Cache invalidation

The customer portal uses Next.js cache tags. When admin mutates a design / destination / inventory row, the backend fires a fire-and-forget POST to `/api/revalidate-org` on the storefront so customer pages refresh on next render. Requires `STOREFRONT_URL` + `REVALIDATE_SECRET` on the backend.

### Common ops

- **Onboarding a new fulfillment org** — create org → set `primary_contact_customer_id` → add designs (thumbnail + print file) → add destinations → add inventory rows. Pick fulfillment mode per row.
- **Customer says stock is wrong** — inventory row → Adjust action lets you reconcile `on_hand` to a target (movement log records the delta).
- **Print run finished** — inventory row → Receive action increments `on_hand` by the run quantity. Auto-backs any over-allocations.
- **Add a new SKU mid-relationship** — inventory tab → add row. Customer sees it on their portal within a render.
- **Primary contact's personal order history cluttered with restocks** — already fixed. The primary contact's `/account/orders` filters out `metadata.fulfillment_order=true`; restocks only show under `/account/organisations/[id]/orders`.

## Group orders (customer-driven)

Group orders are a customer-side flow. Coaches / school P&C / corporate buyers turn a saved design into a shareable link where teammates submit their own sizes.

How a customer starts one (no admin action required):

1. Save a design in the customizer (existing flow).
2. Open `/account/designs` → click *Use for a group order* on the design.
3. Fill in title + deadline + share-with email — generate the link.
4. Send the link to teammates. Each picks a size from the actual variants on the base product.
5. When everyone's in, the coach opens `/account/group-orders`, closes the order, and clicks *Convert to cart*.
6. Backend builds one cart with N lines (one per participant, matched to the right variant). Participants with unmatchable sizes appear in the *skipped* list so the coach can fix them up.
7. Coach checks out via the normal Stripe flow.

Admin view: there's no `/app/group-orders` page — these belong to the customer. If a coach asks for help, look up their customer record and the group orders + linked design are visible via the data layer.

---

## Point of sale (walk-in transactions)

Path: `/app/pos`

Use this when a customer walks into the studio and wants to buy something on the spot — pre-made products, a custom print they want designed there and then, or a mix. The till lives entirely in the admin so anyone signed in can use it.

### Layout
Three panels side-by-side:

- **Left — Products.** Type to search by name, SKU, or handle. Click a single-variant product to add it directly; multi-variant products expand so you can pick the size/colour. Above the list, **+ Add custom design** opens the storefront customizer in a popup keyed to the current sale.
- **Middle — Cart.** Every line you've added. Adjust quantities with the +/− buttons, remove with the trash icon. **Click the price on any line to override it** — useful for negotiated walk-in pricing. Standard products auto-merge if you add the same variant twice; custom designs always stay separate. Running total at the bottom shows subtotal, any promo codes / manual discount, and the final total.
- **Right — Checkout.** Pick the customer (search or "+ New customer") or click **+ Walk-in (no email)** for a true scan-and-go cash sale. Confirm region (defaults to AUD) and sales channel. Add **promo codes** (any saved Medusa promotion) or a **manual discount** in dollars to mark a sale down. Two pay buttons: **Pay cash** (marks the order paid immediately) or **Card (QR link)** (mints a Stripe Payment Link, shows a QR code).

### Custom-design flow
1. Click **+ Add custom design** in the products panel. A popup window opens with the storefront customizer.
2. Design the artwork normally — colours, text, upload images, pick the print size.
3. Click **Add to cart**. The customizer detects POS mode (via the `?pos_session=` URL it was opened with), saves the design back to the till, and closes itself.
4. Within ~2 seconds the line appears in the middle panel tagged **Custom**.

If a popup is blocked, the browser shows it in the address bar — allow popups for the admin domain and try again.

### Payment

**Cash** — clicks `Pay cash`, system creates a real Medusa order and marks it paid. Done. Take the cash, hand them a receipt (the modal shows the order number).

**Card (QR link)** — clicks `Card (QR link)`, system creates the order, mints a Stripe Payment Link, shows the customer a QR code on screen. They scan with their phone, pay in their banking app / Apple Pay / Google Pay, and the modal flips to "Payment received" automatically when Stripe's webhook fires. You can also tap "Copy link" and SMS it if a QR is awkward.

### After payment

The receipt modal shows the order number, total, and items, plus a few one-click follow-up actions:

- **Email receipt** — type any email address and click Send. Re-sends the order-placed email so the customer gets a record (useful if they wanted email but you didn't capture it upfront, or if you fat-fingered theirs).
- **Customer walked out with goods → mark delivered** — fast-forwards the order through every production stage (artwork → blanks → production → delivered) in one click. Use only for stock-item pickups where there's nothing to make; custom jobs should progress organically so the customer still gets the artwork-approval email etc.
- **Open order** — jumps to the standard order page where everything works as normal: customizer lines show up in print details, mockup PDFs render, the order flows through the production stage tracker.
- **New transaction** — wipes the till state and starts a fresh session, ready for the next walk-in.

### Parking a sale (multi-customer)
Click **Park sale** in the checkout panel if a customer wants to think about it or another walk-in interrupts. The cart is saved against the current session and a fresh empty session opens for the next customer. A **Parked (N)** dropdown appears at the top of the page listing your parked sales — click to resume any of them. Park-and-resume only sees *your* own parked sales, so two staff working different tills don't see each other's carts.

### Repeating a previous order
After you pick an existing customer in checkout, a **Repeat last order** button appears. Clicking it loads the line items from their most recent order into the cart. Standard items repeat as-is; custom designs are skipped (they need the customizer popup to rebuild) and the count is shown in the success toast.

### Things to know
- A POS session lasts 4 hours. If a customer steps out and comes back later, the cart is still there on the same browser tab.
- POS orders are real orders. They appear in /app/orders, count toward the customer's LTV, fire the production-stage emails (`Received` → `Art review` → …) just like online orders.
- The studio's address is stamped on every POS order so GST computes correctly — the customer never sees it.
- Cash payments are tagged `pos_cash` so the payment-mix report buckets revenue under "Cash" instead of "Stripe".
- Custom design metadata is preserved on the order line — the mockup PDF generator, customizer downloads widget, and print-details widget all work without any POS-specific handling.
- Abandoned sessions auto-tidy hourly — anything not checked out within 4 hours flips to "expired" so the parked-sales picker stays clean.

---

## Production tooling

### Print queue (suggested run order)

Path: `/app/production?tab=print-queue`

Today's queued jobs grouped by decoration method + ink colours so the press operator changes setups as few times as possible. Open this when planning the morning's run.

- One bucket per `(method, colours)` combination — all jobs in a bucket share a setup.
- Stale buckets float to the top (already overdue).
- Within a bucket: stale jobs first, then earliest deadline, then FIFO by created_at.
- "Unspecified (review)" bucket = orders without decoration metadata; check those before running.
- Each job shows its recipe id (if linked) so the operator knows which tuning notes to follow.
- An order with multiple techniques appears in two buckets — one per technique. That's deliberate.

This is a *suggestion*, not a lock. Free to override based on what the press is already set up for.

### Production calendar (Gantt)

Path: `/app/production?tab=calendar`

Every in-flight order plotted against its created_at + deadline. Colour = stage. Red glow = stale. Click any bar to open the order.

Use it to:
- Eyeball capacity before promising a deadline ("can we fit this in?").
- Spot deadlines that need attention (red bars approaching today).
- Plan resource allocation for the week.

### Production rejects report

Path: `/app/production?tab=rejects`

Aggregates every reject row staff log on order detail pages.

- **By reason:** misprint → operator drift; supplier_defect → bad batch; artwork_error → customer problem.
- **By supplier brand:** dollar value of waste per supplier (AS Colour vs FashionBiz vs etc.). Use it as evidence when chasing supplier credits.

### Print recipes

Path: `/app/production?tab=print-recipes`

Reusable production settings library. Capture mesh count, flash temp, ink type, embroidery digitization file location, etc. Link recipes to specific orders so operators have the right settings without asking senior staff.

Searchable by name, filterable by decoration method (screen print / DTF / embroidery / etc.).

### Lookbook (public gallery)

Path: `/app/storefront/lookbook` → renders to `/lookbook` on the storefront

Curated photos of real SC PRINTS jobs as a Pinterest-style grid. Use it to:
- Soft-sell outcomes (tagged hoodie on a real player) instead of blanks.
- Build social proof for new visitors.
- Reuse approved customer photos with attribution.

Tag tiles by theme (sports / corporate / school / embroidery) — they show as filter chips on the public page. Toggle published on/off without deleting.

### AI description generator

Where: every product detail page → AI description widget on the right column.

Click *Generate drafts* and the system returns 3 description variants (short → standard → detailed) generated from the product's title, brand, type, weight, tags, variants, and any safe metadata fields. Pick the one closest to right, edit if needed, click *Apply this draft*.

- Doesn't send pricing, SKUs, or stock to the LLM.
- The optional *Hint* field biases the model — try "team kit", "winter casual", or similar.
- If the AI provider isn't configured the widget shows a hint to set `AI_PROVIDER` + the matching API key on Fly (backend secrets).
- Apply replaces the existing description in place. Roll back via Medusa core if needed.

---

## Reports

Path: `/app/reports`

The Reports page (pre-existing) covers business-level KPIs. Monthly digest of these goes to `MONTHLY_DIGEST_RECIPIENTS` on the 1st of each month.

The SEO analytics page at `/app/seo-analytics` shows GSC + GA4 metrics with a 28-day window.

---

## Automation rules

Path: `/app/setup/automation-rules`

No-code "when X happens, do Y" rules. Triggers on `order.placed` and `order.production_stage_changed`. Conditions support `eq / neq / gt / gte / lt / lte / contains / exists` operators. Actions:
- Tag a customer (e.g. "if LTV > $1500, tag VIP")
- Post an internal order comment
- Send an alert email to staff
- Advance the production stage

Useful for catching patterns without writing code.

---

## What runs automatically (you don't have to do anything)

| Cron | When | What |
| --- | --- | --- |
| AS Colour inventory sync | hourly | Pulls stock from supplier API |
| Cross-sell recommendations | 02:00 UTC daily | Recomputes "frequently bought together" per product |
| PostHog cohort sync | 03:30 UTC daily | Reconciles PostHog cohorts to Medusa customer_tags |
| FashionBiz inventory sync | 04:00 UTC daily | Same as AS Colour for FashionBiz brands |
| SEO analytics refresh | 05:00 UTC daily | Pulls GSC + GA4 metrics |
| Stale-order scan | 08:00 UTC daily | Stamps `is_stale` on orders not advancing |
| NPS request | 22:00 UTC daily | Sends NPS emails 14 days after delivery |
| Abandoned-cart reminders | 23:15 UTC daily | Emails customers with stale carts |
| Reorder reminders | 23:30 UTC daily | Pings repeat customers past their median order gap |
| Report alerts | 23:45 UTC daily | Threshold breach checks |
| Win-back | 00:00 UTC Mondays | Weekly inactive-customer email |
| Monthly digest | 22:00 UTC, 2nd of month | Reports digest to staff |

Each cron has its own `*_ENABLED` env var (see `backend/src/lib/constants.ts`). They default to off so dev / staging environments stay quiet.

---

## Common tasks → where to do them

| I want to… | Go to |
| --- | --- |
| Ring up a walk-in customer | `/app/pos` |
| Take a card payment in-person (QR link) | `/app/pos` → Card (QR link) |
| See what needs my attention today | `/app/today` |
| Plan today's production runs (minimise setup changes) | `/app/production?tab=print-queue` |
| Regenerate a product's description with AI | Product detail → AI description widget |
| Find a customer who hasn't ordered in a while | Customers → the customer card (LTV widget), or `/app/reports` → RFM |
| Add a snooze reminder for a customer | Customer detail → Notes → add note with snooze date |
| Mark a customer tax-exempt | Customer detail → Tax status widget |
| Tag a customer as VIP / Wholesale | Customer detail → Tags widget |
| Run a quote through to a paid order | `/app/quotes` → build it → Email customer… (accept-and-pay link) → it becomes an order on accept |
| See where a job is up to and what to do next | `/app/today`, or the job page from any order or quote |
| Reply to a customer so the answer comes back to the job | Job page → Activity → reply box |
| Convert an accepted quote by hand | Job page → Convert to order (asks for the delivery address) |
| Plan the week's production | `/app/production?tab=calendar` |
| Log a reject from this morning's misprint | Order detail → Rejects/spoilage widget |
| Photo of the print on the press | Order detail → Production photos widget (upload from phone) |
| Save settings that worked for a tricky job | `/app/production?tab=print-recipes` → New recipe → link to the order |
| Add a parent to receive order updates | Order detail → Watchers widget (or customer does it themselves) |
| Set a deposit + balance schedule | Order detail → Deposit & balance widget |
| Group order for a sports club | The club creates one via API; share the link they got back |
| Add a school as an org account | `/app/organisations` → New organisation → add members |
| Surface a finished job on the gallery | `/app/storefront/lookbook` → New tile → upload photo |
| See where waste is coming from | `/app/production?tab=rejects` |
| Audit a customer's interactions | Customer detail → Customer journey widget |
| Resend an accept link to a customer | Quote drawer → Email customer…, or Copy link and paste it into your reply |
| Generate a tax invoice | Customer side: `/account/orders/[id]` → Tax invoice button |
| Anonymise a customer (right to be forgotten) | Backend API only — not a button in admin (deliberate) |

---

## What's *not* in the admin yet

These features exist as backend infrastructure but don't have admin UI:

- **Right-to-be-forgotten** — there's a `POST /admin/customers/:id/anonymize` endpoint, but no button. Use a tool like `curl` or Postman when needed.
- **Mass design action (customizer)** — the modal component is built but not yet wired into the customizer template chrome. Drop it in when you're ready.
- **Inbound email** — the code is live; it switches on once the Resend receiving domain, webhook and Fly secrets are set (`Docs/ADMIN_WORKFLOW_CONSOLIDATION_2026_10.md` §9). Until then replies go to the shared inbox.

---

## When something looks wrong

1. **Check `/app/reports/system-health`** — quick view of cron statuses and external services.
2. **Check the Fly logs** (`fly logs --app sc-prints-backend`) — every cron + subscriber logs a one-liner on each run.
3. **Check the order's timeline widget** — every event the system captured for that order, newest first.
4. **Ask in `#production` Slack** — many alerts post there automatically.

---

## Glossary

- **Production stage** — Where the order is in the build pipeline (received / art_review / in_production / shipped / delivered).
- **Artwork stage** — Parallel track tracking the customer's artwork approval (pending / in_review / awaiting_approval / approved).
- **Blanks stage** — Parallel track tracking the supplier garment order (not_started / ordered / arrived).
- **LTV** — Lifetime value. Sum of order totals across non-cancelled orders.
- **NPS** — Net Promoter Score. Customer rates 1–5 after delivery.
- **Watcher** — Extra email address on an order that gets CC'd on stage-change emails.
- **Stale order** — Order whose production stage hasn't advanced in 3+ days.
- **Snooze** — A customer note with a future "remind me" date.
- **Org / organisation** — A school, club, business — a group of customers sharing identity.
- **Recipe** — Reusable production settings for a job (mesh count, ink, etc.).
- **Fulfillment order** — An order placed against a B2B org's pre-approved designs + locked garments. Tagged `metadata.fulfillment_order=true`. Filters separately from one-off orders.
- **Organisation design** — Pre-approved brand artwork for a fulfillment org. Carries a print file the customer never sees.
- **Destination** — A ship-to address in a fulfillment org's network. One org typically has many.
- **Inventory row** — One record per (design × garment) combo for a fulfillment org. Holds unit price, fulfillment mode, on_hand, reserved.
- **Held stock** — Fulfillment mode where pre-printed garments sit on our racks. Customer sees live on_hand.
- **Print on demand (PoD)** — Fulfillment mode where we print only when ordered. No stock held.
- **Over-allocation** — Ordering more than on_hand for a held_stock row. Allowed; auto-creates a print task for the deficit.
- **Primary contact** — The customer_id used as the order's customer-of-record on every fulfillment order. The actual placing member is preserved on `order.metadata.placed_by_customer_id`.

---

## Getting help

If something doesn't behave like this guide describes, the most likely causes are:

1. The relevant `*_ENABLED` env var is off.
2. The relevant email provider key isn't set.
3. The migration for a new feature hasn't run yet (boot the backend; it auto-migrates).

If none of those fix it, the technical context lives in [`/CLAUDE.md`](../CLAUDE.md) at the repo root, and the data-flow map is in [`BACKEND_FLOW.md`](./BACKEND_FLOW.md).
